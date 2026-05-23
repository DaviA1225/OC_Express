-- 0030 — Filtra clientes_publicos para mostrar só clientes de minério
--
-- Regra de negócio: o parceiro externo só carrega minério. Clientes de retorno
-- (cliente_retorno=true / cliente_minerio=false) só são atendidos por motoristas
-- da própria LHG. Antes desta migration, a view clientes_publicos (0017)
-- filtrava apenas por `ativo = true`, então o select de "Cliente" no formulário
-- de Nova Solicitação do portal listava também os clientes-retorno —
-- desnecessário e confuso pro operador da transportadora.
--
-- Fix: adiciona `cliente_minerio = true` ao WHERE. Não importa se o cliente
-- também aceita retorno (cliente_retorno=true): se ele aceita minério, o
-- parceiro pode solicitar carregamento.
--
-- Colunas e GRANTs mantidos — só muda o filtro. CREATE OR REPLACE VIEW
-- funciona porque a lista de colunas é a mesma da 0017.

CREATE OR REPLACE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf
FROM clientes
WHERE ativo = true
  AND cliente_minerio = true;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos de minerio com colunas seguras para o Portal de Parceiros. '
  'Clientes de retorno (cliente_minerio=false) sao filtrados — so a LHG carrega retorno.';
