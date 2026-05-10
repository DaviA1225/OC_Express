-- =============================================
-- SisLog — Tabela cargas_retorno
-- =============================================
-- Cargas de retorno: pares (cliente, local de carregamento) que serão
-- consumidos na criação de solicitações tipo 'retorno'.

CREATE TABLE IF NOT EXISTS cargas_retorno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  local_carregamento text NOT NULL,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cargas_retorno_cliente ON cargas_retorno(cliente_id);

DROP TRIGGER IF EXISTS trg_cargas_retorno_updated ON cargas_retorno;
CREATE TRIGGER trg_cargas_retorno_updated BEFORE UPDATE ON cargas_retorno
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS aud_cargas_retorno ON cargas_retorno;
CREATE TRIGGER aud_cargas_retorno AFTER INSERT OR UPDATE OR DELETE ON cargas_retorno
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

ALTER TABLE cargas_retorno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cargas_retorno_select ON cargas_retorno;
DROP POLICY IF EXISTS cargas_retorno_insert ON cargas_retorno;
DROP POLICY IF EXISTS cargas_retorno_update ON cargas_retorno;
DROP POLICY IF EXISTS cargas_retorno_delete ON cargas_retorno;

CREATE POLICY cargas_retorno_select ON cargas_retorno FOR SELECT TO authenticated USING (true);
CREATE POLICY cargas_retorno_insert ON cargas_retorno FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cargas_retorno_update ON cargas_retorno FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY cargas_retorno_delete ON cargas_retorno FOR DELETE TO authenticated USING (true);
