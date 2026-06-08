-- 0039 — Portal de Parceiros: cadastro de cartões Pamcard
--
-- O parceiro passa a poder cadastrar seus cartões Pamcard no portal e, ao criar
-- uma solicitação ("Tem cartão"), escolher um cartão ja cadastrado em vez de
-- digitar o numero toda vez. O numero escolhido continua sendo gravado em
-- `solicitacoes.pamcard_numero` (sem FK) — esta tabela e' apenas a "agenda" de
-- cartões do parceiro.
--
-- Espelha o padrao das demais tabelas parceiro_* (0018): mesma estrutura de
-- colunas operacionais, triggers de updated_at + auditoria, e RLS "o parceiro
-- mexe nos seus; o interno le todos".
--
-- Idempotente (regra do projeto): pode ser reexecutada sem erro.

-- ============================================================
-- 1. Tabela
-- ============================================================

CREATE TABLE IF NOT EXISTS parceiro_pamcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  numero text NOT NULL,
  apelido text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (parceiro_id, numero)
);

-- O numero do Pamcard contem apenas 10 a 16 digitos (mesma regra de
-- solicitacoes.pamcard_numero, migration 0016).
ALTER TABLE parceiro_pamcards
  DROP CONSTRAINT IF EXISTS parceiro_pamcards_numero_formato;
ALTER TABLE parceiro_pamcards
  ADD CONSTRAINT parceiro_pamcards_numero_formato
  CHECK (numero ~ '^[0-9]{10,16}$');

CREATE INDEX IF NOT EXISTS idx_parceiro_pamcards_parceiro ON parceiro_pamcards(parceiro_id);

-- ============================================================
-- 2. Triggers (updated_at + auditoria)
-- ============================================================

DROP TRIGGER IF EXISTS trg_parceiro_pamcards_updated ON parceiro_pamcards;
CREATE TRIGGER trg_parceiro_pamcards_updated
  BEFORE UPDATE ON parceiro_pamcards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS aud_parceiro_pamcards ON parceiro_pamcards;
CREATE TRIGGER aud_parceiro_pamcards
  AFTER INSERT OR UPDATE OR DELETE ON parceiro_pamcards
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================
-- 3. RLS — parceiro mexe nos seus; interno le todos
-- ============================================================

ALTER TABLE parceiro_pamcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_select ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_insert ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_update ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_delete ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_interno_select ON parceiro_pamcards;
CREATE POLICY parceiro_pamcards_parceiro_select ON parceiro_pamcards FOR SELECT TO authenticated
  USING (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_parceiro_insert ON parceiro_pamcards FOR INSERT TO authenticated
  WITH CHECK (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_parceiro_update ON parceiro_pamcards FOR UPDATE TO authenticated
  USING (parceiro_id = get_current_parceiro_id()) WITH CHECK (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_parceiro_delete ON parceiro_pamcards FOR DELETE TO authenticated
  USING (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_interno_select ON parceiro_pamcards FOR SELECT TO authenticated
  USING (is_interno());
