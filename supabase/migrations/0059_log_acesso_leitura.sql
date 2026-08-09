-- 0059 — Registro de ACESSO a dado pessoal (achado 5 da auditoria LGPD)
--
-- O sistema audita muito bem quem ESCREVE: `audit_trigger()` cobre ~20 tabelas
-- com INSERT/UPDATE/DELETE, autor e horário. Mas SELECT não passa por trigger,
-- e por isso ninguém sabia quem LEU o quê.
--
-- Na prática o buraco é grande: um atendente exporta o CSV com os 1.206
-- motoristas (nome, CPF, telefone) e não fica registro nenhum. O art. 37 da
-- LGPD manda o controlador manter registro das operações de tratamento, e
-- "acesso" é operação de tratamento (art. 5º, X).
--
-- Registrar TODO SELECT seria inviável e inútil (o app faz dezenas por tela).
-- O que esta migration registra são as três operações em que dado pessoal
-- SAI do sistema em volume ou vira arquivo:
--
--   export_csv       — exportação de listagem/relatório (o pior caso: base
--                      inteira, com CPF, num arquivo que sai do controle)
--   download_oc_pdf  — geração do link assinado do PDF da OC (nome + CPF)
--   abrir_anexo      — geração do link assinado de um anexo (CRLV, CNH, prints)
--
-- Os três passam por funções centralizadas no front (`downloadCsv`,
-- `getOcPdfSignedUrl`, `getAnexoSignedUrl`), então a instrumentação é num
-- ponto só de cada e não depende de lembrar de chamar em cada tela nova.
--
-- Idempotente.

-- ============================================================
-- 1. Tabela
-- ============================================================

CREATE TABLE IF NOT EXISTS log_acesso (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acao       text NOT NULL CHECK (acao IN ('export_csv', 'download_oc_pdf', 'abrir_anexo')),
  -- O QUE foi acessado: nome do recurso legível ('motoristas', 'auditoria',
  -- 'OC 0287'). Sem dado pessoal aqui — este log não pode virar mais uma
  -- cópia do que ele veio vigiar.
  recurso    text,
  -- Contexto sem PII: quantidade de linhas exportadas, filtros aplicados, id
  -- da solicitação. Teto de 1 KB.
  detalhe    jsonb,
  ip         text,
  user_agent text,
  origem     text NOT NULL DEFAULT 'interno' CHECK (origem IN ('interno', 'portal')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_acesso_created_at ON log_acesso (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_acesso_usuario    ON log_acesso (usuario_id);
CREATE INDEX IF NOT EXISTS idx_log_acesso_acao       ON log_acesso (acao);

-- ============================================================
-- 2. RLS — leitura só para quem já vê a auditoria
-- ============================================================
-- SELECT: mesmos perfis da tela /auditoria (admin, gerente, supervisor).
-- Nenhuma policy de INSERT/UPDATE/DELETE: ninguém escreve direto, só a função
-- SECURITY DEFINER abaixo. Mesmo padrão da eventos_portal (0021).

ALTER TABLE log_acesso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS log_acesso_select ON log_acesso;
CREATE POLICY log_acesso_select ON log_acesso
  FOR SELECT TO authenticated
  USING (meu_perfil_interno() IN ('admin', 'gerente', 'supervisor'));

-- ============================================================
-- 3. registrar_acesso — único caminho de escrita
-- ============================================================
-- Fire-and-forget: o front chama sem esperar e ignora erro. Registro de acesso
-- nunca pode quebrar a exportação que o usuário pediu — por isso a função
-- engole entrada ruim (devolve NULL) em vez de levantar exceção.

CREATE OR REPLACE FUNCTION registrar_acesso(
  p_acao    text,
  p_recurso text DEFAULT NULL,
  p_detalhe jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_headers json;
  v_ip      text;
  v_ua      text;
  v_origem  text;
  v_detalhe jsonb;
  v_id      uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN NULL;  -- sem sessao nao ha acesso a registrar
  END IF;

  IF p_acao NOT IN ('export_csv', 'download_oc_pdf', 'abrir_anexo') THEN
    RETURN NULL;  -- entrada invalida nao derruba o fluxo do usuario
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_ua := left(v_headers ->> 'user-agent', 500);
  END IF;

  -- Interno x portal derivado do servidor, nao do payload: quem tem linha em
  -- perfis_usuarios e interno; o resto que chegou aqui autenticado e parceiro.
  v_origem := CASE WHEN is_interno() THEN 'interno' ELSE 'portal' END;

  v_detalhe := p_detalhe;
  IF v_detalhe IS NOT NULL AND length(v_detalhe::text) > 1024 THEN
    v_detalhe := jsonb_build_object('truncado', true);
  END IF;

  INSERT INTO log_acesso (usuario_id, acao, recurso, detalhe, ip, user_agent, origem)
  VALUES (v_user, p_acao, left(p_recurso, 120), v_detalhe, v_ip, v_ua, v_origem)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION registrar_acesso(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_acesso(text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION registrar_acesso(text, text, jsonb) IS
  'Unico ponto de escrita em log_acesso (LGPD art. 37). Registra as operacoes '
  'em que dado pessoal sai do sistema: exportacao CSV, link do PDF da OC e '
  'link de anexo. IP/user-agent vem dos headers, origem do servidor.';

-- ============================================================
-- Retenção
-- ============================================================
-- log_acesso entra na mesma política de 1 ano da eventos_portal (log de
-- acesso). A `purgar_dados_antigos()` da 0056 e estendida abaixo para cobri-la.

CREATE OR REPLACE FUNCTION purgar_dados_antigos(
  p_dry_run        boolean DEFAULT true,
  p_dias_auditoria int     DEFAULT 1826,
  p_dias_eventos   int     DEFAULT 365
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
  IF p_dias_auditoria < 180 OR p_dias_eventos < 180 THEN
    RAISE EXCEPTION 'retencao curta demais (auditoria=% dias, eventos=% dias). Minimo 180.',
      p_dias_auditoria, p_dias_eventos;
  END IF;

  SELECT count(*) INTO v_n FROM log_auditoria WHERE created_at < v_corte_aud;
  IF NOT p_dry_run AND v_n > 0 THEN
    DELETE FROM log_auditoria WHERE created_at < v_corte_aud;
  END IF;
  tabela := 'log_auditoria'; corte := v_corte_aud; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0); RETURN NEXT;

  SELECT count(*) INTO v_n FROM eventos_portal WHERE created_at < v_corte_evt;
  IF NOT p_dry_run AND v_n > 0 THEN
    DELETE FROM eventos_portal WHERE created_at < v_corte_evt;
  END IF;
  tabela := 'eventos_portal'; corte := v_corte_evt; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0); RETURN NEXT;

  SELECT count(*) INTO v_n FROM log_acesso WHERE created_at < v_corte_evt;
  IF NOT p_dry_run AND v_n > 0 THEN
    DELETE FROM log_acesso WHERE created_at < v_corte_evt;
  END IF;
  tabela := 'log_acesso'; corte := v_corte_evt; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0); RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION purgar_dados_antigos(boolean, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purgar_dados_antigos(boolean, int, int) FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
