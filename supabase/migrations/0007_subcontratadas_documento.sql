-- Subcontratada pode ser PF (CPF) ou PJ (CNPJ).
-- Renomeia cnpj -> documento e adiciona tipo_pessoa. Idempotente.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'subcontratadas' AND column_name = 'cnpj'
  ) THEN
    ALTER TABLE subcontratadas RENAME COLUMN cnpj TO documento;
  END IF;
END $$;

ALTER TABLE subcontratadas
  ADD COLUMN IF NOT EXISTS tipo_pessoa text
  CHECK (tipo_pessoa IN ('PF', 'PJ'));
