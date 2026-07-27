-- 0048 — Índice de `log_auditoria` por registro auditado
--
-- Contexto medido em 2026-07-27 (`supabase inspect db table-stats --linked`):
-- `log_auditoria` tem 80 MB de dados em ~44.000 linhas (≈1,9 KB por linha — os
-- snapshots `to_jsonb(OLD/NEW)` da linha inteira) contra ~10 MB de TODO o resto
-- do banco somado. É, de longe, a tabela que mais cresce.
--
-- O que falta: os índices existentes são `(tabela, created_at DESC)` (0041),
-- `(usuario_id)` e `(created_at DESC)` (0001). Nenhum cobre `registro_id`.
--
-- Quem sofre: os Relatórios reconstroem a linha do tempo de status
-- (`useStatusTransitions`) com
--
--   WHERE tabela = 'solicitacoes' AND acao = 'UPDATE'
--     AND registro_id IN (<até 200 ids>)
--   ORDER BY created_at
--
-- Sem índice em `registro_id`, o melhor caminho disponível é varrer TODAS as
-- linhas de `tabela='solicitacoes'` (a esmagadora maioria das 44 mil) e
-- descartar quase tudo — repetido a cada bloco de 200 ids. Com `registro_id`
-- na frente, cada id vira um seek: a coluna é praticamente única por linha
-- auditada, então os predicados `tabela`/`acao` sobram como filtro de um punhado
-- de linhas.
--
-- Por que `created_at` como segunda coluna: a query ordena por ela. Com o
-- composto, cada seek já devolve as transições daquele registro em ordem, e o
-- Postgres só faz o merge — evita ordenar um conjunto grande à parte. Serve
-- igual para "histórico deste registro", que é como o log é lido na Auditoria.
--
-- Escala: 44 mil linhas geram um índice pequeno (poucos MB) e o CREATE INDEX
-- roda em fração de segundo dentro da transação da migration. Se um dia a
-- tabela passar de alguns milhões de linhas, troque por CREATE INDEX
-- CONCURRENTLY (que NÃO pode rodar dentro de transação) para não bloquear as
-- escritas — lembrando que TODA escrita nas tabelas auditadas insere aqui, então
-- travar esta tabela trava o app inteiro.
--
-- Idempotente (regra do projeto): IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_log_auditoria_registro_created
  ON log_auditoria(registro_id, created_at DESC);

COMMENT ON INDEX idx_log_auditoria_registro_created IS
  'Historico por registro auditado. Sustenta o registro_id IN (...) + ORDER BY '
  'created_at dos Relatorios (reconstrucao de transicoes de status) e a leitura '
  'de historico de um registro. Migration 0048.';

NOTIFY pgrst, 'reload schema';
