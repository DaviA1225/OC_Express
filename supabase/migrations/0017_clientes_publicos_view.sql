-- 0017 — View clientes_publicos para o Portal de Parceiros (SPEC-PORTAL / Bloco 1)
--
-- O portal de parceiros precisa que a transportadora parceira escolha um
-- cliente da LHG ao criar uma solicitação (SPEC-PORTAL 5.5). Mas a tabela
-- `clientes` contém dados comerciais sensíveis (frete_cacamba, frete_graneleiro,
-- liberado, observações) que não podem ser expostos a um concorrente.
--
-- Como a RLS do Postgres é por linha e não por coluna, a solução é uma view
-- SECURITY DEFINER que expõe apenas as colunas seguras. A view roda com o
-- privilégio do dono (ignora a RLS de `clientes`) e devolve só id/razão social/
-- cidade/uf dos clientes ativos. O portal consulta esta view, nunca a tabela
-- `clientes` diretamente.
--
-- Esta peça é independente das tabelas de parceiro (Fase 8.1), por isso é
-- aplicada já. A view portal_solicitacoes virá junto da migration da Fase 8.1.
--
-- Script idempotente: pode ser reexecutado sem erro.

CREATE OR REPLACE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf
FROM clientes
WHERE ativo = true;

-- Lista pública compartilhada: todos os usuários autenticados (internos e,
-- futuramente, parceiros) podem ler. As colunas sensíveis ficam fora da view.
-- O papel `anon` não recebe acesso.
GRANT SELECT ON clientes_publicos TO authenticated;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos com colunas seguras para o Portal de Parceiros. '
  'Nunca expor dados comerciais (frete, liberado, observações).';
