-- 0021 — Bloco 6.2: auditoria expandida + log de tentativas de login (portal)
--
-- O `log_auditoria` (0001) captura DML automatico via trigger; nao serve para
-- eventos de aplicacao como login/logout ou login falhado (que ocorrem fora
-- de qualquer INSERT/UPDATE/DELETE em tabela). Esta migration cria uma tabela
-- dedicada `eventos_portal` e uma funcao `SECURITY DEFINER` `registrar_evento_portal`
-- — UNICO caminho de escrita. RLS bloqueia INSERT/UPDATE/DELETE direto e
-- libera SELECT apenas para `is_interno()`.
--
-- Idempotente.

-- ============================================================
-- 1. Tabela
-- ============================================================

CREATE TABLE IF NOT EXISTS eventos_portal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_evento text NOT NULL CHECK (tipo_evento IN (
    'portal_login',
    'portal_login_falha',
    'portal_logout',
    'portal_solicitacao_criada',
    'portal_solicitacao_cancelada',
    'portal_senha_alterada'
  )),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  parceiro_id uuid REFERENCES parceiros(id) ON DELETE SET NULL,
  parceiro_usuario_id uuid REFERENCES parceiro_usuarios(id) ON DELETE SET NULL,
  email_tentado text,
  solicitacao_id uuid REFERENCES solicitacoes(id) ON DELETE SET NULL,
  ip text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eventos_portal_created_at ON eventos_portal (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_portal_parceiro ON eventos_portal (parceiro_id);
CREATE INDEX IF NOT EXISTS idx_eventos_portal_tipo ON eventos_portal (tipo_evento);
CREATE INDEX IF NOT EXISTS idx_eventos_portal_user ON eventos_portal (user_id);

-- ============================================================
-- 2. RLS
-- ============================================================
-- SELECT: so time interno. INSERT/UPDATE/DELETE: nenhuma policy = ninguem
-- escreve direto. A unica porta de escrita e a funcao SECURITY DEFINER abaixo.

ALTER TABLE eventos_portal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_portal_select ON eventos_portal;
CREATE POLICY eventos_portal_select ON eventos_portal
  FOR SELECT TO authenticated
  USING (is_interno());

-- ============================================================
-- 3. Funcao registrar_evento_portal (SECURITY DEFINER)
-- ============================================================
-- Argumentos:
--   p_tipo_evento — string do CHECK acima
--   p_payload      — jsonb opcional com `email_tentado`, `ip`, `user_agent`,
--                    `solicitacao_id` e quaisquer extras (vao para `metadata`).
--
-- Regras:
--   - portal_login_falha: NAO exige auth.uid(); guarda email_tentado e
--     metadata. parceiro_id/parceiro_usuario_id ficam null (ainda nao sabemos
--     quem e). Esse tipo e o unico que pode ser disparado por anon.
--   - demais tipos: exigem auth.uid(). Se o usuario logado NAO for um
--     parceiro ativo (e.g. um interno entrou no portal por engano), retorna
--     NULL silenciosamente — nao polui a tabela com eventos sem parceiro.
--   - parceiro_id / parceiro_usuario_id sao SEMPRE derivados de auth.uid().
--     O cliente nao consegue forjar — passar parceiro_id no payload e
--     ignorado.

CREATE OR REPLACE FUNCTION registrar_evento_portal(
  p_tipo_evento text,
  p_payload jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pu parceiro_usuarios%ROWTYPE;
  v_parceiro_id uuid;
  v_parceiro_usuario_id uuid;
  v_email_tentado text;
  v_solicitacao_id uuid;
  v_ip text;
  v_user_agent text;
  v_metadata jsonb;
  v_id uuid;
BEGIN
  IF p_tipo_evento NOT IN (
    'portal_login', 'portal_login_falha', 'portal_logout',
    'portal_solicitacao_criada', 'portal_solicitacao_cancelada',
    'portal_senha_alterada'
  ) THEN
    RAISE EXCEPTION 'tipo_evento invalido: %', p_tipo_evento;
  END IF;

  IF p_tipo_evento = 'portal_login_falha' THEN
    v_email_tentado := p_payload->>'email_tentado';
  ELSE
    IF v_user_id IS NULL THEN
      -- token ja invalidado (ex.: logout disparado tarde demais) — ignora
      RETURN NULL;
    END IF;
    SELECT * INTO v_pu FROM parceiro_usuarios
      WHERE user_id = v_user_id AND ativo = true
      LIMIT 1;
    IF NOT FOUND THEN
      RETURN NULL; -- nao e parceiro: nao registra
    END IF;
    v_parceiro_id := v_pu.parceiro_id;
    v_parceiro_usuario_id := v_pu.id;
  END IF;

  v_ip := p_payload->>'ip';
  v_user_agent := p_payload->>'user_agent';
  v_solicitacao_id := NULLIF(p_payload->>'solicitacao_id', '')::uuid;
  v_metadata := p_payload - ARRAY['email_tentado','ip','user_agent','solicitacao_id'];
  IF v_metadata = '{}'::jsonb THEN v_metadata := NULL; END IF;

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
  'Unico ponto de escrita em eventos_portal. SECURITY DEFINER: ignora a RLS '
  'e deriva parceiro do auth.uid(), bloqueando spoofing pelo cliente.';
