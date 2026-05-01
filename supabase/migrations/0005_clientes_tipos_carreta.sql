-- Marca quais tipos de carreta o cliente recebe (caçamba/graneleiro)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS aceita_cacamba boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_graneleiro boolean NOT NULL DEFAULT true;
