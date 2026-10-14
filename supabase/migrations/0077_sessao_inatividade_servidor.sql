-- 0077 — Limite de inatividade aplicado também no SERVIDOR
--
-- Os 50 minutos sem interação (PR #85) eram aplicados só pelo cliente: o
-- `VigiaDeSessao` chama `signOut()` ao estourar o prazo. O que escapava disso:
--   * navegador FECHADO sem logout — o refresh token fica no disco e renova
--     sozinho quando alguém reabre o sistema, um dia depois;
--   * refresh token copiado do `localStorage` e usado fora do app.
-- O recurso nativo (Auth → Sessions → Inactivity timeout) é de plano pago, e o
-- projeto está no Free. Esta migration faz o mesmo com um Custom Access Token
-- Hook, que roda em TODA emissão de token — login e renovação.
--
-- Desenho:
--   * `sessao_atividade` guarda, por sessão do Auth (`session_id` do JWT), o
--     instante da última interação real do usuário.
--   * O app chama `registrar_atividade_sessao()` quando o usuário clica ou
--     digita, no máximo uma vez a cada 5 minutos.
--   * Na RENOVAÇÃO do token, o hook recusa a emissão se a última atividade
--     tiver mais de 60 minutos. Sem token novo, a sessão morre quando o access
--     token atual expira.
--
-- Por que 60 e não 50: o cliente segue sendo quem derruba aos 50, com o aviso
-- de 2 minutos. O servidor é a rede de segurança e não pode disparar ANTES do
-- cliente — o batimento chega com até 5 minutos de atraso, e o usuário cairia
-- sem aviso. Os 10 minutos de folga cobrem isso.
--
-- O hook só passa a valer depois de LIGADO no Dashboard (Auth → Hooks →
-- Customize Access Token → Postgres → public.hook_limite_inatividade). Até lá
-- esta migration é inerte: a tabela recebe batimentos e ninguém a consulta.
-- Para desligar numa emergência, basta desativar o hook no mesmo lugar.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.sessao_atividade (
  session_id       uuid PRIMARY KEY,
  user_id          uuid NOT NULL,
  ultima_atividade timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessao_atividade_user_id_idx
  ON public.sessao_atividade (user_id);

COMMENT ON TABLE public.sessao_atividade IS
  'Ultima interacao real do usuario por sessao do Auth (0077). Lida pelo hook '
  'hook_limite_inatividade na renovacao do token; escrita pela RPC '
  'registrar_atividade_sessao e pelo proprio hook no login.';

ALTER TABLE public.sessao_atividade ENABLE ROW LEVEL SECURITY;

-- Ninguém do app lê ou escreve a tabela direto: a escrita é só pela RPC
-- (SECURITY DEFINER) e a leitura é só do hook, que roda como
-- `supabase_auth_admin` — role que NÃO ignora RLS, daí as policies abaixo.
REVOKE ALL ON public.sessao_atividade FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessao_atividade TO supabase_auth_admin;

DROP POLICY IF EXISTS sessao_atividade_auth_admin ON public.sessao_atividade;
CREATE POLICY sessao_atividade_auth_admin ON public.sessao_atividade
  AS PERMISSIVE FOR ALL TO supabase_auth_admin
  USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: batimento de atividade
-- ============================================================
-- A sessão vem do próprio JWT, nunca de parâmetro: ninguém consegue manter
-- viva a sessão de outra pessoa.
--
-- O WHERE do upsert segura escrita repetida: com várias abas abertas, cada uma
-- manda o seu batimento, e menos de 1 minuto de diferença não muda nada num
-- limite de 60.

CREATE OR REPLACE FUNCTION public.registrar_atividade_sessao()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_sessao uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_user   uuid := auth.uid();
BEGIN
  IF v_sessao IS NULL OR v_user IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO sessao_atividade (session_id, user_id, ultima_atividade)
  VALUES (v_sessao, v_user, now())
  ON CONFLICT (session_id) DO UPDATE
    SET ultima_atividade = now()
    WHERE sessao_atividade.ultima_atividade < now() - interval '1 minute';
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_atividade_sessao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_atividade_sessao() TO authenticated;

-- ============================================================
-- Hook: Custom Access Token
-- ============================================================
-- Regras:
--   * Qualquer emissão que NÃO seja renovação (senha, OTP do convite, TOTP do
--     2FA, magic link do pentest...) é login: carimba a sessão e libera.
--   * Renovação de sessão sem linha na tabela (sessão anterior a esta
--     migration): carimba agora e libera. O relógio dela começa a contar daqui.
--   * Renovação com última atividade há mais de 60 min: recusa.
--
-- FALHA ABERTA de propósito: qualquer erro inesperado devolve o token sem
-- mexer. Um bug aqui travaria o login da operação inteira, e o limite do
-- cliente continua valendo enquanto isso. A recusa por inatividade não é
-- exceção — é um retorno normal — então o EXCEPTION não a engole.
--
-- O agente de WhatsApp faz login a cada mensagem e nunca renova
-- (autoRefreshToken: false), então nunca cai na regra de renovação.

CREATE OR REPLACE FUNCTION public.hook_limite_inatividade(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp
AS $$
DECLARE
  v_sessao  uuid;
  v_user    uuid;
  v_ultima  timestamptz;
BEGIN
  v_sessao := nullif(event -> 'claims' ->> 'session_id', '')::uuid;
  v_user   := nullif(event ->> 'user_id', '')::uuid;

  IF v_sessao IS NULL OR v_user IS NULL THEN
    RETURN event;
  END IF;

  IF event ->> 'authentication_method' IS DISTINCT FROM 'token_refresh' THEN
    INSERT INTO sessao_atividade (session_id, user_id, ultima_atividade)
    VALUES (v_sessao, v_user, now())
    ON CONFLICT (session_id) DO UPDATE SET ultima_atividade = now();

    -- Faxina barata, pelo índice de user_id: sessões antigas do mesmo usuário.
    DELETE FROM sessao_atividade
     WHERE user_id = v_user
       AND session_id <> v_sessao
       AND ultima_atividade < now() - interval '1 day';

    RETURN event;
  END IF;

  SELECT ultima_atividade INTO v_ultima
    FROM sessao_atividade
   WHERE session_id = v_sessao;

  IF NOT FOUND THEN
    INSERT INTO sessao_atividade (session_id, user_id, ultima_atividade)
    VALUES (v_sessao, v_user, now())
    ON CONFLICT (session_id) DO NOTHING;
    RETURN event;
  END IF;

  IF v_ultima < now() - interval '60 minutes' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 401,
        'message', 'Sessao encerrada por inatividade.'
      )
    );
  END IF;

  RETURN event;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'hook_limite_inatividade: % (%) — token liberado', SQLERRM, SQLSTATE;
  RETURN event;
END;
$$;

REVOKE ALL ON FUNCTION public.hook_limite_inatividade(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_limite_inatividade(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

NOTIFY pgrst, 'reload schema';
