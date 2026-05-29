-- 0033 — Bloqueio temporario de novas solicitacoes por parceiro
--
-- Adiciona um switch por parceiro que impede a criacao de novas solicitacoes
-- pelo portal, mantendo o login, a listagem e o download de arquivos das
-- solicitacoes ja existentes. Diferente de `parceiros.ativo=false`, que tranca
-- o portal inteiro (e tambem ja desativa os usuarios via UI), este flag e' uma
-- pausa "estou encerrando os testes" controlada pela equipe interna.
--
-- Mudancas:
--   1. Colunas `solicitacoes_bloqueadas` (bool, default false) e
--      `solicitacoes_bloqueadas_em` (timestamptz) em `parceiros`.
--   2. Trigger BEFORE INSERT em `solicitacoes` que aborta com SQLSTATE custom
--      `PT423` (Locked) quando a origem e' do parceiro e o flag esta ligado.
--      Internos/e-mail (`origem != 'parceiro'`) passam direto. Igual a
--      check_portal_rate_limit_diario, a funcao e' SECURITY DEFINER porque o
--      parceiro nao tem policy de SELECT em `solicitacoes`.
--
-- Idempotente.

-- ============================================================
-- 1. Colunas em parceiros
-- ============================================================

ALTER TABLE parceiros
  ADD COLUMN IF NOT EXISTS solicitacoes_bloqueadas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitacoes_bloqueadas_em timestamptz;

COMMENT ON COLUMN parceiros.solicitacoes_bloqueadas IS
  'Quando true, o parceiro nao consegue criar novas solicitacoes pelo portal '
  '(trigger check_parceiro_solicitacoes_bloqueadas, SQLSTATE PT423). A '
  'leitura/download de arquivos das solicitacoes existentes continua liberada.';

COMMENT ON COLUMN parceiros.solicitacoes_bloqueadas_em IS
  'Momento em que o bloqueio foi ativado (null quando solicitacoes_bloqueadas=false).';

-- ============================================================
-- 2. Trigger BEFORE INSERT em solicitacoes
-- ============================================================

CREATE OR REPLACE FUNCTION check_parceiro_solicitacoes_bloqueadas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bloqueado boolean;
BEGIN
  IF NEW.origem <> 'parceiro' OR NEW.parceiro_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT solicitacoes_bloqueadas INTO v_bloqueado
  FROM parceiros
  WHERE id = NEW.parceiro_id;

  IF v_bloqueado IS TRUE THEN
    RAISE EXCEPTION
      'Novas solicitacoes estao temporariamente indisponiveis para este parceiro.'
      USING ERRCODE = 'PT423';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_parceiro_solicitacoes_bloqueadas() IS
  'Bloqueia INSERT em solicitacoes quando parceiros.solicitacoes_bloqueadas=true. '
  'SQLSTATE PT423.';

DROP TRIGGER IF EXISTS trg_solicitacoes_parceiro_bloqueado ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_parceiro_bloqueado
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION check_parceiro_solicitacoes_bloqueadas();
