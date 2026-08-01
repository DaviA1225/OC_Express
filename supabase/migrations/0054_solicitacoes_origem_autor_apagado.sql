-- 0054 — Excluir usuario do parceiro esbarrava na constraint de origem
--
-- Sintoma: excluir um usuario na tela /cadastros/parceiros/:id/usuarios (ou na
-- de usuarios do portal) devolvia
--
--   new row for relation "solicitacoes" violates check constraint
--   "solicitacoes_origem_integridade"
--
-- Duas regras deste mesmo banco se contradiziam:
--
--   * A 0031 trocou `solicitacoes.parceiro_usuario_id` para ON DELETE SET NULL,
--     com a intencao explicita de PRESERVAR a solicitacao no historico e apenas
--     anular a referencia ao usuario apagado.
--   * A 0018 (recriada pela 0034) exige, no CHECK de origem, que
--     `origem = 'parceiro'` tenha `parceiro_usuario_id IS NOT NULL`.
--
-- Ou seja: o SET NULL que a 0031 dispara e exatamente o estado que o CHECK
-- proibe. Excluir usuario so funcionava para quem NUNCA criou solicitacao — por
-- isso o conflito passou despercebido desde a 0031. Nao havia risco de dado
-- corrompido: a transacao inteira abortava.
--
-- Decisao: a 0031 esta certa. Perder o autor de uma solicitacao antiga e o
-- comportamento desejado quando a pessoa sai do parceiro; o resto do rastro
-- (parceiro, motorista, veiculo, datas, numero) continua intacto. O CHECK passa
-- a aceitar `parceiro_usuario_id` nulo em linha de parceiro, com um unico
-- significado: AUTOR APAGADO.
--
-- A garantia que o CHECK dava no INSERT nao se perde — ela desce para o trigger
-- da 0047 (`solicitacao_sanitizar_insert_externo`), que ja roda BEFORE INSERT em
-- solicitacoes e ja valida a POSSE de `parceiro_usuario_id`. Passa a exigir
-- tambem a PRESENCA. Efeito liquido:
--
--   INSERT  origem='parceiro' sem autor  -> continua barrado (agora no trigger)
--   UPDATE/SET NULL do FK ao apagar autor -> passa a ser permitido
--
-- Risco residual aceito: como o CHECK nao distingue "anulado pelo FK" de
-- "anulado por UPDATE", um parceiro com UPDATE na propria linha (policy da 0043,
-- limitada a recebida/cancelada) poderia zerar o proprio `parceiro_usuario_id` e
-- se desvincular de uma solicitacao. Fica registrado no log de auditoria, e o
-- `parceiro_id` — que e o que manda no faturamento e na RLS — continua travado.
--
-- Idempotente.

-- ============================================================
-- 1. CHECK de origem: autor pode ser nulo em linha de parceiro
-- ============================================================
-- Copia fiel da versao da 0034, com uma unica alteracao: a linha
-- `AND parceiro_usuario_id IS NOT NULL` sai do ramo `origem = 'parceiro'`.
-- O ramo `origem <> 'parceiro'` continua exigindo NULL — solicitacao interna ou
-- de e-mail nunca aponta para cadastro de parceiro.
--
-- Continua NOT VALID pelo mesmo motivo da 0034: evita o scan e o lock da tabela
-- viva. E seguro por construcao — esta constraint e ESTRITAMENTE mais permissiva
-- que a anterior, entao toda linha que ja passava continua passando.

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_integridade;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_integridade
  CHECK (
    (origem = 'parceiro'
      AND parceiro_id IS NOT NULL
      AND parceiro_motorista_id IS NOT NULL
      AND parceiro_veiculo_id IS NOT NULL
      AND motorista_id IS NULL
      AND veiculo_id IS NULL
      AND carreta_id IS NULL
      AND primeira_carreta_id IS NULL
      AND dolly_id IS NULL
      AND subcontratada_id IS NULL)
    OR
    (origem <> 'parceiro'
      AND parceiro_id IS NULL
      AND parceiro_usuario_id IS NULL
      AND parceiro_motorista_id IS NULL
      AND parceiro_veiculo_id IS NULL
      AND parceiro_carreta_id IS NULL
      AND parceiro_primeira_carreta_id IS NULL
      AND parceiro_dolly_id IS NULL
      AND parceiro_subcontratada_id IS NULL)
  ) NOT VALID;

COMMENT ON CONSTRAINT solicitacoes_origem_integridade ON solicitacoes IS
  'Solicitacao de parceiro usa apenas referencias parceiro_*; interna/e-mail nao '
  'usa nenhuma. parceiro_usuario_id NULO em linha de parceiro significa AUTOR '
  'APAGADO (ON DELETE SET NULL da 0031); a presenca no INSERT e exigida pelo '
  'trigger solicitacao_sanitizar_insert_externo (0047/0054).';

-- ============================================================
-- 2. Trigger da 0047 herda a exigencia no INSERT
-- ============================================================
-- Mesmo corpo da 0047 com um bloco novo no topo. Fica ANTES do early return de
-- `is_interno()` de proposito: o CHECK antigo valia para todo mundo, e a regra
-- e sobre a FORMA da linha, nao sobre quem escreve. O app interno nunca cria
-- `origem='parceiro'`, entao na pratica isso nao muda nada para ele.
--
-- ATENCAO (nota preservada da 0047): um `NEW.<coluna>` inexistente NAO falha ao
-- criar a funcao — so estoura em tempo de execucao, com 42703, em TODO insert de
-- parceiro. Confira contra o schema real antes de aplicar.

CREATE OR REPLACE FUNCTION solicitacao_sanitizar_insert_externo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Presenca do autor: era garantida pelo CHECK de origem ate a 0054, que
  -- afrouxou a coluna para permitir o SET NULL da 0031 (autor apagado). No
  -- INSERT a exigencia continua de pe.
  IF NEW.origem = 'parceiro' AND NEW.parceiro_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Solicitacao de parceiro exige parceiro_usuario_id.'
      USING ERRCODE = '23514';
  END IF;

  -- Interno cria pelo app interno com atendente_id, status etc. legitimos.
  IF is_interno() THEN
    RETURN NEW;
  END IF;

  -- Estado e trilha operacional pertencem a equipe interna.
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
  -- `pamcard_status`/`pamcard_numero` sao do parceiro (ele declara se tem cartao).
  -- Ja "providenciar" e a acao rastreada da equipe interna: nao vem do cliente.
  NEW.pamcard_providenciado_em  := NULL;
  NEW.pamcard_providenciado_por := NULL;
  -- Notas internas e o id de mensagem do WhatsApp sao de uso exclusivo da operacao.
  NEW.observacoes_internas      := NULL;
  NEW.external_msg_id           := NULL;

  -- Posse do autor: o id informado precisa ser do parceiro da sessao. Roda como
  -- o usuario que insere (nao e SECURITY DEFINER), entao a RLS do parceiro so
  -- enxerga os usuarios da propria empresa.
  -- O IS NOT NULL continua aqui de proposito: o bloco de presenca la em cima so
  -- cobre `origem='parceiro'`, e nao ha por que transformar coluna nula em erro
  -- de posse em qualquer outro caminho.
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
  'INSERTs feitos por quem nao e interno, e valida presenca e posse de '
  'parceiro_usuario_id (migrations 0047 e 0054).';

-- Recriado tambem aqui para o caso de o trigger nao existir no destino; se ja
-- existe, o CREATE OR REPLACE da funcao acima ja bastaria.
DROP TRIGGER IF EXISTS trg_solicitacoes_sanitizar_externo ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_sanitizar_externo
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION solicitacao_sanitizar_insert_externo();

NOTIFY pgrst, 'reload schema';
