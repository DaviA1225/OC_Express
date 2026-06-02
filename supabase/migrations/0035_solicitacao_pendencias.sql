-- 0035 — Loop de pendência: devolver solicitação ao parceiro e receber a volta
--
-- Hoje a comunicação parceiro <-> equipe interna é de mão única: quando o
-- veículo tem uma pendência que trava a finalização, a equipe não tem como
-- "devolver" a solicitação ao parceiro, e quando o parceiro resolve nada
-- aparece no SisLog. Esta migration cria a tabela `solicitacao_pendencias`
-- como overlay sobre a solicitação (NÃO mexe no enum `solicitacoes.status`,
-- preservando a máquina de estados, SLA e timeline).
--
-- Fluxo:
--   1. Interno cria uma pendência (motivo) -> status 'aberta'.
--   2. Parceiro vê no portal (sino + banner), resolve (resposta) -> 'resolvida'.
--   3. Interno é notificado no sino e continua a finalização.
--
-- Segurança: o parceiro NÃO tem SELECT em `solicitacoes` (Bloco 1). Para o RLS
-- do parceiro funcionar sem recursão, denormalizamos `parceiro_id` na própria
-- pendência (mesmo padrão de parceiro_motoristas etc.). Um trigger BEFORE INSERT
-- preenche `parceiro_id`/`criada_por` a partir da solicitação — o cliente não
-- precisa (nem consegue forjar) esses campos.
--
-- Script idempotente: pode ser reexecutado sem erro.

-- ============================================================
-- 1. Tabela
-- ============================================================

CREATE TABLE IF NOT EXISTS solicitacao_pendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  -- Denormalizado a partir da solicitação (trigger). É a chave do RLS do parceiro.
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'resolvida')),
  resposta_parceiro text,
  criada_por uuid REFERENCES auth.users(id),
  resolvida_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolvida_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pendencias_solicitacao ON solicitacao_pendencias(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_parceiro ON solicitacao_pendencias(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_status ON solicitacao_pendencias(status);
-- No máximo UMA pendência aberta por solicitação.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pendencia_aberta_por_solicitacao
  ON solicitacao_pendencias(solicitacao_id) WHERE status = 'aberta';

-- ============================================================
-- 2. Triggers de preenchimento + updated_at + auditoria
-- ============================================================
-- BEFORE INSERT: deriva parceiro_id da solicitação (ignora o que o cliente
-- mandar) e marca criada_por = auth.uid(). Se a solicitação não for de parceiro
-- (parceiro_id NULL), o NOT NULL aborta — pendência só existe para origem
-- 'parceiro', que é o único caso onde o loop faz sentido.
CREATE OR REPLACE FUNCTION pendencia_preencher_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT parceiro_id INTO NEW.parceiro_id FROM solicitacoes WHERE id = NEW.solicitacao_id;
  NEW.criada_por := COALESCE(NEW.criada_por, auth.uid());
  NEW.status := 'aberta';
  NEW.resolvida_em := NULL;
  NEW.resolvida_por := NULL;
  RETURN NEW;
END;
$$;

-- BEFORE UPDATE: quando alguém move 'aberta' -> 'resolvida', carimba
-- resolvida_em/por no servidor (não confia no cliente).
CREATE OR REPLACE FUNCTION pendencia_carimbar_resolucao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'resolvida' AND OLD.status <> 'resolvida' THEN
    NEW.resolvida_em := now();
    NEW.resolvida_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pendencia_preencher ON solicitacao_pendencias;
CREATE TRIGGER trg_pendencia_preencher BEFORE INSERT ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION pendencia_preencher_insert();

DROP TRIGGER IF EXISTS trg_pendencia_resolucao ON solicitacao_pendencias;
CREATE TRIGGER trg_pendencia_resolucao BEFORE UPDATE ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION pendencia_carimbar_resolucao();

DROP TRIGGER IF EXISTS trg_pendencias_updated ON solicitacao_pendencias;
CREATE TRIGGER trg_pendencias_updated BEFORE UPDATE ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS aud_solicitacao_pendencias ON solicitacao_pendencias;
CREATE TRIGGER aud_solicitacao_pendencias
  AFTER INSERT OR UPDATE OR DELETE ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================
-- 3. RLS
-- ============================================================
-- Interno: tudo. Parceiro: lê as suas (parceiro_id) e só consegue a transição
-- 'aberta' -> 'resolvida' (resposta). Sem INSERT/DELETE pelo parceiro.

ALTER TABLE solicitacao_pendencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pendencias_interno_all ON solicitacao_pendencias;
DROP POLICY IF EXISTS pendencias_parceiro_select ON solicitacao_pendencias;
DROP POLICY IF EXISTS pendencias_parceiro_resolve ON solicitacao_pendencias;

CREATE POLICY pendencias_interno_all ON solicitacao_pendencias FOR ALL TO authenticated
  USING (is_interno()) WITH CHECK (is_interno());

CREATE POLICY pendencias_parceiro_select ON solicitacao_pendencias FOR SELECT TO authenticated
  USING (parceiro_id = get_current_parceiro_id());

-- Só aberta -> resolvida. O WITH CHECK trava o status final em 'resolvida';
-- combinado com o USING (status='aberta'), a única transição possível é
-- resolver. Editar o motivo continua tecnicamente possível para o parceiro,
-- mas é inócuo (a equipe é a fonte da verdade e vê tudo); o portal só envia
-- status + resposta_parceiro.
CREATE POLICY pendencias_parceiro_resolve ON solicitacao_pendencias FOR UPDATE TO authenticated
  USING (parceiro_id = get_current_parceiro_id() AND status = 'aberta')
  WITH CHECK (parceiro_id = get_current_parceiro_id() AND status = 'resolvida');

-- ============================================================
-- 4. Realtime
-- ============================================================
-- Para que devolução/resolução apareçam ao vivo nos dois apps (igual 0013).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'solicitacao_pendencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE solicitacao_pendencias;
  END IF;
END $$;

COMMENT ON TABLE solicitacao_pendencias IS
  'Overlay de pendências sobre a solicitação: a equipe devolve ao parceiro com '
  'um motivo (aberta) e o parceiro resolve (resolvida). Não altera '
  'solicitacoes.status. parceiro_id é denormalizado para o RLS do parceiro.';
