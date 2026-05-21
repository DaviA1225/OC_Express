-- 0022 — Bloco 6.4: rate limit diario por usuario do portal (50 solicitacoes/dia)
--
-- Trigger BEFORE INSERT em `solicitacoes` que conta as solicitacoes ja criadas
-- pelo `parceiro_usuario_id` no dia de calendario (America/Sao_Paulo) e
-- aborta com SQLSTATE custom 'PT429' quando ultrapassa 50. A contagem inclui
-- TODAS as solicitacoes do dia (ativas e canceladas) — criar e cancelar em
-- loop nao zera o contador.
--
-- Internos e e-mails (origem != 'parceiro') passam direto: para esses casos
-- parceiro_usuario_id vem null por constraint (0018).
--
-- A funcao usa SECURITY DEFINER para conseguir contar `solicitacoes` —
-- parceiros nao tem policy de SELECT na tabela, entao sem isso o count
-- voltaria sempre 0 e o limite nunca dispararia.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION check_portal_rate_limit_diario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_limite constant integer := 50;
BEGIN
  IF NEW.origem <> 'parceiro' OR NEW.parceiro_usuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM solicitacoes
  WHERE parceiro_usuario_id = NEW.parceiro_usuario_id
    AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
        = (now()        AT TIME ZONE 'America/Sao_Paulo')::date;

  IF v_count >= v_limite THEN
    RAISE EXCEPTION
      'Limite diario de % solicitacoes por usuario atingido. Tente novamente amanha.',
      v_limite
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_portal_rate_limit_diario() IS
  'Bloco 6.4: bloqueia INSERT em solicitacoes quando o parceiro_usuario_id ja '
  'criou 50 solicitacoes no dia (America/Sao_Paulo). SQLSTATE PT429.';

DROP TRIGGER IF EXISTS trg_solicitacoes_rate_limit_diario ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_rate_limit_diario
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION check_portal_rate_limit_diario();
