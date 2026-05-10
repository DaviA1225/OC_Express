-- =============================================
-- SisLog — Subcontratada na solicitação
-- =============================================
-- Solicitações ganham subcontratada_id (override do padrão "subcontratada do cavalo").

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS subcontratada_id uuid REFERENCES subcontratadas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_subcontratada ON solicitacoes(subcontratada_id);
