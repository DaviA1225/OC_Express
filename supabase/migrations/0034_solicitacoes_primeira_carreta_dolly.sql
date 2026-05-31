-- 0034 — Placas da composicao em ordem (ANTT): 1a carreta + dolly
--
-- A nova regulamentacao fiscal da ANTT exige que TODAS as placas da composicao
-- veicular apareçam na Ordem de Carregamento, na ordem fisica do conjunto:
--   Cavalo -> 1a Carreta -> Dolly -> Ultima Carreta
-- Hoje a solicitacao so registra Cavalo (veiculo_id) e Ultima Carreta
-- (carreta_id). Esta migration adiciona dois vinculos OPCIONAIS de carreta,
-- reaproveitando o cadastro existente de `carretas` (o dolly e' cadastrado como
-- uma carreta). Quando vazios, saem em branco na OC.
--
-- Espelha os campos no fluxo do portal (parceiro_carretas), atualiza a
-- constraint de integridade de origem e recria a view portal_solicitacoes.
--
-- Idempotente.

-- ============================================================
-- 1. Vinculos internos (cadastro de carretas)
-- ============================================================

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS primeira_carreta_id uuid REFERENCES carretas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dolly_id uuid REFERENCES carretas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_primeira_carreta ON solicitacoes(primeira_carreta_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_dolly ON solicitacoes(dolly_id);

-- ============================================================
-- 2. Vinculos do portal (cadastro do parceiro)
-- ============================================================

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS parceiro_primeira_carreta_id uuid REFERENCES parceiro_carretas(id),
  ADD COLUMN IF NOT EXISTS parceiro_dolly_id uuid REFERENCES parceiro_carretas(id);

COMMENT ON COLUMN solicitacoes.primeira_carreta_id IS
  'Placa da 1a carreta da composicao (ANTT). Opcional; FK carretas.';
COMMENT ON COLUMN solicitacoes.dolly_id IS
  'Placa do dolly da composicao (ANTT). Opcional; FK carretas (dolly cadastrado como carreta).';
COMMENT ON COLUMN solicitacoes.parceiro_primeira_carreta_id IS
  'Espelho de primeira_carreta_id no fluxo do portal (FK parceiro_carretas).';
COMMENT ON COLUMN solicitacoes.parceiro_dolly_id IS
  'Espelho de dolly_id no fluxo do portal (FK parceiro_carretas).';

-- ============================================================
-- 3. Constraint de integridade de origem (cobre os novos campos)
-- ============================================================
-- Mantem a regra da 0018: solicitacao de parceiro usa apenas referencias
-- parceiro_*; interna/e-mail nao usa nenhuma referencia parceiro_*. NOT VALID:
-- nao varre linhas legadas (todas tem os novos campos NULL).

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_integridade;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_integridade
  CHECK (
    (origem = 'parceiro'
      AND parceiro_id IS NOT NULL
      AND parceiro_usuario_id IS NOT NULL
      AND parceiro_motorista_id IS NOT NULL
      AND parceiro_veiculo_id IS NOT NULL
      AND motorista_id IS NULL
      AND veiculo_id IS NULL
      AND carreta_id IS NULL
      AND primeira_carreta_id IS NULL
      AND dolly_id IS NULL
      AND subcontratada_id IS NULL)
    OR
    (origem <> 'parceiro'
      AND parceiro_id IS NULL
      AND parceiro_usuario_id IS NULL
      AND parceiro_motorista_id IS NULL
      AND parceiro_veiculo_id IS NULL
      AND parceiro_carreta_id IS NULL
      AND parceiro_primeira_carreta_id IS NULL
      AND parceiro_dolly_id IS NULL
      AND parceiro_subcontratada_id IS NULL)
  ) NOT VALID;

-- ============================================================
-- 4. View portal_solicitacoes — expoe os novos IDs do parceiro
-- ============================================================
-- DROP + CREATE (em vez de CREATE OR REPLACE) porque o Postgres nao permite
-- inserir colunas no meio da lista via REPLACE. O portal resolve as colunas por
-- nome, entao a ordem nao importa para a aplicacao.

DROP VIEW IF EXISTS portal_solicitacoes;
CREATE VIEW portal_solicitacoes
WITH (security_invoker = false) AS
SELECT id, numero_interno, tipo, status, origem,
       parceiro_id, parceiro_usuario_id, parceiro_motorista_id,
       parceiro_veiculo_id, parceiro_carreta_id,
       parceiro_primeira_carreta_id, parceiro_dolly_id,
       parceiro_subcontratada_id,
       cliente_id, pamcard_status, pamcard_numero,
       observacoes, created_at, enviada_em, finalizada_em
FROM solicitacoes
WHERE origem = 'parceiro' AND parceiro_id = get_current_parceiro_id();

GRANT SELECT ON portal_solicitacoes TO authenticated;

COMMENT ON VIEW portal_solicitacoes IS
  'Solicitações do parceiro logado, apenas com colunas seguras. O portal lê '
  'por aqui; o parceiro não tem policy de SELECT na tabela solicitacoes.';
