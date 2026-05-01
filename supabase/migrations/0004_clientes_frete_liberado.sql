-- Adiciona valor de frete por tonelada e status de liberação ao cliente
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS frete_ton numeric,
  ADD COLUMN IF NOT EXISTS liberado boolean NOT NULL DEFAULT true;
