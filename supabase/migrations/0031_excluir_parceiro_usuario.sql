-- 0031 — Permite excluir definitivamente um parceiro_usuario
--
-- Cenário: usuário sai do parceiro A e vai pro parceiro B. Hoje "Desativar"
-- só seta `parceiro_usuarios.ativo=false`, mas o e-mail continua preso em
-- `auth.users` e a Edge Function `convidar-parceiro-usuario` rejeita reuso
-- (responde `email_inativo_existente`). Pra liberar o e-mail, é preciso
-- deletar a linha em `auth.users` — que cascateia em `parceiro_usuarios`
-- pelo `ON DELETE CASCADE` da FK `user_id` (migration 0018).
--
-- Bloqueio atual: `solicitacoes.parceiro_usuario_id REFERENCES
-- parceiro_usuarios(id)` foi criado SEM `ON DELETE` (default = NO ACTION),
-- então tentar apagar um usuário que já criou solicitações dispara erro de
-- FK e a transação aborta. Esta migration troca essa FK por `ON DELETE
-- SET NULL` — preserva a solicitação no histórico (rastreio interno fica
-- intacto) e só anula a referência ao usuário deletado. Mesmo padrão já
-- usado em `eventos_portal.parceiro_usuario_id` (migration 0021).
--
-- Também amplia o `tipo_evento` de `eventos_portal` com `portal_usuario_excluido`
-- (a Edge Function nova `excluir-parceiro-usuario` registra esse evento) e
-- atualiza `registrar_evento_portal` pra aceitá-lo. Mesmo modelo do interno-
-- convida-portal (`portal_usuario_convidado`): se o caller não tem vínculo
-- de parceiro, lê `parceiro_id` do payload.
--
-- Script idempotente.

-- ============================================================
-- 1. FK solicitacoes.parceiro_usuario_id → ON DELETE SET NULL
-- ============================================================
-- Reescrita: DROP CONSTRAINT + ADD CONSTRAINT. Idempotente porque o IF EXISTS
-- cobre o DROP, e o ADD usa um nome explícito (o IF NOT EXISTS na própria
-- linha não funciona para constraint; usamos DO block).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'solicitacoes_parceiro_usuario_id_fkey'
      AND conrelid = 'public.solicitacoes'::regclass
  ) THEN
    ALTER TABLE solicitacoes DROP CONSTRAINT solicitacoes_parceiro_usuario_id_fkey;
  END IF;
  -- Se a FK tem outro nome (raro, mas possível), o DROP acima é no-op e o ADD
  -- abaixo dá erro de duplicação. Para cobrir esse caso, dropamos qualquer FK
  -- que aponte pra parceiro_usuarios a partir dessa coluna.
  PERFORM 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    WHERE c.conrelid = 'public.solicitacoes'::regclass
      AND a.attname = 'parceiro_usuario_id'
      AND c.contype = 'f';
  -- (não é dropado em massa para não apagar algo inesperado; o caso normal
  -- já foi tratado acima)
END $$;

ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_parceiro_usuario_id_fkey
  FOREIGN KEY (parceiro_usuario_id)
  REFERENCES parceiro_usuarios(id)
  ON DELETE SET NULL;

-- ============================================================
-- 2. tipo_evento `portal_usuario_excluido`
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
    'portal_usuario_convidado',
    'portal_usuario_excluido'
  ));

-- ============================================================
-- 3. registrar_evento_portal aceitando o novo tipo
-- ============================================================
-- Mesmo corpo da 0023, só ampliando a lista de tipos válidos. Caller pode
-- ser interno OU admin_parceiro; para o caso interno (sem vínculo de parceiro)
-- lemos `parceiro_id` do payload — mesmo padrão de `portal_usuario_convidado`.

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
