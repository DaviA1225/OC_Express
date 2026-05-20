-- 0018 — Portal de Parceiros: tabelas, RLS e view (Fase 8.1 / SPEC-PORTAL §3-4)
--
-- Camada de dados do portal externo: tabelas parceiro_*, vínculo em
-- solicitacoes, funções e políticas RLS, e a view portal_solicitacoes.
--
-- Aplica as decisões fechadas no Bloco 1 (docs/BACKLOG-PORTAL.md):
--   - o parceiro lê solicitações pela view portal_solicitacoes (SECURITY
--     DEFINER); NÃO recebe policy de SELECT na tabela solicitacoes;
--   - as tabelas internas deixam de ser "authenticated USING(true)" e passam
--     a exigir is_interno() — bloqueio explícito de acesso externo (SPEC 4.5).
--
-- Script idempotente: pode ser reexecutado sem erro.

-- ============================================================
-- 1. Tabelas parceiro_*
-- ============================================================

CREATE TABLE IF NOT EXISTS parceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  cnpj text UNIQUE NOT NULL,
  contato_principal_nome text,
  contato_principal_telefone text,
  contato_principal_email text,
  codigo_interno text UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  observacoes_internas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS parceiro_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  email text NOT NULL,
  perfil text NOT NULL CHECK (perfil IN ('admin_parceiro', 'operador_parceiro')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS parceiro_subcontratadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  razao_social text NOT NULL,
  cnpj text,
  contato_nome text,
  contato_telefone text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
-- CNPJ único por parceiro, apenas quando informado.
-- Embrulhado num DO block porque, no script cumulativo reexecutado depois da
-- migration 0019, a coluna `cnpj` ja foi renomeada para `documento` — neste
-- caso, pulamos a criação aqui (a 0019 cria o índice novo). Usamos EXECUTE
-- para que o SQL interno fique dentro de uma string e nao confunda parsers
-- que dividem statements por ";" no nivel de cima.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'parceiro_subcontratadas'
       AND column_name  = 'cnpj'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_parceiro_subcontratadas_cnpj ON parceiro_subcontratadas (parceiro_id, cnpj) WHERE cnpj IS NOT NULL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS parceiro_motoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  cpf text NOT NULL,
  rg text,
  antt text,
  telefone text,
  subcontratada_parceiro_id uuid REFERENCES parceiro_subcontratadas(id) ON DELETE SET NULL,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (parceiro_id, cpf)
);

CREATE TABLE IF NOT EXISTS parceiro_veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  placa text NOT NULL,
  tipo text,
  subcontratada_parceiro_id uuid REFERENCES parceiro_subcontratadas(id) ON DELETE SET NULL,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (parceiro_id, placa)
);

CREATE TABLE IF NOT EXISTS parceiro_carretas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  placa text NOT NULL,
  tipo text,
  capacidade_ton numeric,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (parceiro_id, placa)
);

CREATE INDEX IF NOT EXISTS idx_parceiro_usuarios_parceiro ON parceiro_usuarios(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiro_subcontratadas_parceiro ON parceiro_subcontratadas(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiro_motoristas_parceiro ON parceiro_motoristas(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiro_veiculos_parceiro ON parceiro_veiculos(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiro_carretas_parceiro ON parceiro_carretas(parceiro_id);

-- ============================================================
-- 2. Triggers (updated_at + auditoria) nas tabelas parceiro_*
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'parceiros','parceiro_usuarios','parceiro_subcontratadas',
    'parceiro_motoristas','parceiro_veiculos','parceiro_carretas'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_updated', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', 'trg_' || t || '_updated', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'aud_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_trigger()', 'aud_' || t, t);
  END LOOP;
END $$;

-- ============================================================
-- 3. Vínculo do parceiro em solicitacoes
-- ============================================================

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS parceiro_id uuid REFERENCES parceiros(id),
  ADD COLUMN IF NOT EXISTS parceiro_usuario_id uuid REFERENCES parceiro_usuarios(id),
  ADD COLUMN IF NOT EXISTS parceiro_motorista_id uuid REFERENCES parceiro_motoristas(id),
  ADD COLUMN IF NOT EXISTS parceiro_veiculo_id uuid REFERENCES parceiro_veiculos(id),
  ADD COLUMN IF NOT EXISTS parceiro_carreta_id uuid REFERENCES parceiro_carretas(id),
  ADD COLUMN IF NOT EXISTS parceiro_subcontratada_id uuid REFERENCES parceiro_subcontratadas(id),
  ADD COLUMN IF NOT EXISTS observacoes_internas text;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro ON solicitacoes(parceiro_id);

-- Material obrigatório quando a solicitação avança no fluxo. Solicitações de
-- retorno são isentas (não têm material). NOT VALID: não varre linhas legadas,
-- passa a valer só para registros novos/alterados.
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_material_obrigatorio_apos_cadastro;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_material_obrigatorio_apos_cadastro
  CHECK (
    status IN ('recebida', 'cancelada')
    OR tipo = 'retorno'
    OR material_id IS NOT NULL
  ) NOT VALID;

-- Integridade de origem: solicitação de parceiro usa apenas referências
-- parceiro_*; solicitação interna/e-mail não usa nenhuma referência parceiro_*.
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_integridade;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_integridade
  CHECK (
    (origem = 'parceiro'
      AND parceiro_id IS NOT NULL
      AND parceiro_usuario_id IS NOT NULL
      AND parceiro_motorista_id IS NOT NULL
      AND parceiro_veiculo_id IS NOT NULL
      AND motorista_id IS NULL
      AND veiculo_id IS NULL
      AND carreta_id IS NULL
      AND subcontratada_id IS NULL)
    OR
    (origem <> 'parceiro'
      AND parceiro_id IS NULL
      AND parceiro_usuario_id IS NULL
      AND parceiro_motorista_id IS NULL
      AND parceiro_veiculo_id IS NULL
      AND parceiro_carreta_id IS NULL
      AND parceiro_subcontratada_id IS NULL)
  ) NOT VALID;

-- ============================================================
-- 4. Funções auxiliares de RLS (SECURITY DEFINER evita recursão de RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_parceiro_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT parceiro_id FROM parceiro_usuarios
  WHERE user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_interno()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE user_id = auth.uid() AND ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION is_admin_parceiro()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parceiro_usuarios
    WHERE user_id = auth.uid() AND perfil = 'admin_parceiro' AND ativo = true
  );
$$;

-- ============================================================
-- 5. RLS — bloqueio das tabelas internas (somente is_interno())
-- ============================================================
-- Troca as políticas permissivas "authenticated USING(true)" da 0001/0010/0014
-- por políticas restritas ao time interno. solicitacoes e log_auditoria são
-- tratadas à parte logo abaixo.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'perfis_usuarios','subcontratadas','motoristas','veiculos','carretas',
    'clientes','materiais','cargas_retorno','solicitacao_anexos'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (is_interno())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (is_interno())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (is_interno()) WITH CHECK (is_interno())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (is_interno())', t || '_delete', t);
  END LOOP;
END $$;

-- log_auditoria: leitura só interna, mas INSERT permanece aberto — a trigger de
-- auditoria roda como o usuário que disparou a ação (inclusive parceiros);
-- bloquear o INSERT aqui impediria parceiros de criar/alterar registros.
ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS log_auditoria_select ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_insert ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_update ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_delete ON log_auditoria;
CREATE POLICY log_auditoria_select ON log_auditoria FOR SELECT TO authenticated USING (is_interno());
CREATE POLICY log_auditoria_insert ON log_auditoria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY log_auditoria_update ON log_auditoria FOR UPDATE TO authenticated USING (is_interno()) WITH CHECK (is_interno());
CREATE POLICY log_auditoria_delete ON log_auditoria FOR DELETE TO authenticated USING (is_interno());

-- ============================================================
-- 6. RLS — solicitacoes
-- ============================================================
-- Interno faz tudo. Parceiro só cria a própria (origem='parceiro') e cancela
-- enquanto status='recebida'. Parceiro NÃO tem SELECT: lê pela view
-- portal_solicitacoes (Bloco 1). Sem SELECT, UPDATE ... RETURNING também não
-- devolve colunas ao parceiro.

ALTER TABLE solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS solicitacoes_select ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_insert ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_update ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_delete ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_interno_select ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_interno_insert ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_interno_update ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_interno_delete ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_parceiro_insert ON solicitacoes;
DROP POLICY IF EXISTS solicitacoes_parceiro_cancel ON solicitacoes;

CREATE POLICY solicitacoes_interno_select ON solicitacoes FOR SELECT TO authenticated USING (is_interno());
CREATE POLICY solicitacoes_interno_insert ON solicitacoes FOR INSERT TO authenticated WITH CHECK (is_interno());
CREATE POLICY solicitacoes_interno_update ON solicitacoes FOR UPDATE TO authenticated USING (is_interno()) WITH CHECK (is_interno());
CREATE POLICY solicitacoes_interno_delete ON solicitacoes FOR DELETE TO authenticated USING (is_interno());

CREATE POLICY solicitacoes_parceiro_insert ON solicitacoes FOR INSERT TO authenticated
  WITH CHECK (origem = 'parceiro' AND parceiro_id = get_current_parceiro_id());
CREATE POLICY solicitacoes_parceiro_cancel ON solicitacoes FOR UPDATE TO authenticated
  USING (origem = 'parceiro' AND parceiro_id = get_current_parceiro_id() AND status = 'recebida')
  WITH CHECK (origem = 'parceiro' AND parceiro_id = get_current_parceiro_id());

-- ============================================================
-- 7. RLS — parceiros e parceiro_usuarios
-- ============================================================

ALTER TABLE parceiros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parceiros_select ON parceiros;
DROP POLICY IF EXISTS parceiros_interno_all ON parceiros;
CREATE POLICY parceiros_select ON parceiros FOR SELECT TO authenticated
  USING (id = get_current_parceiro_id() OR is_interno());
CREATE POLICY parceiros_interno_all ON parceiros FOR ALL TO authenticated
  USING (is_interno()) WITH CHECK (is_interno());

ALTER TABLE parceiro_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parceiro_usuarios_select ON parceiro_usuarios;
DROP POLICY IF EXISTS parceiro_usuarios_interno_all ON parceiro_usuarios;
DROP POLICY IF EXISTS parceiro_usuarios_admin_all ON parceiro_usuarios;
CREATE POLICY parceiro_usuarios_select ON parceiro_usuarios FOR SELECT TO authenticated
  USING (parceiro_id = get_current_parceiro_id() OR is_interno());
CREATE POLICY parceiro_usuarios_interno_all ON parceiro_usuarios FOR ALL TO authenticated
  USING (is_interno()) WITH CHECK (is_interno());
CREATE POLICY parceiro_usuarios_admin_all ON parceiro_usuarios FOR ALL TO authenticated
  USING (is_admin_parceiro() AND parceiro_id = get_current_parceiro_id())
  WITH CHECK (is_admin_parceiro() AND parceiro_id = get_current_parceiro_id());

-- ============================================================
-- 8. RLS — cadastros do parceiro (motoristas/veiculos/carretas/subcontratadas)
-- ============================================================
-- Parceiro vê/cria/edita apenas os seus. Time interno tem leitura de todos.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'parceiro_motoristas','parceiro_veiculos','parceiro_carretas','parceiro_subcontratadas'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_parceiro_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_parceiro_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_parceiro_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_interno_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (parceiro_id = get_current_parceiro_id())', t || '_parceiro_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (parceiro_id = get_current_parceiro_id())', t || '_parceiro_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (parceiro_id = get_current_parceiro_id()) WITH CHECK (parceiro_id = get_current_parceiro_id())', t || '_parceiro_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (is_interno())', t || '_interno_select', t);
  END LOOP;
END $$;

-- ============================================================
-- 9. View portal_solicitacoes (Bloco 1)
-- ============================================================
-- SECURITY DEFINER: roda com privilégio do dono, ignora a RLS de solicitacoes
-- e faz o próprio filtro. Expõe só colunas seguras — sem numero_instrucao,
-- pdf_url, atendente_id, material_id, observacoes_internas etc.

CREATE OR REPLACE VIEW portal_solicitacoes
WITH (security_invoker = false) AS
SELECT id, numero_interno, tipo, status, origem,
       parceiro_id, parceiro_usuario_id, parceiro_motorista_id,
       parceiro_veiculo_id, parceiro_carreta_id, parceiro_subcontratada_id,
       cliente_id, pamcard_status, pamcard_numero,
       observacoes, created_at, enviada_em, finalizada_em
FROM solicitacoes
WHERE origem = 'parceiro' AND parceiro_id = get_current_parceiro_id();

GRANT SELECT ON portal_solicitacoes TO authenticated;

COMMENT ON VIEW portal_solicitacoes IS
  'Solicitações do parceiro logado, apenas com colunas seguras. O portal lê '
  'por aqui; o parceiro não tem policy de SELECT na tabela solicitacoes.';
