-- 0043 — Permite ao parceiro EDITAR a própria solicitação enquanto 'recebida'
--
-- Contexto: um parceiro que errou os dados (ex.: inverteu carreta/cavalo) só
-- tinha a opção de cancelar e recriar — perdendo a posição na fila. A migration
-- 0028 havia apertado o UPDATE do parceiro para a ÚNICA transição
-- `recebida → cancelada`, bloqueando qualquer edição de campo.
--
-- Aqui afrouxamos o WITH CHECK para aceitar `status IN ('recebida','cancelada')`:
--   - recebida → recebida  → edição dos dados (NOVO);
--   - recebida → cancelada → cancelamento (comportamento da 0028, mantido).
-- O USING continua exigindo `status = 'recebida'`, então só dá para mexer
-- ENQUANTO a LHG ainda não começou a processar — a linha é a mesma, logo
-- `created_at`/`numero_interno` não mudam e a fila é preservada. Forçar
-- 'oc_gerada'/'finalizada' continua rejeitado (42501).
--
-- Defense-in-depth: o RLS valida o resultado, não quais colunas mudaram. Com a
-- edição liberada, o dono pode tocar qualquer coluna da PRÓPRIA solicitação
-- enquanto ela está 'recebida' (não linhas de terceiros, nem o status). Mesmo
-- trade-off discutido na 0028, aceitável porque a solicitação ainda não foi
-- trabalhada. O portal só expõe os campos do formulário.
--
-- Também adiciona o tipo de evento de auditoria `portal_solicitacao_editada`.
--
-- Script idempotente: pode ser reexecutado sem erro.

-- ============================================================
-- 1. Policy de UPDATE do parceiro: edição + cancelamento
-- ============================================================

-- Nomes antigos da policy ao longo do histórico (0018 e 0028 usaram
-- `solicitacoes_parceiro_cancel`). Removemos ambos antes de recriar.
DROP POLICY IF EXISTS solicitacoes_parceiro_cancel ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_parceiro_edit_cancel ON solicitacoes;

CREATE POLICY solicitacoes_parceiro_edit_cancel ON solicitacoes FOR UPDATE TO authenticated
  USING (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'recebida'
  )
  WITH CHECK (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status IN ('recebida', 'cancelada')
  );

-- ============================================================
-- 2. tipo_evento `portal_solicitacao_editada`
-- ============================================================

ALTER TABLE eventos_portal DROP CONSTRAINT IF EXISTS eventos_portal_tipo_evento_check;
ALTER TABLE eventos_portal ADD CONSTRAINT eventos_portal_tipo_evento_check
  CHECK (tipo_evento IN (
    'portal_login',
    'portal_login_falha',
    'portal_logout',
    'portal_solicitacao_criada',
    'portal_solicitacao_editada',
    'portal_solicitacao_cancelada',
    'portal_senha_alterada',
    'portal_usuario_convidado',
    'portal_usuario_excluido'
  ));

-- ============================================================
-- 3. registrar_evento_portal aceitando o novo tipo
-- ============================================================
-- Mesmo corpo da 0031, só ampliando a lista de tipos válidos.

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
    'portal_solicitacao_criada', 'portal_solicitacao_editada',
    'portal_solicitacao_cancelada',
    'portal_senha_alterada', 'portal_usuario_convidado',
    'portal_usuario_excluido'
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
    ELSIF p_tipo_evento IN ('portal_usuario_convidado', 'portal_usuario_excluido') THEN
      -- caller interno: aceita parceiro_id explícito do payload
      v_parceiro_id := NULLIF(p_payload->>'parceiro_id', '')::uuid;
    ELSE
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
