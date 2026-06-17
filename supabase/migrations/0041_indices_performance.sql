-- 0041 — Índices de performance (FKs sem índice + compostos das telas quentes)
--
-- Contexto: conforme `solicitacoes` e `log_auditoria` crescem (já ~560 solic.),
-- as telas mais usadas começam a fazer seq scan. O Postgres NÃO cria índice
-- automático em coluna de FK (só em PK e UNIQUE), então toda FK que participa de
-- join/filtro/ON DELETE precisa de índice explícito. Esta migration fecha essas
-- lacunas e adiciona dois índices compostos que casam com os padrões reais de
-- filtro+ordenação do front.
--
-- Por que cada um:
--  • solicitacoes.{cliente,material,motorista,veiculo,carreta}_id — usados nos
--    joins de SELECT_WITH_JOINS, no filtro da lista (material_id), na busca
--    textual (in (...)) e em findPossibleDuplicate (eq motorista_id+veiculo_id+
--    cliente_id, que roda a CADA nova solicitação).
--  • solicitacoes.parceiro_*_id (7) — joins das solicitações de origem 'parceiro'
--    e, principalmente, proteção do DELETE no pai: sem índice, apagar um
--    parceiro_motoristas/veiculos/carretas/subcontratadas varre solicitacoes
--    inteira para checar a FK.
--  • idx_solicitacoes_status_created — a lista filtra por status e ordena por
--    created_at DESC; SLA e dashboard fazem status IN (...) + created_at. O
--    composto evita "filtra por um índice, ordena à parte".
--  • idx_log_auditoria_tabela_created — painel Atividade e Auditoria filtram
--    tabela + created_at e ordenam por created_at DESC. log_auditoria é a tabela
--    que mais cresce. O índice solto idx_log_auditoria_tabela (0001) fica
--    subsumido pela coluna líder do composto e é removido para poupar escrita.
--
-- Nota de escala: as tabelas ainda são pequenas, então CREATE INDEX comum roda
-- instantâneo dentro da transação da migration. Se um dia for re-aplicar algo
-- assim numa tabela já enorme em produção, troque por CREATE INDEX CONCURRENTLY
-- (que NÃO pode rodar dentro de transação) para não travar escritas.
--
-- Idempotente (regra do projeto): IF NOT EXISTS / IF EXISTS em tudo.

-- ── solicitacoes: FKs internas ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_solicitacoes_cliente   ON solicitacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_material  ON solicitacoes(material_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_motorista ON solicitacoes(motorista_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_veiculo   ON solicitacoes(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_carreta   ON solicitacoes(carreta_id);

-- ── solicitacoes: FKs das bases do parceiro ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_motorista        ON solicitacoes(parceiro_motorista_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_veiculo          ON solicitacoes(parceiro_veiculo_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_carreta          ON solicitacoes(parceiro_carreta_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_primeira_carreta ON solicitacoes(parceiro_primeira_carreta_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_dolly            ON solicitacoes(parceiro_dolly_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_subcontratada    ON solicitacoes(parceiro_subcontratada_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_usuario          ON solicitacoes(parceiro_usuario_id);

-- ── solicitacoes: composto filtro+ordenação da lista/SLA/dashboard ──────────
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status_created
  ON solicitacoes(status, created_at DESC);

-- ── log_auditoria: composto tabela+data; remove o solto subsumido ───────────
CREATE INDEX IF NOT EXISTS idx_log_auditoria_tabela_created
  ON log_auditoria(tabela, created_at DESC);
DROP INDEX IF EXISTS idx_log_auditoria_tabela;
