-- =============================================
-- SisLog LHG — Clientes: tipo de carga (Minério / Retorno)
-- =============================================
-- Divide a lista de clientes em duas categorias para evitar mistura na UI.
-- Os clientes existentes são todos da carga de minério (default true).
-- Carga de retorno é uma nova categoria (default false), populada conforme cadastro.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cliente_minerio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cliente_retorno boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clientes_cliente_minerio ON clientes(cliente_minerio) WHERE cliente_minerio = true;
CREATE INDEX IF NOT EXISTS idx_clientes_cliente_retorno ON clientes(cliente_retorno) WHERE cliente_retorno = true;
