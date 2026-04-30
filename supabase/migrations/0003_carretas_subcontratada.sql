-- Vincula carretas a uma subcontratada (mesmo padrão de veiculos.subcontratada_id)
ALTER TABLE carretas
  ADD COLUMN IF NOT EXISTS subcontratada_id uuid REFERENCES subcontratadas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_carretas_subcontratada ON carretas(subcontratada_id);
