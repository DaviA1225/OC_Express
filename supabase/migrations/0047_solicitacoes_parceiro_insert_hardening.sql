-- 0047 — Endurece o INSERT do parceiro em `solicitacoes`
--
-- Achado da varredura de 2026-07-21. A policy `solicitacoes_parceiro_insert`
-- (0018) só fixa `origem` e `parceiro_id`:
--
--   WITH CHECK (origem = 'parceiro' AND parceiro_id = get_current_parceiro_id())
--
-- Como o INSERT (ao contrário do UPDATE) não depende de policy de SELECT, ele é
-- o único caminho de escrita do parceiro que funciona de verdade contra a tabela
-- base — e ele aceita QUALQUER valor nas colunas que pertencem à operação
-- interna. Com o próprio JWT + anon key (ambos visíveis no navegador), um
-- parceiro consegue criar uma solicitação já `finalizada`, com `atendente_id` de
-- outra pessoa, `pdf_url` preenchido, flags de CT-e/MDF-e ligadas, etc. Não é
-- vazamento de dados (o parceiro continua sem SELECT), mas é escrita em campos
-- que a equipe interna assume como próprios: fura o fluxo operacional, suja
-- relatórios/TMA e envenena a trilha de auditoria.
--
-- Duas travas, em camadas:
--   1. WITH CHECK da policy de INSERT do parceiro passa a fixar o `status`.
--      (O UPDATE já estava coberto pela 0043; ver seção 1.)
--   2. Trigger BEFORE INSERT zera as colunas de domínio interno quando quem
--      insere NÃO é interno, e valida que `parceiro_usuario_id` pertence ao
--      parceiro da sessão (a constraint de origem exige a coluna preenchida, mas
--      nunca checou de quem ela é).
--
-- Fora de escopo (risco residual aceito, ver relatório): `numero_interno` é
-- `serial`, então o cliente pode informar um valor. É UNIQUE (não sobrescreve
-- nada), fica registrado no audit e não dá acesso a nada — trocar por
-- `GENERATED ALWAYS AS IDENTITY` exigiria cirurgia de sequence em tabela viva,
-- desproporcional ao ganho.
--
-- Idempotente.

-- ============================================================
-- 1. Policies: fixar o status
-- ============================================================
-- INSERT: o parceiro só cria em 'recebida' (é o que os dois caminhos do portal
-- — criar e duplicar — já mandam).
DROP POLICY IF EXISTS solicitacoes_parceiro_insert ON solicitacoes;
CREATE POLICY solicitacoes_parceiro_insert ON solicitacoes FOR INSERT TO authenticated
  WITH CHECK (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'recebida'
  );

-- UPDATE: nada a fazer. A 0043 já substituiu `solicitacoes_parceiro_cancel` por
-- `solicitacoes_parceiro_edit_cancel`, cujo WITH CHECK já limita o estado final a
-- ('recebida','cancelada'). A primeira versão desta migration recriou o nome
-- antigo por engano (leitura da 0018 sem conferir se algo posterior a
-- substituía), deixando DUAS policies permissivas de UPDATE no banco. Como
-- policies permissivas se somam por OR, isso não abria brecha, mas desfazia o
-- rename da 0043. O DROP abaixo limpa esse resíduo; a policy da 0043 continua
-- sendo a válida.
DROP POLICY IF EXISTS solicitacoes_parceiro_cancel ON solicitacoes;

-- ============================================================
-- 2. Trigger: colunas de domínio interno não vêm do cliente
-- ============================================================
-- Roda como o usuário que insere (não é SECURITY DEFINER): a checagem de
-- `parceiro_usuarios` usa a RLS do próprio parceiro, que enxerga apenas os
-- usuários da própria empresa. Um id de outro parceiro simplesmente não é
-- encontrado e o INSERT aborta.
CREATE OR REPLACE FUNCTION solicitacao_sanitizar_insert_externo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Interno cria pelo app interno com atendente_id, status etc. legítimos.
  IF is_interno() THEN
    RETURN NEW;
  END IF;

  -- Estado e trilha operacional pertencem à equipe interna.
  --
  -- ATENÇÃO ao mexer nesta lista: um `NEW.<coluna>` inexistente NÃO falha ao
  -- criar a função — só estoura em tempo de execução, com 42703, em TODO insert
  -- de parceiro. Confira contra o schema real antes de aplicar.
  NEW.status                    := 'recebida';
  NEW.atendente_id              := NULL;
  NEW.documentado_por           := NULL;
  NEW.documentado_em            := NULL;
  NEW.pdf_url                   := NULL;
  NEW.enviada_em                := NULL;
  NEW.finalizada_em             := NULL;
  NEW.numero_instrucao          := NULL;
  NEW.cte_emitido               := false;
  NEW.mdfe_emitido              := false;
  NEW.vale_pedagio              := false;
  NEW.created_by                := auth.uid();
  -- `pamcard_status`/`pamcard_numero` são do parceiro (ele declara se tem cartão).
  -- Já "providenciar" é a ação rastreada da equipe interna: não vem do cliente.
  NEW.pamcard_providenciado_em  := NULL;
  NEW.pamcard_providenciado_por := NULL;
  -- Notas internas e o id de mensagem do WhatsApp são de uso exclusivo da operação.
  NEW.observacoes_internas      := NULL;
  NEW.external_msg_id           := NULL;

  -- `parceiro_usuario_id` alimenta "quem pediu" no app interno e nos relatórios.
  -- A constraint de origem (0018) exige a coluna preenchida, mas nunca checou se
  -- o usuário é do parceiro da sessão.
  IF NEW.parceiro_usuario_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM parceiro_usuarios
      WHERE id = NEW.parceiro_usuario_id
        AND parceiro_id = NEW.parceiro_id
    ) THEN
      RAISE EXCEPTION 'Usuario informado nao pertence a este parceiro.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION solicitacao_sanitizar_insert_externo() IS
  'Zera as colunas de dominio interno (status, atendente, pdf, flags, datas) em '
  'INSERTs feitos por quem nao e interno, e valida a posse de parceiro_usuario_id. '
  'A policy de INSERT do parceiro so fixava origem/parceiro_id (migration 0047).';

DROP TRIGGER IF EXISTS trg_solicitacoes_sanitizar_externo ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_sanitizar_externo
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION solicitacao_sanitizar_insert_externo();

NOTIFY pgrst, 'reload schema';
