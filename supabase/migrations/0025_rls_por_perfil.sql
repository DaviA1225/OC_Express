-- 0025 — RLS por perfil (endurecimento pós-testes / TODO.md)
--
-- Até aqui as tabelas internas usavam `is_interno()` para TODO o CRUD: qualquer
-- usuário interno ativo (admin, gerente, supervisor, analista, assistente) podia
-- inserir/alterar/excluir qualquer cadastro. Esta migration substitui o INSERT/
-- UPDATE/DELETE por checagem de perfil, espelhando EXATAMENTE a matriz já
-- implementada no front em `apps/interno/src/features/auth/permissions.ts`
-- (fonte de verdade). O SELECT continua liberado a todo o time interno.
--
-- Matriz (escrita):
--   operacionais (subcontratadas/motoristas/veiculos/carretas):
--                                       admin, analista, assistente
--   clientes:                           admin, gerente, supervisor, analista
--   materiais:                          admin, supervisor, analista
--   cargas_retorno:                     admin, supervisor, analista
--   perfis_usuarios:                    admin
--   log_auditoria (leitura):            admin, gerente, supervisor
--
-- Fora de escopo desta migration (mantidos como is_interno()/portal):
--   solicitacoes e solicitacao_anexos — o front já restringe a edição
--   (canEditSolicitacoes) e as policies do portal são sensíveis; tratar à parte.
--
-- Script idempotente: pode ser reexecutado sem erro.

-- ============================================================
-- 1. Helper: perfil interno do usuário logado
-- ============================================================
-- SECURITY DEFINER para ler perfis_usuarios sem disparar a própria RLS
-- (evita recursão quando usado nas policies de perfis_usuarios). Retorna NULL
-- para quem não é interno ativo — assim toda checagem de perfil reprova.

CREATE OR REPLACE FUNCTION meu_perfil_interno()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT perfil FROM perfis_usuarios
  WHERE user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$;

-- ============================================================
-- 2. Cadastros operacionais — admin, analista, assistente
-- ============================================================
-- Assistente/analista precisam criar motorista/veículo/carreta/subcontratada
-- no quick-create da Nova Solicitação, por isso seguem com escrita liberada
-- para esses perfis.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'subcontratadas','motoristas','veiculos','carretas'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (is_interno())', t || '_select', t);
    EXECUTE format($f$CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (meu_perfil_interno() IN ('admin','analista','assistente'))$f$, t || '_insert', t);
    EXECUTE format($f$CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (meu_perfil_interno() IN ('admin','analista','assistente')) WITH CHECK (meu_perfil_interno() IN ('admin','analista','assistente'))$f$, t || '_update', t);
    EXECUTE format($f$CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (meu_perfil_interno() IN ('admin','analista','assistente'))$f$, t || '_delete', t);
  END LOOP;
END $$;

-- ============================================================
-- 3. clientes — admin, gerente, supervisor, analista
-- ============================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clientes_select ON clientes;
DROP POLICY IF EXISTS clientes_insert ON clientes;
DROP POLICY IF EXISTS clientes_update ON clientes;
DROP POLICY IF EXISTS clientes_delete ON clientes;
CREATE POLICY clientes_select ON clientes FOR SELECT TO authenticated USING (is_interno());
CREATE POLICY clientes_insert ON clientes FOR INSERT TO authenticated
  WITH CHECK (meu_perfil_interno() IN ('admin','gerente','supervisor','analista'));
CREATE POLICY clientes_update ON clientes FOR UPDATE TO authenticated
  USING (meu_perfil_interno() IN ('admin','gerente','supervisor','analista'))
  WITH CHECK (meu_perfil_interno() IN ('admin','gerente','supervisor','analista'));
CREATE POLICY clientes_delete ON clientes FOR DELETE TO authenticated
  USING (meu_perfil_interno() IN ('admin','gerente','supervisor','analista'));

-- ============================================================
-- 4. materiais — admin, supervisor, analista
-- ============================================================
ALTER TABLE materiais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS materiais_select ON materiais;
DROP POLICY IF EXISTS materiais_insert ON materiais;
DROP POLICY IF EXISTS materiais_update ON materiais;
DROP POLICY IF EXISTS materiais_delete ON materiais;
CREATE POLICY materiais_select ON materiais FOR SELECT TO authenticated USING (is_interno());
CREATE POLICY materiais_insert ON materiais FOR INSERT TO authenticated
  WITH CHECK (meu_perfil_interno() IN ('admin','supervisor','analista'));
CREATE POLICY materiais_update ON materiais FOR UPDATE TO authenticated
  USING (meu_perfil_interno() IN ('admin','supervisor','analista'))
  WITH CHECK (meu_perfil_interno() IN ('admin','supervisor','analista'));
CREATE POLICY materiais_delete ON materiais FOR DELETE TO authenticated
  USING (meu_perfil_interno() IN ('admin','supervisor','analista'));

-- ============================================================
-- 5. cargas_retorno — admin, supervisor, analista
-- ============================================================
-- Nota: a 0010 deixou esta tabela em `USING (true)` e a 0018 não a endureceu,
-- então até aqui QUALQUER authenticated (inclusive parceiro externo) escrevia
-- nela. Aqui ela passa a exigir perfil interno, fechando essa brecha.
ALTER TABLE cargas_retorno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cargas_retorno_select ON cargas_retorno;
DROP POLICY IF EXISTS cargas_retorno_insert ON cargas_retorno;
DROP POLICY IF EXISTS cargas_retorno_update ON cargas_retorno;
DROP POLICY IF EXISTS cargas_retorno_delete ON cargas_retorno;
CREATE POLICY cargas_retorno_select ON cargas_retorno FOR SELECT TO authenticated USING (is_interno());
CREATE POLICY cargas_retorno_insert ON cargas_retorno FOR INSERT TO authenticated
  WITH CHECK (meu_perfil_interno() IN ('admin','supervisor','analista'));
CREATE POLICY cargas_retorno_update ON cargas_retorno FOR UPDATE TO authenticated
  USING (meu_perfil_interno() IN ('admin','supervisor','analista'))
  WITH CHECK (meu_perfil_interno() IN ('admin','supervisor','analista'));
CREATE POLICY cargas_retorno_delete ON cargas_retorno FOR DELETE TO authenticated
  USING (meu_perfil_interno() IN ('admin','supervisor','analista'));

-- ============================================================
-- 6. perfis_usuarios — somente admin escreve
-- ============================================================
-- SELECT segue liberado ao time interno (nomes são resolvidos em auditoria,
-- relatórios, detalhe de solicitação etc.). A edição do próprio nome pelo
-- usuário comum sai do UPDATE direto e passa pelo RPC `atualizar_meu_nome`
-- (seção 8) — assim ninguém consegue escalar o próprio `perfil` via API.
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perfis_usuarios_select ON perfis_usuarios;
DROP POLICY IF EXISTS perfis_usuarios_insert ON perfis_usuarios;
DROP POLICY IF EXISTS perfis_usuarios_update ON perfis_usuarios;
DROP POLICY IF EXISTS perfis_usuarios_delete ON perfis_usuarios;
CREATE POLICY perfis_usuarios_select ON perfis_usuarios FOR SELECT TO authenticated USING (is_interno());
CREATE POLICY perfis_usuarios_insert ON perfis_usuarios FOR INSERT TO authenticated
  WITH CHECK (meu_perfil_interno() = 'admin');
CREATE POLICY perfis_usuarios_update ON perfis_usuarios FOR UPDATE TO authenticated
  USING (meu_perfil_interno() = 'admin')
  WITH CHECK (meu_perfil_interno() = 'admin');
CREATE POLICY perfis_usuarios_delete ON perfis_usuarios FOR DELETE TO authenticated
  USING (meu_perfil_interno() = 'admin');

-- ============================================================
-- 7. log_auditoria — leitura só admin/gerente/supervisor
-- ============================================================
-- INSERT permanece aberto: a trigger de auditoria roda como o usuário que
-- disparou a ação (inclusive parceiros). UPDATE/DELETE travados em admin —
-- o log é, na prática, imutável.
ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS log_auditoria_select ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_insert ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_update ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_delete ON log_auditoria;
CREATE POLICY log_auditoria_select ON log_auditoria FOR SELECT TO authenticated
  USING (meu_perfil_interno() IN ('admin','gerente','supervisor'));
CREATE POLICY log_auditoria_insert ON log_auditoria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY log_auditoria_update ON log_auditoria FOR UPDATE TO authenticated
  USING (meu_perfil_interno() = 'admin') WITH CHECK (meu_perfil_interno() = 'admin');
CREATE POLICY log_auditoria_delete ON log_auditoria FOR DELETE TO authenticated
  USING (meu_perfil_interno() = 'admin');

-- ============================================================
-- 8. RPC: usuário comum altera só o próprio nome
-- ============================================================
-- Substitui o UPDATE direto que o PerfilPage fazia em perfis_usuarios. Como o
-- UPDATE agora é admin-only, sem isto o usuário comum não conseguiria editar o
-- próprio nome. A função toca SOMENTE nome_completo da própria linha — não há
-- como mexer em `perfil` ou `ativo` por aqui (sem risco de escalonamento).
CREATE OR REPLACE FUNCTION atualizar_meu_nome(novo_nome text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome text := btrim(novo_nome);
BEGIN
  IF v_nome IS NULL OR char_length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome inválido' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE perfis_usuarios
     SET nome_completo = v_nome
   WHERE user_id = auth.uid() AND ativo = true;
END;
$$;

REVOKE ALL ON FUNCTION atualizar_meu_nome(text) FROM public;
GRANT EXECUTE ON FUNCTION atualizar_meu_nome(text) TO authenticated;
