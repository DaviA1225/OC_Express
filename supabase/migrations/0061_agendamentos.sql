-- 0061 — Modulo de Agendamentos (docs/SPEC-AGENDAMENTOS.md)
--
-- Digitaliza a solicitacao de agendamento de descarga em terminal, hoje feita
-- por WhatsApp: o parceiro manda foto da NF e uma data, a equipe agenda no
-- sistema do terminal e devolve o comprovante em PDF.
--
-- Decisoes que o schema materializa (secao 2 da SPEC):
--   * agendamento e SEMPRE filho de uma solicitacao (solicitacao_id NOT NULL) —
--     motorista, placa, cliente e subcontratada ja vem preenchidos;
--   * a NF nasce no carregamento, entao o agendamento e evento POSTERIOR a
--     saida da carga (as RPCs do portal exigem status oc_enviada/finalizada);
--   * data desejada e PREFERENCIA: agenda-se na data pedida ou na mais proxima,
--     sem justificativa — por isso pedido e confirmado convivem na mesma linha;
--   * reagendar NAO sobrescreve: cria linha nova apontando para a anterior via
--     `substitui_agendamento_id`, e a anterior vira 'substituido' (mesmo
--     vocabulario do `substituido_por` previsto para `embarques`);
--   * o que exige agendamento e atributo do CLIENTE, nao da rota.
--
-- Limitacao assumida (SPEC 3.1.2): a vaga vive no sistema do terminal e outras
-- transportadoras tambem ocupam slots. O SisLog nunca sabe se um horario esta
-- cheio; ele so oferece horarios que EXISTEM e mostra a ocupacao da propria LHG
-- como referencia. A conferencia final continua no sistema do terminal.
--
-- Idempotente: pode ser reexecutada sem erro.

-- ============================================================
-- 1. Clientes que exigem agendamento
-- ============================================================
-- Quatro casos hoje: A.B/CSN (Pindamonhangaba), TCI (Itutinga), ArcelorMittal
-- (Juiz de Fora) e Metalsider (Betim). Ficam em `clientes` e nao em `rotas`
-- para nao acoplar este modulo ao de Embarques (SPEC 2.5).

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS requer_agendamento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal_nome text,
  ADD COLUMN IF NOT EXISTS antecedencia_minima_horas integer,
  ADD COLUMN IF NOT EXISTS observacoes_agendamento text;

COMMENT ON COLUMN clientes.requer_agendamento IS
  'Descarga neste cliente exige agendamento previo no sistema do terminal.';
COMMENT ON COLUMN clientes.terminal_nome IS
  'Nome do terminal/destino como a equipe o chama (ex.: "CSN Pindamonhangaba").';
COMMENT ON COLUMN clientes.antecedencia_minima_horas IS
  'Antecedencia minima exigida pelo terminal. NULL = sem regra conhecida.';

-- ============================================================
-- 2. Grade de horarios do terminal (terminal_janelas)
-- ============================================================
-- Agendamento e por hora marcada, em slots discretos com capacidade — nao e
-- horario livre. Existem DOIS padroes de grade, nao um:
--
--   TCI / ArcelorMittal / Metalsider : 08..16, 1 h, 4 vagas  -> 36/dia
--   A.B / CSN Pindamonhangaba        : 06, 13, 19, 6 h, 10   -> 30/dia
--
-- Duas colunas janela_inicio/janela_fim nao representam isso; por isso uma
-- linha por slot. As capacidades diarias na mesma ordem de grandeza (36 x 30)
-- dao um teste de sanidade: seed que fuja muito disso foi cadastrado errado.

CREATE TABLE IF NOT EXISTS terminal_janelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  hora time NOT NULL,
  duracao_minutos integer NOT NULL DEFAULT 60,
  capacidade integer,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (cliente_id, hora)
);

CREATE INDEX IF NOT EXISTS idx_terminal_janelas_cliente
  ON terminal_janelas(cliente_id) WHERE ativo = true;

DROP TRIGGER IF EXISTS trg_terminal_janelas_updated ON terminal_janelas;
CREATE TRIGGER trg_terminal_janelas_updated BEFORE UPDATE ON terminal_janelas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS aud_terminal_janelas ON terminal_janelas;
CREATE TRIGGER aud_terminal_janelas
  AFTER INSERT OR UPDATE OR DELETE ON terminal_janelas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

COMMENT ON TABLE terminal_janelas IS
  'Grade de slots de cada terminal (uma linha por horario). Capacidade e da '
  'LHG apenas como referencia: a vaga real vive no sistema do terminal.';

-- ============================================================
-- 3. Tabela agendamentos
-- ============================================================

CREATE TABLE IF NOT EXISTS agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_interno serial UNIQUE NOT NULL,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  -- Denormalizado pelo trigger a partir da solicitacao: e a chave do RLS do
  -- parceiro, que nao tem SELECT em `solicitacoes` (mesmo padrao da 0035).
  parceiro_id uuid REFERENCES parceiros(id) ON DELETE CASCADE,
  parceiro_usuario_id uuid REFERENCES parceiro_usuarios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'solicitado',

  -- Pedido do solicitante
  data_preferida date NOT NULL,
  hora_preferida time,                      -- NULL = qualquer horario
  observacoes text,

  -- Nota fiscal (automatica quando o modulo de Embarques existir)
  nota_fiscal text,
  nota_fiscal_origem text,

  -- Confirmacao do terminal
  data_agendada date,
  hora_agendada time,
  hora_fora_da_grade boolean NOT NULL DEFAULT false,
  comprovante_path text,
  nf_pdf_path text,

  -- Reagendamento
  substitui_agendamento_id uuid REFERENCES agendamentos(id) ON DELETE SET NULL,
  motivo_reagendamento text,

  -- Trava de concorrencia e carimbos
  assumido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assumido_em timestamptz,
  agendado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agendado_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Constraints ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_status_check') THEN
    ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_status_check
      CHECK (status IN ('solicitado','em_andamento','agendado','substituido','cancelado'));
  END IF;

  -- Concluido exige data, hora e comprovante. Sem isso, 'agendado' seria um
  -- estado que nao prova nada — e o comprovante do terminal e a prova final.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_agendado_completo') THEN
    ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_agendado_completo
      CHECK (
        status <> 'agendado'
        OR (data_agendada IS NOT NULL
            AND hora_agendada IS NOT NULL
            AND comprovante_path IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_nf_origem_check') THEN
    ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_nf_origem_check
      CHECK (nota_fiscal_origem IS NULL OR nota_fiscal_origem IN ('automatica','manual'));
  END IF;
END $$;

-- Indices -------------------------------------------------------------------
-- No maximo UM agendamento vivo por solicitacao. E este indice que obriga o
-- reagendamento a passar pela RPC: ela marca a anterior como 'substituido' e
-- insere a nova na MESMA transacao.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_ativo_por_solicitacao
  ON agendamentos(solicitacao_id)
  WHERE status IN ('solicitado','em_andamento','agendado');

CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_parceiro ON agendamentos(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_solicitacao ON agendamentos(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_fila
  ON agendamentos(created_at) WHERE status IN ('solicitado','em_andamento');
-- Ocupacao por slot (contagem da propria LHG exibida no portal e no interno).
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_agendada
  ON agendamentos(data_agendada, hora_agendada) WHERE status = 'agendado';

COMMENT ON TABLE agendamentos IS
  'Pedido de agendamento de descarga em terminal, sempre filho de uma '
  'solicitacao. Pedido (data_preferida/hora_preferida) e confirmado '
  '(data_agendada/hora_agendada) convivem na linha: divergir e rotina.';
COMMENT ON COLUMN agendamentos.hora_fora_da_grade IS
  'Calculado no servidor ao concluir: a hora confirmada nao existe na grade '
  'ativa do terminal. Aviso, nao bloqueio — excecoes acontecem.';

-- ============================================================
-- 4. Trigger de preenchimento (INSERT)
-- ============================================================
-- Mesmo espirito da 0035 (deriva o dono) e da 0047 (zera campo de dominio
-- interno vindo de fora): o cliente nao informa nem consegue forjar
-- parceiro_id, status ou os carimbos de conclusao.

CREATE OR REPLACE FUNCTION agendamento_preencher_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_requer boolean;
BEGIN
  -- LEFT JOIN de proposito: solicitacao sem cliente tem que cair no "nao exige
  -- agendamento" abaixo, e nao sumir do resultado e virar "nao encontrada".
  SELECT s.parceiro_id, c.requer_agendamento
    INTO NEW.parceiro_id, v_cliente_requer
    FROM solicitacoes s
    LEFT JOIN clientes c ON c.id = s.cliente_id
   WHERE s.id = NEW.solicitacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = '23503';
  END IF;

  IF v_cliente_requer IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta rota nao exige agendamento.' USING ERRCODE = '23514';
  END IF;

  -- Quem pediu: o usuario de parceiro logado, quando houver. Agendamento
  -- criado pela equipe (motorista que mandou WhatsApp direto) fica NULL.
  IF NEW.parceiro_usuario_id IS NULL THEN
    SELECT pu.id INTO NEW.parceiro_usuario_id
      FROM parceiro_usuarios pu
     WHERE pu.user_id = auth.uid() AND pu.ativo = true
     LIMIT 1;
  END IF;

  NEW.created_by         := auth.uid();
  NEW.status             := 'solicitado';
  NEW.assumido_por       := NULL;
  NEW.assumido_em        := NULL;
  NEW.agendado_por       := NULL;
  NEW.agendado_em        := NULL;
  NEW.data_agendada      := NULL;
  NEW.hora_agendada      := NULL;
  NEW.hora_fora_da_grade := false;
  NEW.comprovante_path   := NULL;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Trigger de transicao (UPDATE)
-- ============================================================
--   solicitado ──assumir──> em_andamento ──concluir──> agendado
--        │                       │                        │
--        └───────────────────────┴──────cancelar────> cancelado
--   agendado ──reagendar──> substituido (+ nova linha 'solicitado')
--
-- em_andamento -> solicitado existe de proposito: e a devolucao a fila, tanto
-- manual quanto a do item travado ha mais de 2 h por alguem que saiu.

CREATE OR REPLACE FUNCTION agendamento_transicao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok    boolean;
  v_slots integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_ok := CASE OLD.status
      WHEN 'solicitado'   THEN NEW.status IN ('em_andamento','cancelado')
      WHEN 'em_andamento' THEN NEW.status IN ('agendado','solicitado','cancelado')
      WHEN 'agendado'     THEN NEW.status IN ('substituido','cancelado')
      ELSE false  -- 'substituido' e 'cancelado' sao terminais
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Transicao invalida de % para %.', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'em_andamento' AND OLD.status <> 'em_andamento' THEN
    NEW.assumido_por := COALESCE(auth.uid(), NEW.assumido_por);
    NEW.assumido_em  := now();
  END IF;

  IF NEW.status = 'solicitado' AND OLD.status = 'em_andamento' THEN
    NEW.assumido_por := NULL;
    NEW.assumido_em  := NULL;
  END IF;

  IF NEW.status = 'agendado' AND OLD.status <> 'agendado' THEN
    NEW.agendado_por := COALESCE(auth.uid(), NEW.agendado_por);
    NEW.agendado_em  := now();

    -- Aviso de horario fora da grade, calculado aqui e nao no front: o
    -- comprovante do terminal e a prova final, mas a excecao fica registrada.
    -- Terminal sem grade cadastrada nao gera aviso — seria ruido, nao sinal.
    SELECT count(*) INTO v_slots
      FROM terminal_janelas tj
      JOIN solicitacoes s ON s.cliente_id = tj.cliente_id
     WHERE s.id = NEW.solicitacao_id AND tj.ativo = true;

    IF v_slots = 0 THEN
      NEW.hora_fora_da_grade := false;
    ELSE
      NEW.hora_fora_da_grade := NOT EXISTS (
        SELECT 1
          FROM terminal_janelas tj
          JOIN solicitacoes s ON s.cliente_id = tj.cliente_id
         WHERE s.id = NEW.solicitacao_id
           AND tj.ativo = true
           AND tj.hora = NEW.hora_agendada
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_preencher ON agendamentos;
CREATE TRIGGER trg_agendamento_preencher BEFORE INSERT ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION agendamento_preencher_insert();

DROP TRIGGER IF EXISTS trg_agendamento_transicao ON agendamentos;
CREATE TRIGGER trg_agendamento_transicao BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION agendamento_transicao();

DROP TRIGGER IF EXISTS trg_agendamentos_updated ON agendamentos;
CREATE TRIGGER trg_agendamentos_updated BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS aud_agendamentos ON agendamentos;
CREATE TRIGGER aud_agendamentos
  AFTER INSERT OR UPDATE OR DELETE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================
-- 6. RLS
-- ============================================================
-- O parceiro NAO recebe INSERT/UPDATE direto: escreve pelas RPCs da secao 8,
-- seguindo a 0044 — sem SELECT em `solicitacoes`, UPDATE direto afetaria zero
-- linhas em silencio. O SELECT existe (e nao so a view) porque e ele que
-- habilita o Realtime do portal.
--
-- Nenhuma coluna de `agendamentos` e de uso interno exclusivo: por isso o
-- parceiro pode ler a linha inteira sem view intermediaria. O aviso de horario
-- fora da grade e um booleano, nao texto livre da equipe — foi desenhado assim
-- justamente para caber aqui.

ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_janelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agendamentos_interno_all ON agendamentos;
DROP POLICY IF EXISTS agendamentos_parceiro_select ON agendamentos;

CREATE POLICY agendamentos_interno_all ON agendamentos FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));

CREATE POLICY agendamentos_parceiro_select ON agendamentos FOR SELECT TO authenticated
  USING (parceiro_id = (SELECT get_current_parceiro_id()));

DROP POLICY IF EXISTS terminal_janelas_interno_all ON terminal_janelas;
DROP POLICY IF EXISTS terminal_janelas_leitura ON terminal_janelas;

CREATE POLICY terminal_janelas_interno_all ON terminal_janelas FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));

-- Horario de funcionamento de terminal nao e dado sensivel, e o portal precisa
-- dele para montar a grade de slots do modal.
CREATE POLICY terminal_janelas_leitura ON terminal_janelas FOR SELECT TO authenticated
  USING (ativo = true);

-- ============================================================
-- 7. Storage: bucket privado agendamentos-docs
-- ============================================================
-- Dois tipos de arquivo: comprovante do terminal e PDF da NF.
-- Caminho: {agendamento_id}/{tipo}-{timestamp}.pdf
--
-- Diferente de `ocs-pdf`, o parceiro PODE ler os proprios comprovantes — o
-- comprovante e justamente o que ele precisa receber de volta. Escrita e so da
-- equipe interna. Download sempre por signed URL curta.

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('agendamentos-docs', 'agendamentos-docs', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem privilegio para criar o bucket agendamentos-docs via SQL. '
               'Crie-o PRIVADO pelo Dashboard (Storage -> New bucket).';
END $$;

CREATE OR REPLACE FUNCTION storage_agendamento_pertence_ao_parceiro_logado(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM agendamentos
     WHERE id::text = split_part(p_name, '/', 1)
       AND parceiro_id IS NOT NULL
       AND parceiro_id = get_current_parceiro_id()
  );
$$;

DROP POLICY IF EXISTS "agendamentos_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "agendamentos_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "agendamentos_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "agendamentos_docs_delete" ON storage.objects;

CREATE POLICY "agendamentos_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agendamentos-docs' AND (
      (SELECT is_interno())
      OR storage_agendamento_pertence_ao_parceiro_logado(name)
    )
  );

CREATE POLICY "agendamentos_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agendamentos-docs' AND (SELECT is_interno()));

CREATE POLICY "agendamentos_docs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'agendamentos-docs' AND (SELECT is_interno()));

CREATE POLICY "agendamentos_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'agendamentos-docs' AND (SELECT is_interno()));

-- ============================================================
-- 8. clientes_publicos ganha as colunas de agendamento
-- ============================================================
-- O portal precisa saber se o destino exige agendamento e qual a antecedencia
-- para decidir se mostra o botao e ate onde travar o seletor de data. O
-- parceiro nao tem SELECT em `clientes`; a via existente para isso e esta view.
--
-- Nada de sensivel entra: nome do terminal, se exige agendamento, antecedencia
-- e a observacao que e justamente para quem agenda ler. Frete, liberacao e
-- observacoes internas continuam de fora.
--
-- CREATE OR REPLACE VIEW so aceita ACRESCENTAR colunas no fim — e o que
-- fazemos; a ordem das quatro primeiras nao muda.

CREATE OR REPLACE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf,
       requer_agendamento, terminal_nome,
       antecedencia_minima_horas, observacoes_agendamento
FROM clientes
WHERE ativo = true
  AND cliente_minerio = true;

GRANT SELECT ON clientes_publicos TO authenticated;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos de minerio com colunas seguras para o Portal de Parceiros. '
  'Clientes de retorno (cliente_minerio=false) sao filtrados — so a LHG carrega '
  'retorno. Inclui os campos de agendamento (0061), que o portal usa para '
  'decidir se oferece o pedido e qual antecedencia exigir.';

-- ============================================================
-- 9. RPCs
-- ============================================================

-- ---------- 9.1 Ocupacao da propria LHG por slot ----------
-- O SisLog NAO conhece a disponibilidade real (SPEC 3.1.2). Isto e referencia
-- parcial e a UI a rotula como tal: "2 veiculos nossos neste horario — a vaga
-- final depende do terminal".
--
-- SECURITY DEFINER porque o parceiro so enxerga os proprios agendamentos: a
-- contagem tem que somar os de todo mundo para servir de referencia. Devolve
-- numeros agregados, nunca linhas.

CREATE OR REPLACE FUNCTION agendamentos_ocupacao_slot(
  p_cliente_id uuid,
  p_data date
)
RETURNS TABLE (hora time, duracao_minutos integer, capacidade integer, ocupados integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT tj.hora,
         tj.duracao_minutos,
         tj.capacidade,
         (SELECT count(*)::integer
            FROM agendamentos a
            JOIN solicitacoes s ON s.id = a.solicitacao_id
           WHERE a.status = 'agendado'
             AND a.data_agendada = p_data
             AND a.hora_agendada = tj.hora
             AND s.cliente_id = p_cliente_id) AS ocupados
    FROM terminal_janelas tj
   WHERE tj.cliente_id = p_cliente_id
     AND tj.ativo = true
   ORDER BY tj.hora;
$$;

-- ---------- 9.2 Grade padrao de um terminal ----------
-- O seed por `razao_social` e frageil (a base tem grafias divergentes para o
-- mesmo cliente: 'A. B. OPERADORA DE TERMINAIS L', ' Estoque-A. B. OPERADORA
-- DE TE'). Esta funcao existe para a tela de cadastro aplicar a grade ao
-- cliente CERTO, escolhido por id, em vez de adivinhar por texto.
--   'horaria'      -> 08:00..16:00, 1 h, 4 vagas   (TCI, Arcelor, Metalsider)
--   'janela_longa' -> 06/13/19, 6 h, 10 vagas      (A.B / CSN)

CREATE OR REPLACE FUNCTION terminal_aplicar_grade_padrao(
  p_cliente_id uuid,
  p_modelo text
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_inseridos integer := 0;
BEGIN
  IF p_modelo = 'horaria' THEN
    INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade, created_by)
    SELECT p_cliente_id, g.h::time, 60, 4, auth.uid()
      FROM generate_series(timestamp '2000-01-01 08:00',
                           timestamp '2000-01-01 16:00',
                           interval '1 hour') AS g(h)
    ON CONFLICT (cliente_id, hora) DO NOTHING;
  ELSIF p_modelo = 'janela_longa' THEN
    INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade, created_by)
    SELECT p_cliente_id, g.h, 360, 10, auth.uid()
      FROM (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
    ON CONFLICT (cliente_id, hora) DO NOTHING;
  ELSE
    RAISE EXCEPTION 'Modelo de grade invalido: % (use horaria ou janela_longa).', p_modelo
      USING ERRCODE = '22023';
  END IF;

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RETURN v_inseridos;
END;
$$;

-- ---------- 9.3 Nucleo do reagendamento ----------
-- Uma transacao: a anterior vira 'substituido' e a nova nasce 'solicitado'
-- apontando para ela. O indice unico parcial garante que ninguem consiga fazer
-- isso "na mao" em dois passos e deixe duas vivas.
--
-- Sem GRANT: so e chamavel de dentro das duas RPCs abaixo, que fazem a
-- autorizacao. Uma funcao DEFINER sem checagem de permissao nao pode ser
-- exposta a `authenticated`.

CREATE OR REPLACE FUNCTION agendamento_reagendar_core(
  p_agendamento_id uuid,
  p_motivo text,
  p_nova_data date,
  p_nova_hora time
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_antigo agendamentos%ROWTYPE;
  v_novo   uuid;
BEGIN
  SELECT * INTO v_antigo FROM agendamentos WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado.' USING ERRCODE = 'PT404';
  END IF;
  IF v_antigo.status <> 'agendado' THEN
    RAISE EXCEPTION 'So um agendamento ja confirmado pode ser reagendado.'
      USING ERRCODE = 'PT409';
  END IF;
  IF p_nova_data IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data desejada.' USING ERRCODE = '22004';
  END IF;

  UPDATE agendamentos
     SET status = 'substituido',
         motivo_reagendamento = COALESCE(NULLIF(btrim(p_motivo), ''), motivo_reagendamento)
   WHERE id = p_agendamento_id;

  INSERT INTO agendamentos (
    solicitacao_id, data_preferida, hora_preferida, observacoes,
    nota_fiscal, nota_fiscal_origem,
    substitui_agendamento_id, motivo_reagendamento
  ) VALUES (
    v_antigo.solicitacao_id, p_nova_data, p_nova_hora, v_antigo.observacoes,
    v_antigo.nota_fiscal, v_antigo.nota_fiscal_origem,
    p_agendamento_id, NULLIF(btrim(p_motivo), '')
  )
  RETURNING id INTO v_novo;

  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION agendamento_reagendar_core(uuid, text, date, time) FROM public, anon, authenticated;

-- ---------- 9.4 Portal: solicitar agendamento ----------

CREATE OR REPLACE FUNCTION portal_solicitar_agendamento(
  p_solicitacao_id uuid,
  p_data_preferida date,
  p_hora_preferida time,
  p_observacoes text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_parceiro    uuid := get_current_parceiro_id();
  v_status      text;
  v_cliente     uuid;
  v_requer      boolean;
  v_antecedencia integer;
  v_min_data    date;
  v_slots       integer;
  v_id          uuid;
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;

  SELECT s.status, s.cliente_id, c.requer_agendamento, c.antecedencia_minima_horas
    INTO v_status, v_cliente, v_requer, v_antecedencia
    FROM solicitacoes s
    LEFT JOIN clientes c ON c.id = s.cliente_id
   WHERE s.id = p_solicitacao_id
     AND s.origem = 'parceiro'
     AND s.parceiro_id = v_parceiro;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'PT404';
  END IF;

  IF v_requer IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta rota nao exige agendamento.' USING ERRCODE = 'PT409';
  END IF;

  -- A NF nasce no carregamento: antes da OC enviada o pedido chegaria cedo
  -- demais, sem nota para levar ao terminal (SPEC 2.2 e questao 1).
  IF v_status NOT IN ('oc_enviada','finalizada') THEN
    RAISE EXCEPTION 'O agendamento so pode ser pedido depois que a carga sai (OC enviada).'
      USING ERRCODE = 'PT409';
  END IF;

  IF p_data_preferida IS NULL THEN
    RAISE EXCEPTION 'Informe a data desejada.' USING ERRCODE = '22004';
  END IF;

  -- Fuso explicito: o servidor roda em UTC e o front calcula a data minima no
  -- relogio local. Sem isto, das 21h em diante o SisLog recusaria uma data que
  -- a propria tela acabou de oferecer (mesmo motivo do dia-calendario da 0022).
  v_min_data := ((now() AT TIME ZONE 'America/Sao_Paulo')
                 + make_interval(hours => COALESCE(v_antecedencia, 0)))::date;
  IF p_data_preferida < v_min_data THEN
    RAISE EXCEPTION 'Este terminal exige % h de antecedencia.', COALESCE(v_antecedencia, 0)
      USING ERRCODE = 'PT422';
  END IF;

  -- Horario pedido tem que existir na grade do terminal (elimina pedidos
  -- impossiveis, como 07:30 no TCI). Terminal sem grade aceita qualquer hora.
  IF p_hora_preferida IS NOT NULL THEN
    SELECT count(*) INTO v_slots FROM terminal_janelas
     WHERE cliente_id = v_cliente AND ativo = true;
    IF v_slots > 0 AND NOT EXISTS (
      SELECT 1 FROM terminal_janelas
       WHERE cliente_id = v_cliente AND ativo = true AND hora = p_hora_preferida
    ) THEN
      RAISE EXCEPTION 'Horario indisponivel na grade deste terminal.' USING ERRCODE = 'PT422';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM agendamentos
     WHERE solicitacao_id = p_solicitacao_id
       AND status IN ('solicitado','em_andamento','agendado')
  ) THEN
    RAISE EXCEPTION 'Ja existe um agendamento em aberto para esta solicitacao.'
      USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO agendamentos (solicitacao_id, data_preferida, hora_preferida, observacoes)
  VALUES (p_solicitacao_id, p_data_preferida, p_hora_preferida, NULLIF(btrim(p_observacoes), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------- 9.5 Portal: cancelar agendamento ----------
-- So em 'solicitado'. Depois disso a equipe ja pode ter agendado no terminal,
-- e cancelar aqui deixaria o SisLog mentindo sobre o mundo real.

CREATE OR REPLACE FUNCTION portal_cancelar_agendamento(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;

  UPDATE agendamentos SET status = 'cancelado'
   WHERE id = p_id
     AND parceiro_id = v_parceiro
     AND status = 'solicitado';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado ou ja em atendimento pela equipe.'
      USING ERRCODE = 'PT409';
  END IF;

  RETURN p_id;
END;
$$;

-- ---------- 9.6 Portal: reagendar ----------

CREATE OR REPLACE FUNCTION portal_reagendar_agendamento(
  p_id uuid,
  p_motivo text,
  p_nova_data date,
  p_nova_hora time
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM agendamentos
     WHERE id = p_id AND parceiro_id = v_parceiro AND status = 'agendado'
  ) THEN
    RAISE EXCEPTION 'Agendamento nao encontrado ou nao reagendavel.' USING ERRCODE = 'PT409';
  END IF;

  RETURN agendamento_reagendar_core(p_id, p_motivo, p_nova_data, p_nova_hora);
END;
$$;

-- ---------- 9.7 Interno: reagendar ----------
-- Caso tipico: o terminal cancelou a janela ja confirmada.

CREATE OR REPLACE FUNCTION agendamento_reagendar(
  p_agendamento_id uuid,
  p_motivo text,
  p_nova_data date,
  p_nova_hora time
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_interno() THEN
    RAISE EXCEPTION 'Apenas a equipe interna pode reagendar por aqui.' USING ERRCODE = '42501';
  END IF;
  RETURN agendamento_reagendar_core(p_agendamento_id, p_motivo, p_nova_data, p_nova_hora);
END;
$$;

-- ---------- 9.8 Interno: assumir (trava de concorrencia) ----------
-- Numa equipe de 15 pessoas, sem isto duas pessoas agendam a mesma nota no
-- sistema do terminal. O UPDATE condicional resolve a corrida em uma unica
-- instrucao: quem chegar depois recebe PT409 e ve de quem e o card.
--
-- Item assumido ha mais de 2 h volta a ser assumivel — evita fila travada por
-- alguem que saiu no meio do expediente.

CREATE OR REPLACE FUNCTION agendamento_assumir(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE agendamentos
     SET status = 'em_andamento',
         assumido_por = auth.uid(),
         assumido_em = now()
   WHERE id = p_id
     AND (
       status = 'solicitado'
       OR (status = 'em_andamento' AND assumido_em < now() - interval '2 hours')
       OR (status = 'em_andamento' AND assumido_por = auth.uid())
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este agendamento ja esta com outra pessoa.' USING ERRCODE = 'PT409';
  END IF;

  RETURN p_id;
END;
$$;

-- ---------- 9.9 Permissoes ----------
REVOKE ALL ON FUNCTION agendamentos_ocupacao_slot(uuid, date) FROM public, anon;
REVOKE ALL ON FUNCTION terminal_aplicar_grade_padrao(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text) FROM public, anon;
REVOKE ALL ON FUNCTION portal_cancelar_agendamento(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION portal_reagendar_agendamento(uuid, text, date, time) FROM public, anon;
REVOKE ALL ON FUNCTION agendamento_reagendar(uuid, text, date, time) FROM public, anon;
REVOKE ALL ON FUNCTION agendamento_assumir(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION agendamentos_ocupacao_slot(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION terminal_aplicar_grade_padrao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cancelar_agendamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_reagendar_agendamento(uuid, text, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION agendamento_reagendar(uuid, text, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION agendamento_assumir(uuid) TO authenticated;

-- ============================================================
-- 10. Eventos do portal
-- ============================================================
-- Amplia o CHECK e a lista aceita por `registrar_evento_portal` (padrao das
-- 0023/0031/0043/0058). O corpo abaixo e o da 0058 — headers como fonte de IP
-- e user-agent, teto de metadata e rate limit no login falho — apenas com os
-- tres tipos novos na lista.

ALTER TABLE eventos_portal DROP CONSTRAINT IF EXISTS eventos_portal_tipo_evento_check;
ALTER TABLE eventos_portal ADD CONSTRAINT eventos_portal_tipo_evento_check
  CHECK (tipo_evento IN (
    'portal_login',
    'portal_login_falha',
    'portal_logout',
    'portal_solicitacao_criada',
    'portal_solicitacao_editada',
    'portal_solicitacao_cancelada',
    'portal_senha_alterada',
    'portal_usuario_convidado',
    'portal_usuario_excluido',
    'portal_agendamento_solicitado',
    'portal_agendamento_cancelado',
    'portal_agendamento_reagendado'
  ));

CREATE OR REPLACE FUNCTION registrar_evento_portal(p_tipo_evento text, p_payload jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_pu parceiro_usuarios%ROWTYPE;
  v_parceiro_id uuid; v_parceiro_usuario_id uuid; v_email_tentado text;
  v_solicitacao_id uuid; v_ip text; v_user_agent text; v_metadata jsonb;
  v_headers json; v_recentes int; v_id uuid;
BEGIN
  IF p_tipo_evento NOT IN ('portal_login','portal_login_falha','portal_logout',
    'portal_solicitacao_criada','portal_solicitacao_editada',
    'portal_solicitacao_cancelada','portal_senha_alterada',
    'portal_usuario_convidado','portal_usuario_excluido',
    'portal_agendamento_solicitado','portal_agendamento_cancelado',
    'portal_agendamento_reagendado') THEN
    RAISE EXCEPTION 'tipo_evento invalido: %', p_tipo_evento;
  END IF;

  BEGIN v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_user_agent := v_headers ->> 'user-agent';
  END IF;
  v_user_agent := left(COALESCE(v_user_agent, p_payload ->> 'user_agent'), 500);

  IF p_tipo_evento = 'portal_login_falha' AND v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_recentes FROM eventos_portal
     WHERE tipo_evento = 'portal_login_falha' AND ip = v_ip
       AND created_at > now() - interval '5 minutes';
    IF v_recentes >= 20 THEN RETURN NULL; END IF;  -- silencioso de proposito
  END IF;

  IF p_tipo_evento = 'portal_login_falha' THEN
    v_email_tentado := left(p_payload ->> 'email_tentado', 320);
  ELSE
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v_pu FROM parceiro_usuarios
      WHERE user_id = v_user_id AND ativo = true LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_parceiro_id := v_pu.parceiro_id; v_parceiro_usuario_id := v_pu.id;
  END IF;

  v_solicitacao_id := NULLIF(p_payload ->> 'solicitacao_id', '')::uuid;
  v_metadata := COALESCE(p_payload, '{}'::jsonb)
                - ARRAY['email_tentado','ip','user_agent','solicitacao_id'];
  IF v_metadata = '{}'::jsonb THEN v_metadata := NULL;
  ELSIF length(v_metadata::text) > 2048 THEN
    v_metadata := jsonb_build_object('truncado', true, 'motivo', 'metadata acima de 2KB',
                                     'bytes_originais', length(v_metadata::text));
  END IF;

  INSERT INTO eventos_portal (tipo_evento, user_id, parceiro_id, parceiro_usuario_id,
    email_tentado, solicitacao_id, ip, user_agent, metadata)
  VALUES (p_tipo_evento, v_user_id, v_parceiro_id, v_parceiro_usuario_id,
    v_email_tentado, v_solicitacao_id, v_ip, v_user_agent, v_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION registrar_evento_portal(text, jsonb) TO anon, authenticated;

-- ============================================================
-- 11. Registro de acesso a dado pessoal (LGPD art. 37)
-- ============================================================
-- Duas leituras novas em que dado pessoal SAI do sistema, ambas deste modulo:
--   * `abrir_documento_agendamento` — comprovante do terminal e PDF da NF
--     trazem nome de motorista, CPF e dados do veiculo;
--   * `copiar_cpf` — no painel de trabalho o CPF aparece mascarado e so e
--     revelado ao copiar (SPEC-AGENDAMENTOS 8). Sem este registro, a revelacao
--     seria justamente o acesso que nao deixa rastro.
-- Mesmo corpo da 0059, so a lista de acoes muda.

ALTER TABLE log_acesso DROP CONSTRAINT IF EXISTS log_acesso_acao_check;
ALTER TABLE log_acesso ADD CONSTRAINT log_acesso_acao_check
  CHECK (acao IN ('export_csv', 'download_oc_pdf', 'abrir_anexo',
                  'abrir_documento_agendamento', 'copiar_cpf'));

CREATE OR REPLACE FUNCTION registrar_acesso(
  p_acao    text,
  p_recurso text DEFAULT NULL,
  p_detalhe jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_headers json;
  v_ip      text;
  v_ua      text;
  v_origem  text;
  v_detalhe jsonb;
  v_id      uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN NULL;  -- sem sessao nao ha acesso a registrar
  END IF;

  IF p_acao NOT IN ('export_csv', 'download_oc_pdf', 'abrir_anexo',
                    'abrir_documento_agendamento', 'copiar_cpf') THEN
    RETURN NULL;  -- entrada invalida nao derruba o fluxo do usuario
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_ua := left(v_headers ->> 'user-agent', 500);
  END IF;

  v_origem := CASE WHEN is_interno() THEN 'interno' ELSE 'portal' END;

  v_detalhe := p_detalhe;
  IF v_detalhe IS NOT NULL AND length(v_detalhe::text) > 1024 THEN
    v_detalhe := jsonb_build_object('truncado', true);
  END IF;

  INSERT INTO log_acesso (usuario_id, acao, recurso, detalhe, ip, user_agent, origem)
  VALUES (v_user, p_acao, left(p_recurso, 120), v_detalhe, v_ip, v_ua, v_origem)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION registrar_acesso(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_acesso(text, text, jsonb) TO authenticated;

-- ============================================================
-- 12. Realtime
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agendamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agendamentos;
  END IF;
END $$;

-- ============================================================
-- 13. Seed da grade dos terminais
-- ============================================================
-- Roda apenas para clientes JA marcados com requer_agendamento = true. Em base
-- limpa nao faz nada, e e isso mesmo: marcar o cliente e decisao da equipe, na
-- tela de cadastro, onde da para escolher o registro certo por id.
--
-- Antes de rodar a mao, confira quais linhas cada LIKE alcanca — a base tem
-- grafias divergentes para o mesmo cliente:
--
--   SELECT id, razao_social, requer_agendamento FROM clientes
--    WHERE requer_agendamento = true ORDER BY razao_social;
--
-- Se houver ambiguidade, use `terminal_aplicar_grade_padrao(<id>, 'horaria')`
-- na tela, que nao depende de texto. Idempotente pelo ON CONFLICT.

-- Grade horaria: TCI, ArcelorMittal e Metalsider — 08:00 a 16:00, 1 h, 4 vagas
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT c.id, g.h::time, 60, 4
  FROM clientes c
  CROSS JOIN generate_series(
    timestamp '2000-01-01 08:00',
    timestamp '2000-01-01 16:00',
    interval '1 hour'
  ) AS g(h)
 WHERE c.requer_agendamento = true
   AND (upper(c.razao_social) LIKE '%TCI%'
     OR upper(c.razao_social) LIKE '%ARCELOR%'
     OR upper(c.razao_social) LIKE '%METALSIDER%')
ON CONFLICT (cliente_id, hora) DO NOTHING;

-- Janela longa: A.B / CSN — 06:00, 13:00 e 19:00, 6 h, 10 vagas
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT c.id, g.h, 360, 10
  FROM clientes c
  CROSS JOIN (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
 WHERE c.requer_agendamento = true
   AND (upper(c.razao_social) LIKE '%A. B.%'
     OR upper(c.razao_social) LIKE '%OPERADORA DE TERMINAIS%')
ON CONFLICT (cliente_id, hora) DO NOTHING;

NOTIFY pgrst, 'reload schema';
