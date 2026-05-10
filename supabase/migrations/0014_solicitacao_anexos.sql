-- =============================================
-- SisLog LHG — Anexos por solicitação
-- =============================================
-- Permite anexar arquivos (prints de WhatsApp, fotos do CRLV, comprovantes
-- de pesagem, etc.) a uma solicitação. Bucket privado (URLs assinadas)
-- e tabela de metadados.

-- ---------- Tabela ----------
CREATE TABLE IF NOT EXISTS solicitacao_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solicitacao_anexos_solicitacao ON solicitacao_anexos(solicitacao_id);

DROP TRIGGER IF EXISTS trg_solicitacao_anexos_updated ON solicitacao_anexos;
CREATE TRIGGER trg_solicitacao_anexos_updated BEFORE UPDATE ON solicitacao_anexos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS aud_solicitacao_anexos ON solicitacao_anexos;
CREATE TRIGGER aud_solicitacao_anexos AFTER INSERT OR UPDATE OR DELETE ON solicitacao_anexos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

ALTER TABLE solicitacao_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitacao_anexos_select ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_insert ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_update ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_delete ON solicitacao_anexos;

CREATE POLICY solicitacao_anexos_select ON solicitacao_anexos FOR SELECT TO authenticated USING (true);
CREATE POLICY solicitacao_anexos_insert ON solicitacao_anexos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY solicitacao_anexos_update ON solicitacao_anexos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY solicitacao_anexos_delete ON solicitacao_anexos FOR DELETE TO authenticated USING (true);

-- ---------- Storage bucket privado ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('solicitacoes-anexos', 'solicitacoes-anexos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "solicitacoes_anexos_select" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_insert" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_update" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_delete" ON storage.objects;

CREATE POLICY "solicitacoes_anexos_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'solicitacoes-anexos');
CREATE POLICY "solicitacoes_anexos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'solicitacoes-anexos');
CREATE POLICY "solicitacoes_anexos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'solicitacoes-anexos');
CREATE POLICY "solicitacoes_anexos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'solicitacoes-anexos');
