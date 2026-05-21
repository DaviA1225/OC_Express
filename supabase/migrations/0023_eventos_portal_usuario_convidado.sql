-- 0023 — Adiciona tipo de evento `portal_usuario_convidado`
--
-- A Edge Function `convidar-parceiro-usuario` registra um evento nesse tipo
-- depois de criar o novo `parceiro_usuario`, para deixar trilha de auditoria
-- na tela /seguranca. Idempotente: o CHECK é dropado e recriado, e a função
-- é CREATE OR REPLACE.

-- ============================================================
-- 1. Ampliar o CHECK de tipo_evento
-- ============================================================

ALTER TABLE eventos_portal DROP CONSTRAINT IF EXISTS eventos_portal_tipo_evento_check;
ALTER TABLE eventos_portal ADD CONSTRAINT eventos_portal_tipo_evento_check
  CHECK (tipo_evento IN (
    'portal_login',
    'portal_login_falha',
    'portal_logout',
    'portal_solicitacao_criada',
    'portal_solicitacao_cancelada',
    'portal_senha_alterada',
    'portal_usuario_convidado'
  ));

-- ============================================================
-- 2. Atualizar registrar_evento_portal — mesmo corpo, lista nova
-- ============================================================
-- Diferenças vs. 0021:
--   - Aceita 'portal_usuario_convidado' na lista de tipos válidos.
--   - O caller deste evento é interno OU admin_parceiro (ambos têm `auth.uid()`
--     válido e mapeam num parceiro_usuarios ativo OU num perfil interno).
--     Para suportar o caso "interno convida um parceiro", se o caller NÃO é
--     parceiro_usuario o evento vai sem `parceiro_*` populado por aqui —
--     a Edge Function passa `parceiro_id` no payload e quem chama a tela
--     /seguranca enxerga via metadata.
--   - Para evitar perder o `parceiro_id` no caso interno, lemos do payload
--     quando o caller não tem vínculo de parceiro_usuario.

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
    'portal_senha_alterada', 'portal_usuario_convidado'
  ) THEN
    RAISE EXCEPTION 'tipo_evento invalido: %', p_tipo_evento;
  END IF;

  IF p_tipo_evento = 'portal_login_falha' THEN
    v_email_tentado := p_payload->>'email_tentado';
  ELSE
    IF v_user_id IS NULL THEN
      RETURN NULL;
    END IF;
    SELECT * INTO v_pu FROM parceiro_usuarios
      WHERE user_id = v_user_id AND ativo = true
      LIMIT 1;
    IF FOUND THEN
      v_parceiro_id := v_pu.parceiro_id;
      v_parceiro_usuario_id := v_pu.id;
    ELSIF p_tipo_evento = 'portal_usuario_convidado' THEN
      -- caller interno convidando: aceita parceiro_id explícito do payload
      v_parceiro_id := NULLIF(p_payload->>'parceiro_id', '')::uuid;
    ELSE
      -- demais tipos exigem vínculo de parceiro
      RETURN NULL;
    END IF;
  END IF;

  v_ip := p_payload->>'ip';
  v_user_agent := p_payload->>'user_agent';
  v_solicitacao_id := NULLIF(p_payload->>'solicitacao_id', '')::uuid;
  v_metadata := p_payload - ARRAY['email_tentado','ip','user_agent','solicitacao_id','parceiro_id'];
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
