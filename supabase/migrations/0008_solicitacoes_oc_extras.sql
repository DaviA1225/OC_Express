-- =============================================
-- SisLog — Campos extras para geração da OC
-- =============================================
-- Solicitações ganham subtipo de material (SINTER/HEMATITA/LUMP),
-- local de carregamento override e datas de validade da OC.

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS material_subtipo text,
  ADD COLUMN IF NOT EXISTS local_carregamento text,
  ADD COLUMN IF NOT EXISTS validade_inicio date,
  ADD COLUMN IF NOT EXISTS validade_fim date;

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_material_subtipo_check;

ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_material_subtipo_check
  CHECK (material_subtipo IS NULL OR material_subtipo IN ('SINTER', 'HEMATITA', 'LUMP'));
