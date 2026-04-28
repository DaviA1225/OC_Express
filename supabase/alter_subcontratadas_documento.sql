-- Renomeia cnpj -> documento e adiciona tipo_pessoa
-- Execute no SQL Editor do Supabase

ALTER TABLE subcontratadas RENAME COLUMN cnpj TO documento;

ALTER TABLE subcontratadas
  ADD COLUMN IF NOT EXISTS tipo_pessoa TEXT
  CHECK (tipo_pessoa IN ('PF', 'PJ'));
