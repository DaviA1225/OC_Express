-- =============================================
-- SisLog — Materiais: flag requer_instrucao
-- =============================================
-- Permite marcar materiais que NÃO exigem número de instrução para gerar a OC
-- (ex.: cargas de retorno como pedra, areia). Default true preserva o
-- comportamento atual de minério/gesso.

ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS requer_instrucao boolean NOT NULL DEFAULT true;
