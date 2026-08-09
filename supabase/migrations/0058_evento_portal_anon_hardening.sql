-- 0058 — Endurece registrar_evento_portal contra abuso anônimo (achado 6)
--
-- A função é `GRANT EXECUTE ... TO anon` desde a 0021, e precisa ser: o evento
-- `portal_login_falha` acontece ANTES de existir sessão. O problema é o que ela
-- aceitava do chamador:
--
--   • `ip` e `user_agent` vinham DO PAYLOAD, ou seja, do cliente. Qualquer
--     pessoa na internet registrava eventos com IP e e-mail forjados.
--   • `metadata` é jsonb livre, sem teto de tamanho.
--   • Sem limite de frequência: dava para inflar a tabela à vontade.
--
-- Isso corrompe justamente a trilha que a tela /seguranca apresenta como
-- evidência de quem tentou entrar — e uma trilha que o atacante escreve não
-- serve como evidência de nada.
--
-- O que muda:
--   1. IP passa a sair do header `x-forwarded-for` (posto pelo proxy do
--      Supabase, fora do alcance do cliente). O `ip` do payload é IGNORADO.
--   2. `user_agent` passa a sair do header, com o do payload só como reserva.
--   3. `metadata` ganha teto de 2 KB e `email_tentado` de 320 caracteres
--      (limite de e-mail da RFC 5321).
--   4. Rate limit de 20 `portal_login_falha` por IP a cada 5 minutos.
--
-- O rate limit devolve NULL em silêncio em vez de erro, de propósito: um erro
-- diria ao atacante que ele bateu no limite e a partir de qual volume. O
-- login legítimo não é afetado — esta função só REGISTRA o evento, nunca
-- autoriza nada; barrar o registro não barra nem libera ninguém.
--
-- Idempotente: CREATE OR REPLACE.

-- Índice que sustenta a consulta do rate limit (janela curta por IP).
CREATE INDEX IF NOT EXISTS idx_eventos_portal_ip_created
  ON eventos_portal (ip, created_at DESC)
  WHERE tipo_evento = 'portal_login_falha';

CREATE OR REPLACE FUNCTION registrar_evento_portal(
  p_tipo_evento text,
  p_payload jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id             uuid := auth.uid();
  v_pu                  parceiro_usuarios%ROWTYPE;
  v_parceiro_id         uuid;
  v_parceiro_usuario_id uuid;
  v_email_tentado       text;
  v_solicitacao_id      uuid;
  v_ip                  text;
  v_user_agent          text;
  v_metadata            jsonb;
  v_headers             json;
  v_recentes            int;
  v_id                  uuid;
BEGIN
  IF p_tipo_evento NOT IN (
    'portal_login', 'portal_login_falha', 'portal_logout',
    'portal_solicitacao_criada', 'portal_solicitacao_editada',
    'portal_solicitacao_cancelada', 'portal_senha_alterada',
    'portal_usuario_convidado', 'portal_usuario_excluido'
  ) THEN
    RAISE EXCEPTION 'tipo_evento invalido: %', p_tipo_evento;
  END IF;

  -- ---------- origem da requisição: header, não payload ----------
  -- `request.headers` é posto pelo PostgREST. Fora dele (SQL Editor, job) o
  -- GUC não existe: o current_setting com missing_ok=true devolve NULL e
  -- seguimos sem IP em vez de quebrar.
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  IF v_headers IS NOT NULL THEN
    -- x-forwarded-for é uma cadeia "cliente, proxy1, proxy2": o primeiro é o
    -- cliente. Vem do proxy do Supabase, então o cliente não escreve nele.
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_user_agent := v_headers ->> 'user-agent';
  END IF;

  -- Reserva: user_agent do payload só se o header não veio. IP do payload
  -- NUNCA é usado — era exatamente o vetor de forja.
  v_user_agent := COALESCE(v_user_agent, p_payload ->> 'user_agent');
  v_user_agent := left(v_user_agent, 500);

  -- ---------- rate limit do único tipo que anon dispara ----------
  IF p_tipo_evento = 'portal_login_falha' AND v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_recentes
      FROM eventos_portal
     WHERE tipo_evento = 'portal_login_falha'
       AND ip = v_ip
       AND created_at > now() - interval '5 minutes';
    IF v_recentes >= 20 THEN
      RETURN NULL;  -- silencioso de proposito (ver cabecalho)
    END IF;
  END IF;

  IF p_tipo_evento = 'portal_login_falha' THEN
    v_email_tentado := left(p_payload ->> 'email_tentado', 320);
  ELSE
    IF v_user_id IS NULL THEN
      RETURN NULL;  -- token ja invalidado (ex.: logout tardio)
    END IF;
    SELECT * INTO v_pu FROM parceiro_usuarios
      WHERE user_id = v_user_id AND ativo = true
      LIMIT 1;
    IF NOT FOUND THEN
      RETURN NULL;  -- nao e parceiro: nao registra
    END IF;
    v_parceiro_id := v_pu.parceiro_id;
    v_parceiro_usuario_id := v_pu.id;
  END IF;

  v_solicitacao_id := NULLIF(p_payload ->> 'solicitacao_id', '')::uuid;

  -- metadata: tira as chaves que viram coluna (inclusive `ip`, que agora e
  -- derivado do header e nao pode voltar pela porta dos fundos) e poe teto.
  v_metadata := COALESCE(p_payload, '{}'::jsonb)
                - ARRAY['email_tentado', 'ip', 'user_agent', 'solicitacao_id'];
  IF v_metadata = '{}'::jsonb THEN
    v_metadata := NULL;
  ELSIF length(v_metadata::text) > 2048 THEN
    v_metadata := jsonb_build_object(
      'truncado', true,
      'motivo', 'metadata acima de 2KB',
      'bytes_originais', length(v_metadata::text));
  END IF;

  INSERT INTO eventos_portal (
    tipo_evento, user_id, parceiro_id, parceiro_usuario_id,
    email_tentado, solicitacao_id, ip, user_agent, metadata
  ) VALUES (
    p_tipo_evento, v_user_id, v_parceiro_id, v_parceiro_usuario_id,
    v_email_tentado, v_solicitacao_id, v_ip, v_user_agent, v_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_evento_portal(text, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION registrar_evento_portal(text, jsonb) IS
  'Unico ponto de escrita em eventos_portal. SECURITY DEFINER: deriva parceiro '
  'do auth.uid() e IP/user-agent dos HEADERS (0058) — o cliente nao forja nem '
  'identidade nem origem. Rate limit de 20 login_falha por IP a cada 5 min.';

NOTIFY pgrst, 'reload schema';
