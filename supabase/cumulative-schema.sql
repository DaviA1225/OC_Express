-- =====================================================================
-- OC Express / SisLog LHG — Schema cumulativo (migrations 0001 → 0021)
-- =====================================================================
--
-- Este arquivo agrega TODAS as migrations num único script IDEMPOTENTE.
-- Pode ser executado quantas vezes precisar no SQL Editor do Supabase
-- sem erro: cada CREATE usa IF NOT EXISTS, cada CREATE POLICY/TRIGGER e
-- precedido de DROP IF EXISTS, e renomes/migracoes ficam em DO blocks
-- com checagem em information_schema.
--
-- Quando criar uma migration nova em supabase/migrations/, refletir aqui
-- (no fim, antes da secao "Operacional / vinculos de usuario").
--
-- Estrutura:
--   1. Helpers (funcoes auxiliares)
--   2. Tabelas internas (perfis, cadastros, solicitacoes, anexos, log)
--   3. Patches em colunas (frete, tipo de carga, hierarquia, pamcard, ...)
--   4. Realtime publication
--   5. Storage bucket ocs-pdf (PDFs das OCs)
--   6. Storage bucket solicitacoes-anexos (anexos)
--   7. Tabelas do Portal de Parceiros (parceiros, parceiro_*)
--   8. View clientes_publicos + portal_solicitacoes
--   9. RLS endurecida (is_interno, get_current_parceiro_id, ...)
--  10. Operacional / vinculos de usuario (opcional)
-- =====================================================================


-- =====================================================================
-- 1. Helpers genericos
-- =====================================================================

-- Limpa tabelas legadas do backend FastAPI antigo. CASCADE remove FKs.
DROP TABLE IF EXISTS ordens CASCADE;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 2. Tabelas internas
-- =====================================================================

-- ---------- perfis_usuarios ----------
CREATE TABLE IF NOT EXISTS perfis_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  perfil text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
DROP TRIGGER IF EXISTS trg_perfis_usuarios_updated ON perfis_usuarios;
CREATE TRIGGER trg_perfis_usuarios_updated BEFORE UPDATE ON perfis_usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- subcontratadas ----------
CREATE TABLE IF NOT EXISTS subcontratadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  cnpj text UNIQUE,
  contato_nome text,
  contato_telefone text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
DROP TRIGGER IF EXISTS trg_subcontratadas_updated ON subcontratadas;
CREATE TRIGGER trg_subcontratadas_updated BEFORE UPDATE ON subcontratadas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- motoristas ----------
CREATE TABLE IF NOT EXISTS motoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  cpf text NOT NULL UNIQUE,
  rg text,
  antt text,
  telefone text,
  subcontratada_id uuid REFERENCES subcontratadas(id) ON DELETE SET NULL,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_motoristas_cpf ON motoristas(cpf);
CREATE INDEX IF NOT EXISTS idx_motoristas_subcontratada ON motoristas(subcontratada_id);
DROP TRIGGER IF EXISTS trg_motoristas_updated ON motoristas;
CREATE TRIGGER trg_motoristas_updated BEFORE UPDATE ON motoristas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- veiculos ----------
CREATE TABLE IF NOT EXISTS veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL UNIQUE,
  tipo text,
  subcontratada_id uuid REFERENCES subcontratadas(id) ON DELETE SET NULL,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa);
DROP TRIGGER IF EXISTS trg_veiculos_updated ON veiculos;
CREATE TRIGGER trg_veiculos_updated BEFORE UPDATE ON veiculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- carretas ----------
CREATE TABLE IF NOT EXISTS carretas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL UNIQUE,
  tipo text,
  capacidade_ton numeric,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_carretas_placa ON carretas(placa);
DROP TRIGGER IF EXISTS trg_carretas_updated ON carretas;
CREATE TRIGGER trg_carretas_updated BEFORE UPDATE ON carretas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- clientes ----------
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  cnpj text,
  endereco text,
  cidade text,
  uf text,
  latitude numeric,
  longitude numeric,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
DROP TRIGGER IF EXISTS trg_clientes_updated ON clientes;
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- materiais ----------
CREATE TABLE IF NOT EXISTS materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cnpj_filial text NOT NULL,
  filial text NOT NULL,
  origem_padrao text,
  destino_padrao text,
  observacoes_padrao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
DROP TRIGGER IF EXISTS trg_materiais_updated ON materiais;
CREATE TRIGGER trg_materiais_updated BEFORE UPDATE ON materiais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- solicitacoes ----------
CREATE TABLE IF NOT EXISTS solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_interno serial UNIQUE NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('carregamento', 'retorno')),
  status text NOT NULL CHECK (status IN (
    'recebida', 'em_cadastro', 'instrucao_emitida',
    'oc_gerada', 'oc_enviada', 'finalizada', 'cancelada'
  )) DEFAULT 'recebida',
  solicitante_nome text,
  solicitante_telefone text,
  motorista_id uuid REFERENCES motoristas(id) ON DELETE SET NULL,
  veiculo_id uuid REFERENCES veiculos(id) ON DELETE SET NULL,
  carreta_id uuid REFERENCES carretas(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  material_id uuid REFERENCES materiais(id) ON DELETE SET NULL,
  numero_instrucao text,
  observacoes text,
  atendente_id uuid REFERENCES auth.users(id),
  pdf_url text,
  enviada_em timestamptz,
  finalizada_em timestamptz,
  cte_emitido boolean NOT NULL DEFAULT false,
  mdfe_emitido boolean NOT NULL DEFAULT false,
  vale_pedagio boolean NOT NULL DEFAULT false,
  documentado_por uuid REFERENCES auth.users(id),
  documentado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_tipo ON solicitacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_atendente ON solicitacoes(atendente_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_created_at ON solicitacoes(created_at DESC);
DROP TRIGGER IF EXISTS trg_solicitacoes_updated ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_updated BEFORE UPDATE ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- log_auditoria + trigger ----------
CREATE TABLE IF NOT EXISTS log_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES auth.users(id),
  acao text NOT NULL,
  tabela text NOT NULL,
  registro_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_tabela ON log_auditoria(tabela);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_usuario ON log_auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_created_at ON log_auditoria(created_at DESC);

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_user uuid;
BEGIN
  BEGIN
    v_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_depois)
    VALUES (v_user, 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
    VALUES (v_user, 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes)
    VALUES (v_user, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7 audit triggers nas tabelas internas
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'solicitacoes','motoristas','veiculos','carretas','clientes','materiais','subcontratadas'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'aud_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_trigger()', 'aud_' || t, t);
  END LOOP;
END $$;


-- =====================================================================
-- 3. Patches em colunas (migrations 0003 - 0016)
-- =====================================================================

-- 0003 — carretas.subcontratada_id
ALTER TABLE carretas
  ADD COLUMN IF NOT EXISTS subcontratada_id uuid REFERENCES subcontratadas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_carretas_subcontratada ON carretas(subcontratada_id);

-- 0004 — clientes.frete_ton + liberado
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS frete_ton numeric,
  ADD COLUMN IF NOT EXISTS liberado boolean NOT NULL DEFAULT true;

-- 0005 — clientes.aceita_cacamba + aceita_graneleiro
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS aceita_cacamba boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_graneleiro boolean NOT NULL DEFAULT true;

-- 0006 — clientes.frete_cacamba + frete_graneleiro (substitui frete_ton)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS frete_cacamba numeric,
  ADD COLUMN IF NOT EXISTS frete_graneleiro numeric;
UPDATE clientes
   SET frete_cacamba    = COALESCE(frete_cacamba,    frete_ton),
       frete_graneleiro = COALESCE(frete_graneleiro, frete_ton)
 WHERE frete_ton IS NOT NULL;

-- 0007 — subcontratadas: cnpj -> documento + tipo_pessoa (PF/PJ)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'subcontratadas'
       AND column_name  = 'cnpj'
  ) THEN
    ALTER TABLE subcontratadas RENAME COLUMN cnpj TO documento;
  END IF;
END $$;
ALTER TABLE subcontratadas
  ADD COLUMN IF NOT EXISTS tipo_pessoa text;
ALTER TABLE subcontratadas
  DROP CONSTRAINT IF EXISTS subcontratadas_tipo_pessoa_check;
ALTER TABLE subcontratadas
  ADD CONSTRAINT subcontratadas_tipo_pessoa_check
  CHECK (tipo_pessoa IS NULL OR tipo_pessoa IN ('PF', 'PJ'));

-- 0008 — solicitacoes: material_subtipo + local_carregamento + validades
ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS material_subtipo text,
  ADD COLUMN IF NOT EXISTS local_carregamento text,
  ADD COLUMN IF NOT EXISTS validade_inicio date,
  ADD COLUMN IF NOT EXISTS validade_fim date;
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_material_subtipo_check;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_material_subtipo_check
  CHECK (material_subtipo IS NULL OR material_subtipo IN ('SINTER', 'HEMATITA', 'LUMP'));

-- 0009 — solicitacoes.subcontratada_id
ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS subcontratada_id uuid REFERENCES subcontratadas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_subcontratada ON solicitacoes(subcontratada_id);

-- 0010 — cargas_retorno
CREATE TABLE IF NOT EXISTS cargas_retorno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  local_carregamento text NOT NULL,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cargas_retorno_cliente ON cargas_retorno(cliente_id);
DROP TRIGGER IF EXISTS trg_cargas_retorno_updated ON cargas_retorno;
CREATE TRIGGER trg_cargas_retorno_updated BEFORE UPDATE ON cargas_retorno
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS aud_cargas_retorno ON cargas_retorno;
CREATE TRIGGER aud_cargas_retorno AFTER INSERT OR UPDATE OR DELETE ON cargas_retorno
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- 0011 — clientes.cliente_minerio + cliente_retorno
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cliente_minerio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cliente_retorno boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_clientes_cliente_minerio ON clientes(cliente_minerio) WHERE cliente_minerio = true;
CREATE INDEX IF NOT EXISTS idx_clientes_cliente_retorno ON clientes(cliente_retorno) WHERE cliente_retorno = true;

-- 0012 — perfis_usuarios: nova hierarquia (5 niveis)
ALTER TABLE perfis_usuarios
  DROP CONSTRAINT IF EXISTS perfis_usuarios_perfil_check;
UPDATE perfis_usuarios SET perfil = 'assistente' WHERE perfil = 'atendente';
UPDATE perfis_usuarios SET perfil = 'analista'   WHERE perfil = 'documentacao';
ALTER TABLE perfis_usuarios
  ADD CONSTRAINT perfis_usuarios_perfil_check
  CHECK (perfil IN ('admin', 'gerente', 'supervisor', 'analista', 'assistente'));

-- 0015 — materiais.requer_instrucao
ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS requer_instrucao boolean NOT NULL DEFAULT true;

-- 0016 — solicitacoes: pamcard (status + numero + providenciado) + origem
ALTER TABLE solicitacoes DROP COLUMN IF EXISTS pamcard;
ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS pamcard_status text NOT NULL DEFAULT 'nao_tem_cartao',
  ADD COLUMN IF NOT EXISTS pamcard_numero text,
  ADD COLUMN IF NOT EXISTS pamcard_providenciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pamcard_providenciado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'interno';
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_status_check;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_status_check
  CHECK (pamcard_status IN ('tem_cartao', 'nao_tem_cartao'));
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_check;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_check
  CHECK (origem IN ('interno', 'parceiro', 'email'));
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_numero_quando_tem;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_numero_quando_tem
  CHECK (
    (pamcard_status = 'tem_cartao'
      AND pamcard_numero IS NOT NULL
      AND pamcard_numero ~ '^[0-9]{10,16}$')
    OR
    (pamcard_status = 'nao_tem_cartao' AND pamcard_numero IS NULL)
  );
CREATE INDEX IF NOT EXISTS idx_solicitacoes_pamcard_pendente
  ON solicitacoes (pamcard_status, pamcard_providenciado_em)
  WHERE pamcard_status = 'nao_tem_cartao' AND pamcard_providenciado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_origem ON solicitacoes (origem);


-- =====================================================================
-- 4. Realtime publication (0013)
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'solicitacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE solicitacoes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cargas_retorno'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cargas_retorno;
  END IF;
END $$;


-- =====================================================================
-- 5. Storage bucket ocs-pdf (PDFs das OCs)
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('ocs-pdf', 'ocs-pdf', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ocs_pdf_select" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_insert" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_update" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_delete" ON storage.objects;
CREATE POLICY "ocs_pdf_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ocs-pdf');
CREATE POLICY "ocs_pdf_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ocs-pdf');
CREATE POLICY "ocs_pdf_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'ocs-pdf');
CREATE POLICY "ocs_pdf_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ocs-pdf');


-- =====================================================================
-- 6. solicitacao_anexos + bucket solicitacoes-anexos (0014)
-- =====================================================================
-- Bucket privado, URLs assinadas. As policies finais (apertadas) sao
-- definidas na secao 9 (after-portal).

CREATE TABLE IF NOT EXISTS solicitacao_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solicitacao_anexos_solicitacao ON solicitacao_anexos(solicitacao_id);

DROP TRIGGER IF EXISTS trg_solicitacao_anexos_updated ON solicitacao_anexos;
CREATE TRIGGER trg_solicitacao_anexos_updated BEFORE UPDATE ON solicitacao_anexos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS aud_solicitacao_anexos ON solicitacao_anexos;
CREATE TRIGGER aud_solicitacao_anexos AFTER INSERT OR UPDATE OR DELETE ON solicitacao_anexos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

INSERT INTO storage.buckets (id, name, public)
VALUES ('solicitacoes-anexos', 'solicitacoes-anexos', false)
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- 7. View clientes_publicos (0017) — Portal de Parceiros / Bloco 1
-- =====================================================================
-- View SECURITY DEFINER: o portal le clientes ativos sem ver dados
-- comerciais (frete, liberado, observacoes).

CREATE OR REPLACE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf
FROM clientes
WHERE ativo = true;

GRANT SELECT ON clientes_publicos TO authenticated;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos com colunas seguras para o Portal de Parceiros. '
  'Nunca expor dados comerciais (frete, liberado, observacoes).';


-- =====================================================================
-- 8. Tabelas do Portal de Parceiros (0018 + 0019)
-- =====================================================================

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

-- Tabela criada com `cnpj` (0018); a 0019 renomeia para `documento`. O
-- IF NOT EXISTS pula a criacao na reexecucao apos a 0019.
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

-- 0019 — parceiro_subcontratadas: cnpj -> documento + tipo_pessoa
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'parceiro_subcontratadas'
       AND column_name  = 'cnpj'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'parceiro_subcontratadas'
       AND column_name  = 'documento'
  ) THEN
    ALTER TABLE public.parceiro_subcontratadas RENAME COLUMN cnpj TO documento;
  END IF;
END $$;

ALTER TABLE parceiro_subcontratadas
  ADD COLUMN IF NOT EXISTS tipo_pessoa text;
ALTER TABLE parceiro_subcontratadas
  DROP CONSTRAINT IF EXISTS parceiro_subcontratadas_tipo_pessoa_check;
ALTER TABLE parceiro_subcontratadas
  ADD CONSTRAINT parceiro_subcontratadas_tipo_pessoa_check
  CHECK (tipo_pessoa IS NULL OR tipo_pessoa IN ('PF','PJ'));

-- Backfill tipo_pessoa pelas linhas existentes (11 digitos = PF, 14 = PJ).
UPDATE parceiro_subcontratadas
   SET tipo_pessoa = CASE length(regexp_replace(coalesce(documento,''), '\D', '', 'g'))
                       WHEN 11 THEN 'PF'
                       WHEN 14 THEN 'PJ'
                       ELSE tipo_pessoa
                     END
 WHERE tipo_pessoa IS NULL AND documento IS NOT NULL;

-- Troca o unique index — de (parceiro_id, cnpj) para (parceiro_id, documento).
DROP INDEX IF EXISTS public.uq_parceiro_subcontratadas_cnpj;
CREATE UNIQUE INDEX IF NOT EXISTS uq_parceiro_subcontratadas_documento
  ON parceiro_subcontratadas (parceiro_id, documento)
  WHERE documento IS NOT NULL;

-- 0019 — parceiro_carretas.subcontratada_parceiro_id (FK + index)
ALTER TABLE parceiro_carretas
  ADD COLUMN IF NOT EXISTS subcontratada_parceiro_id uuid;
ALTER TABLE parceiro_carretas
  DROP CONSTRAINT IF EXISTS parceiro_carretas_subcontratada_parceiro_id_fkey;
ALTER TABLE parceiro_carretas
  ADD CONSTRAINT parceiro_carretas_subcontratada_parceiro_id_fkey
  FOREIGN KEY (subcontratada_parceiro_id)
  REFERENCES parceiro_subcontratadas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_parceiro_carretas_subcontratada
  ON parceiro_carretas (subcontratada_parceiro_id);

-- 0018 — triggers (updated_at + auditoria) nas tabelas parceiro_*
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

-- 0018 — vinculo do parceiro em solicitacoes
ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS parceiro_id uuid REFERENCES parceiros(id),
  ADD COLUMN IF NOT EXISTS parceiro_usuario_id uuid REFERENCES parceiro_usuarios(id),
  ADD COLUMN IF NOT EXISTS parceiro_motorista_id uuid REFERENCES parceiro_motoristas(id),
  ADD COLUMN IF NOT EXISTS parceiro_veiculo_id uuid REFERENCES parceiro_veiculos(id),
  ADD COLUMN IF NOT EXISTS parceiro_carreta_id uuid REFERENCES parceiro_carretas(id),
  ADD COLUMN IF NOT EXISTS parceiro_subcontratada_id uuid REFERENCES parceiro_subcontratadas(id),
  ADD COLUMN IF NOT EXISTS observacoes_internas text;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro ON solicitacoes(parceiro_id);

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_material_obrigatorio_apos_cadastro;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_material_obrigatorio_apos_cadastro
  CHECK (
    status IN ('recebida', 'cancelada')
    OR tipo = 'retorno'
    OR material_id IS NOT NULL
  ) NOT VALID;

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


-- =====================================================================
-- 9. RLS — funcoes auxiliares + policies finais (0018 + 0020)
-- =====================================================================

-- ---------- Funcoes auxiliares (SECURITY DEFINER) ----------

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

CREATE OR REPLACE FUNCTION solicitacao_pertence_ao_parceiro_logado(p_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes
     WHERE id = p_id
       AND origem = 'parceiro'
       AND parceiro_id = get_current_parceiro_id()
  );
$$;

CREATE OR REPLACE FUNCTION storage_anexo_pertence_ao_parceiro_logado(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes
     WHERE id::text = split_part(p_name, '/', 1)
       AND origem = 'parceiro'
       AND parceiro_id = get_current_parceiro_id()
  );
$$;

-- ---------- RLS: tabelas internas restritas a is_interno() ----------
-- Substitui as policies permissivas "USING (true)" do schema base.

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

-- log_auditoria: leitura interna; INSERT aberto p/ trigger funcionar para parceiros.
ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS log_auditoria_select ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_insert ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_update ON log_auditoria;
DROP POLICY IF EXISTS log_auditoria_delete ON log_auditoria;
CREATE POLICY log_auditoria_select ON log_auditoria FOR SELECT TO authenticated USING (is_interno());
CREATE POLICY log_auditoria_insert ON log_auditoria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY log_auditoria_update ON log_auditoria FOR UPDATE TO authenticated USING (is_interno()) WITH CHECK (is_interno());
CREATE POLICY log_auditoria_delete ON log_auditoria FOR DELETE TO authenticated USING (is_interno());

-- ---------- RLS: solicitacoes (interno = tudo; parceiro = INSERT + cancela) ----------

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

-- ---------- RLS: parceiros e parceiro_usuarios ----------

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

-- ---------- RLS: cadastros do parceiro ----------

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

-- ---------- RLS apertada de solicitacao_anexos (0020) ----------

DROP POLICY IF EXISTS solicitacao_anexos_select ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_insert ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_update ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_delete ON solicitacao_anexos;

CREATE POLICY solicitacao_anexos_select ON solicitacao_anexos
  FOR SELECT TO authenticated
  USING (is_interno() OR solicitacao_pertence_ao_parceiro_logado(solicitacao_id));

CREATE POLICY solicitacao_anexos_insert ON solicitacao_anexos
  FOR INSERT TO authenticated
  WITH CHECK (is_interno() OR solicitacao_pertence_ao_parceiro_logado(solicitacao_id));

CREATE POLICY solicitacao_anexos_update ON solicitacao_anexos
  FOR UPDATE TO authenticated
  USING (is_interno()) WITH CHECK (is_interno());

CREATE POLICY solicitacao_anexos_delete ON solicitacao_anexos
  FOR DELETE TO authenticated
  USING (is_interno() OR solicitacao_pertence_ao_parceiro_logado(solicitacao_id));

-- ---------- RLS apertada do bucket solicitacoes-anexos (0020) ----------

DROP POLICY IF EXISTS "solicitacoes_anexos_select" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_insert" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_update" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_delete" ON storage.objects;

CREATE POLICY "solicitacoes_anexos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'solicitacoes-anexos' AND (
      is_interno() OR storage_anexo_pertence_ao_parceiro_logado(name)
    )
  );

CREATE POLICY "solicitacoes_anexos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'solicitacoes-anexos' AND (
      is_interno() OR storage_anexo_pertence_ao_parceiro_logado(name)
    )
  );

CREATE POLICY "solicitacoes_anexos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'solicitacoes-anexos' AND is_interno())
  WITH CHECK (bucket_id = 'solicitacoes-anexos' AND is_interno());

CREATE POLICY "solicitacoes_anexos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'solicitacoes-anexos' AND (
      is_interno() OR storage_anexo_pertence_ao_parceiro_logado(name)
    )
  );


-- =====================================================================
-- 10. View portal_solicitacoes (Bloco 1)
-- =====================================================================
-- A view e criada DEPOIS das funcoes auxiliares e dos joins parceiro_*
-- estarem disponiveis.

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
  'Solicitacoes do parceiro logado, apenas com colunas seguras. O portal le '
  'por aqui; o parceiro nao tem policy de SELECT na tabela solicitacoes.';


-- =====================================================================
-- 11. eventos_portal + registrar_evento_portal (0021)
-- =====================================================================
-- Auditoria de eventos de aplicacao (login, login_falha, logout, criacao e
-- cancelamento de solicitacao no portal, troca de senha). Unico caminho de
-- escrita: funcao SECURITY DEFINER abaixo. RLS bloqueia INSERT/UPDATE/DELETE
-- direto; SELECT so para `is_interno()`.

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

ALTER TABLE eventos_portal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_portal_select ON eventos_portal;
CREATE POLICY eventos_portal_select ON eventos_portal
  FOR SELECT TO authenticated
  USING (is_interno());

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
      RETURN NULL;
    END IF;
    SELECT * INTO v_pu FROM parceiro_usuarios
      WHERE user_id = v_user_id AND ativo = true
      LIMIT 1;
    IF NOT FOUND THEN
      RETURN NULL;
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


-- =====================================================================
-- 12. Operacional / vinculos de usuario (one-time setup)
-- =====================================================================
-- Esta secao depende de e-mails reais existirem em auth.users. Os blocos
-- abaixo silenciosamente nao fazem nada se o e-mail nao existir, entao
-- nao quebram a primeira execucao em ambientes novos.

-- ---------- Davi: perfil interno admin ----------
INSERT INTO perfis_usuarios (user_id, nome_completo, perfil, ativo)
SELECT id, 'Davi Silva', 'admin', true
  FROM auth.users
 WHERE lower(email) = 'daviads1206@gmail.com'
ON CONFLICT (user_id) DO UPDATE
  SET perfil = 'admin', ativo = true;

-- ---------- DC5 Transportes: vinculo admin_parceiro ----------
-- (Cria/atualiza apenas se o auth.users + parceiros ja existem.)
DO $$
DECLARE
  v_user_id  uuid;
  v_parceiro uuid;
  v_email    constant text := 'dc5transportes@gmail.com';
  v_razao    constant text := 'DC5 TRANSPORTES';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);
  SELECT id INTO v_parceiro FROM parceiros  WHERE upper(razao_social) = upper(v_razao);
  IF v_user_id IS NULL OR v_parceiro IS NULL THEN
    RETURN;  -- silenciosamente nao faz nada (e-mail ou parceiro ainda nao criados)
  END IF;

  -- Tira o usuario de perfis_usuarios (era interno) — senao is_interno() = true
  -- e a RLS deixaria ele enxergar dados internos.
  DELETE FROM perfis_usuarios WHERE user_id = v_user_id;

  INSERT INTO parceiro_usuarios (user_id, parceiro_id, nome_completo, email, perfil, ativo)
  VALUES (v_user_id, v_parceiro, 'DC5 Transportes', v_email, 'admin_parceiro', true)
  ON CONFLICT (user_id) DO UPDATE
    SET parceiro_id   = excluded.parceiro_id,
        nome_completo = excluded.nome_completo,
        email         = excluded.email,
        perfil        = excluded.perfil,
        ativo         = true;
END $$;
