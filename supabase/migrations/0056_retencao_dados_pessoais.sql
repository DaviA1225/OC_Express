-- 0056 — Política de retenção de dado pessoal (achado 2 da auditoria LGPD)
--
-- O art. 15/16 da LGPD manda eliminar o dado quando acaba a finalidade. Até
-- aqui o sistema não tinha prazo nenhum: a 0049 registrou por escrito que
-- "não apaga nada por retenção — quanto tempo guardar é decisão de negócio",
-- e essa decisão nunca foi tomada. `log_auditoria` guarda a linha INTEIRA
-- (com CPF) em cada INSERT e DELETE, para sempre; `eventos_portal` guarda IP,
-- user-agent e e-mail tentado, para sempre.
--
-- Prazos decididos por Davi em 09/08/2026:
--
--   log_auditoria   5 anos  — acompanha a guarda fiscal do transporte (CT-e /
--                             MDF-e). É o prazo com obrigação legal concreta
--                             por trás, que é o que sustenta a retenção
--                             perante a ANPD.
--   eventos_portal  1 ano   — log de acesso. O Marco Civil (art. 15) exige 6
--                             meses; 1 ano dá margem para investigar incidente
--                             descoberto tarde, sem guardar IP por anos.
--
-- INERTE NA ESTREIA, de propósito: a linha mais antiga de `log_auditoria` é de
-- 2026-04-29 e a de `eventos_portal` de 2026-05-20 — nada chega perto dos
-- cortes. Rodar a função hoje apaga ZERO linhas. Ela sobe como mecanismo, não
-- como faxina; a primeira exclusão real de auditoria acontece em 2031.
--
-- O QUE ESTA MIGRATION NÃO FAZ, de propósito:
--
--   1. Não agenda nada. Não há pg_cron habilitado no projeto, e agendar
--      exclusão irreversível de trilha de auditoria sem alguém olhando é pior
--      do que não agendar. Ver "Como operar" no fim.
--   2. Não tira o CPF do `audit_trigger()`. A auditoria LGPD tinha sugerido
--      isso, e a sugestão foi revista: desde a 0049 o UPDATE já grava só o
--      delta, então o CPF só aparece na trilha quando ele REALMENTE mudou (aí
--      registrar é a própria finalidade da auditoria) ou em INSERT/DELETE, que
--      são a única prova do que foi criado ou apagado. Cegar isso destruiria a
--      capacidade de provar "quem trocou o CPF deste motorista, e de quê para
--      quê" — que é justamente o controle que a LGPD espera. A exposição real
--      (dado de titular preso na trilha para sempre) é resolvida pela retenção
--      aqui e pela `anonimizar_titular()` da 0057, não por cegar o log.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT repetíveis.

-- ============================================================
-- purgar_dados_antigos
-- ============================================================
-- p_dry_run = true (PADRÃO): só conta, não apaga. O padrão é o modo seguro de
-- propósito — quem quiser apagar precisa dizer explicitamente `false`.
--
-- Devolve uma linha por tabela com quantas linhas estão além do corte e se
-- foram de fato apagadas, para o operador conferir o tamanho do estrago ANTES
-- de autorizar.

CREATE OR REPLACE FUNCTION purgar_dados_antigos(
  p_dry_run        boolean DEFAULT true,
  p_dias_auditoria int     DEFAULT 1826,  -- ~5 anos (365*5 + 1 bissexto)
  p_dias_eventos   int     DEFAULT 365    -- 1 ano
)
RETURNS TABLE (tabela text, corte timestamptz, linhas_alvo bigint, apagadas boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_corte_aud timestamptz := now() - make_interval(days => p_dias_auditoria);
  v_corte_evt timestamptz := now() - make_interval(days => p_dias_eventos);
  v_n         bigint;
BEGIN
  -- Guarda-corpo: um p_dias baixo por engano (ex.: 5 em vez de 1826) apagaria
  -- a trilha inteira sem chance de desfazer. Abaixo de 180 dias a função se
  -- recusa a rodar — o prazo mais curto que a política prevê é 1 ano.
  IF p_dias_auditoria < 180 OR p_dias_eventos < 180 THEN
    RAISE EXCEPTION 'retencao curta demais (auditoria=% dias, eventos=% dias). Minimo 180. Se a intencao e mesmo essa, altere a politica na 0056 em vez de passar o parametro na mao.',
      p_dias_auditoria, p_dias_eventos;
  END IF;

  SELECT count(*) INTO v_n FROM log_auditoria WHERE created_at < v_corte_aud;
  IF NOT p_dry_run AND v_n > 0 THEN
    DELETE FROM log_auditoria WHERE created_at < v_corte_aud;
  END IF;
  tabela := 'log_auditoria'; corte := v_corte_aud; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0);
  RETURN NEXT;

  SELECT count(*) INTO v_n FROM eventos_portal WHERE created_at < v_corte_evt;
  IF NOT p_dry_run AND v_n > 0 THEN
    DELETE FROM eventos_portal WHERE created_at < v_corte_evt;
  END IF;
  tabela := 'eventos_portal'; corte := v_corte_evt; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0);
  RETURN NEXT;
END;
$$;

-- Ninguém chama pela API. Só service_role / SQL Editor — mesmo tratamento que
-- o kill switch da 0045. Exclusão de trilha de auditoria não é operação de
-- tela: se um dia virar botão, ele precisa de confirmação e de registro
-- próprio de quem mandou apagar.
REVOKE ALL ON FUNCTION purgar_dados_antigos(boolean, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purgar_dados_antigos(boolean, int, int) FROM anon, authenticated;

COMMENT ON FUNCTION purgar_dados_antigos(boolean, int, int) IS
  'Aplica a politica de retencao: log_auditoria 5 anos, eventos_portal 1 ano '
  '(decidido em 2026-08-09). p_dry_run=true por padrao — so conta. Nao esta '
  'agendada: rodar pelo SQL Editor. Inerte ate 2031 (dados mais antigos sao '
  'de 04/2026).';

-- ============================================================
-- Como operar
-- ============================================================
-- Conferir o que seria apagado (seguro, nao apaga nada):
--     SELECT * FROM purgar_dados_antigos();
--
-- Apagar de fato, depois de olhar os numeros acima:
--     SELECT * FROM purgar_dados_antigos(p_dry_run => false);
--
-- Sugestao de cadencia: rodar o dry-run junto da revisao trimestral. Enquanto
-- `linhas_alvo` vier 0 nas duas linhas, nao ha nada a fazer — o que vale para
-- toda revisao ate 2031.
