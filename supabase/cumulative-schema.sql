-- =====================================================================
-- OC Express / SisLog LHG — Schema cumulativo (migrations 0001 → 0047)
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
-- ATENCAO — replay num remoto JA POPULADO: varios CHECK IN(...) sao re-adicionados
-- em blocos de migrations antigas. Se um bloco usar a lista ANTIGA de valores, o
-- ADD CONSTRAINT aborta (SQLSTATE 23514) contra linhas que ja usam valores novos,
-- e como o SQL Editor roda tudo em UMA transacao, da rollback de TUDO — inclusive a
-- migration nova colada no fim (sintoma: "rodou mas nada aplicou"). Por isso os
-- blocos antigos de solicitacoes.origem e eventos_portal.tipo_evento ja usam a
-- lista FINAL (superset). REGRA SEGURA: para aplicar UMA migration nova num remoto
-- vivo, rode SO o bloco isolado dela no SQL Editor do projeto REMOTO
-- (https://supabase.com/dashboard/project/pwufbvneqfyyqnmfxzyw/sql) — nao dependa
-- de replayar este arquivo inteiro.
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
  CHECK (pamcard_status IN ('tem_cartao', 'nao_tem_cartao', 'nao_necessario'));
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_check;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_check
  -- Lista FINAL (inclui 'whatsapp', migration 0032) mesmo neste bloco antigo:
  -- num remoto ja populado, re-adicionar a lista curta abortaria (23514) se
  -- houvesse linhas 'whatsapp'/'email'. Superset mantem o replay seguro.
  CHECK (origem IN ('interno', 'parceiro', 'email', 'whatsapp'));
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_numero_quando_tem;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_numero_quando_tem
  CHECK (
    (pamcard_status = 'tem_cartao'
      AND pamcard_numero IS NOT NULL
      AND pamcard_numero ~ '^[0-9]{10,16}$')
    OR
    (pamcard_status IN ('nao_tem_cartao', 'nao_necessario') AND pamcard_numero IS NULL)
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
--
-- IMPORTANTE: usa DROP + CREATE (e nao CREATE OR REPLACE). A 0034 amplia esta
-- view com parceiro_primeira_carreta_id/parceiro_dolly_id; quando o banco ja
-- esta na 0034 e este script cumulativo roda de novo, um CREATE OR REPLACE com
-- a lista ANTIGA (menos colunas) falha com 42P16 "cannot drop columns from
-- view" e aborta a transacao inteira. O DROP IF EXISTS recria do zero a cada
-- execucao; a 0034 (no fim do arquivo) recria com a lista final.

DROP VIEW IF EXISTS portal_solicitacoes;
CREATE VIEW portal_solicitacoes
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


-- 0022 — Bloco 6.4: rate limit diario por usuario do portal (50 solicitacoes/dia)
--
-- Trigger BEFORE INSERT em `solicitacoes` que conta as solicitacoes ja criadas
-- pelo `parceiro_usuario_id` no dia de calendario (America/Sao_Paulo) e
-- aborta com SQLSTATE custom 'PT429' quando ultrapassa 50. A contagem inclui
-- TODAS as solicitacoes do dia (ativas e canceladas) — criar e cancelar em
-- loop nao zera o contador.
--
-- Internos e e-mails (origem != 'parceiro') passam direto: para esses casos
-- parceiro_usuario_id vem null por constraint (0018).
--
-- A funcao usa SECURITY DEFINER para conseguir contar `solicitacoes` —
-- parceiros nao tem policy de SELECT na tabela, entao sem isso o count
-- voltaria sempre 0 e o limite nunca dispararia.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION check_portal_rate_limit_diario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_limite constant integer := 50;
BEGIN
  IF NEW.origem <> 'parceiro' OR NEW.parceiro_usuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM solicitacoes
  WHERE parceiro_usuario_id = NEW.parceiro_usuario_id
    AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
        = (now()        AT TIME ZONE 'America/Sao_Paulo')::date;

  IF v_count >= v_limite THEN
    RAISE EXCEPTION
      'Limite diario de % solicitacoes por usuario atingido. Tente novamente amanha.',
      v_limite
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_portal_rate_limit_diario() IS
  'Bloco 6.4: bloqueia INSERT em solicitacoes quando o parceiro_usuario_id ja '
  'criou 50 solicitacoes no dia (America/Sao_Paulo). SQLSTATE PT429.';

DROP TRIGGER IF EXISTS trg_solicitacoes_rate_limit_diario ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_rate_limit_diario
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION check_portal_rate_limit_diario();


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
-- Lista FINAL (inclui 'portal_solicitacao_editada' e 'portal_usuario_excluido',
-- migrations 0031/0043) mesmo neste bloco antigo (0023): re-adicionar a lista
-- curta num remoto ja populado aborta (23514) porque ja existem linhas desses
-- tipos, dando rollback de TODA a transacao do SQL Editor. Superset = replay seguro.
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


-- 0024 — Busca global sem acento (unaccent)
--
-- A busca global (apps/interno/.../useGlobalSearch.ts) usava ilike direto nas
-- colunas de texto. No Postgres o ilike é case-insensitive mas SENSÍVEL a
-- acento: buscar "jose" não encontrava "josé", "graos" não achava "grãos".
--
-- Solução: um wrapper IMMUTABLE de unaccent + colunas geradas `*_unaccent`
-- nas tabelas pesquisáveis. O cliente desacentua o termo e filtra por essas
-- colunas, então a comparação fica sem acento dos dois lados.
--
-- Idempotente: extensão IF NOT EXISTS, função CREATE OR REPLACE, colunas via
-- ADD COLUMN IF NOT EXISTS. Reexecutável sem erro.

-- ============================================================
-- 1. Extensão unaccent (schema padrão de extensões no Supabase)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ============================================================
-- 2. Wrapper IMMUTABLE de unaccent
-- ============================================================
-- O unaccent() nativo é STABLE (o dicionário pode mudar), então não pode ser
-- usado em coluna gerada STORED. Fixar o dicionário explicitamente e qualificar
-- tudo pelo schema o torna determinístico o suficiente para ser IMMUTABLE.
CREATE OR REPLACE FUNCTION public.imm_unaccent(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, txt)
$$;

-- ============================================================
-- 3. Colunas geradas *_unaccent nas tabelas pesquisáveis
-- ============================================================
-- Colunas geradas STORED: herdam a RLS da própria tabela (sem policy nova) e
-- são mantidas pelo Postgres a cada INSERT/UPDATE. veiculos/carretas usam só
-- placa (sem acento) e seguem com ilike direto — não precisam de coluna nova.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS razao_social_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(razao_social)) STORED;

ALTER TABLE subcontratadas
  ADD COLUMN IF NOT EXISTS razao_social_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(razao_social)) STORED;

ALTER TABLE motoristas
  ADD COLUMN IF NOT EXISTS nome_completo_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(nome_completo)) STORED;

ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS nome_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(nome)) STORED;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS solicitante_nome_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(solicitante_nome)) STORED;


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


-- 0026 — Bucket ocs-pdf privado (endurecimento pós-testes / TODO.md)
--
-- O PDF da OC contém dado sensível (nome/CPF do motorista, placas, cliente).
-- Até aqui o bucket `ocs-pdf` era PÚBLICO (0001) e o front guardava a URL
-- pública permanente em `solicitacoes.pdf_url` — qualquer pessoa com o link
-- (ou adivinhando o nome do arquivo) abria o PDF sem login, para sempre.
--
-- Esta migration torna o bucket privado e restringe o acesso direto ao time
-- interno. O front passa a:
--   - guardar o PATH do arquivo em pdf_url (não mais a URL pública);
--   - gerar signed URL curto (1h) no "Abrir PDF" interno;
--   - gerar signed URL de 7 dias no momento de enviar pelo WhatsApp.
-- Signed URLs são pré-assinados: funcionam para o destinatário externo (sem
-- login) só durante a validade, e deixam de ser permanentes/adivinháveis.
--
-- Parceiros do portal NÃO acessam PDFs de OC (a view portal_solicitacoes não
-- expõe pdf_url), por isso as policies exigem apenas is_interno().
--
-- Script idempotente: pode ser reexecutado sem erro.

-- 1. Tornar o bucket privado ---------------------------------------------------
-- ATENÇÃO: em alguns projetos o role do editor SQL não é owner de
-- `storage.buckets` e este UPDATE levanta `insufficient_privilege`, o que
-- ABORTARIA a transação inteira (as policies abaixo nunca aplicariam). Por isso
-- envolvemos num bloco que tolera a falta de privilégio. Se cair no NOTICE,
-- ajuste o bucket para privado pelo Dashboard (Storage → ocs-pdf → Make private)
-- ou via Storage API: supabase.storage.updateBucket('ocs-pdf', { public: false }).
DO $$
BEGIN
  UPDATE storage.buckets SET public = false WHERE id = 'ocs-pdf';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem privilégio para alterar storage.buckets via SQL. Torne o bucket ocs-pdf privado pelo Dashboard ou Storage API.';
END $$;

-- 2. Policies do storage: somente time interno --------------------------------
-- (as policies da 0001 eram `bucket_id = 'ocs-pdf'` para qualquer authenticated)
DROP POLICY IF EXISTS "ocs_pdf_select" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_insert" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_update" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_delete" ON storage.objects;

CREATE POLICY "ocs_pdf_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ocs-pdf' AND is_interno());
CREATE POLICY "ocs_pdf_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ocs-pdf' AND is_interno());
CREATE POLICY "ocs_pdf_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ocs-pdf' AND is_interno())
  WITH CHECK (bucket_id = 'ocs-pdf' AND is_interno());
CREATE POLICY "ocs_pdf_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ocs-pdf' AND is_interno());


-- 0027 — Idempotência WhatsApp: solicitacoes.external_msg_id (TODO.md)
--
-- Pré-requisito para o futuro agente de IA do WhatsApp (docs/AGENT_CONTEXT.md):
-- ao reprocessar a mesma mensagem (retry, reenvio, replay do webhook), o agente
-- grava o ID externo da mensagem aqui e o índice único impede a 2ª inserção,
-- evitando solicitações duplicadas. Coluna nullable: solicitações criadas pela
-- equipe interna ou pelo portal seguem com external_msg_id = NULL.
--
-- Índice único PARCIAL (WHERE NOT NULL): unicidade só vale para valores
-- preenchidos; vários NULL convivem normalmente. Não exposto ao portal — a view
-- portal_solicitacoes não inclui esta coluna (metadado interno).
--
-- Script idempotente: pode ser reexecutado sem erro.

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS external_msg_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacoes_external_msg_id
  ON solicitacoes (external_msg_id)
  WHERE external_msg_id IS NOT NULL;

COMMENT ON COLUMN solicitacoes.external_msg_id IS
  'ID da mensagem externa (ex.: WhatsApp) que originou a solicitação. Único '
  'quando preenchido — chave de idempotência para o agente de IA não duplicar '
  'mensagens reprocessadas. NULL para origem interna/portal.';


-- 0028 — Aperta o UPDATE do parceiro em solicitacoes: só cancelamento
--
-- A policy `solicitacoes_parceiro_cancel` (migration 0018) deixava o parceiro
-- dar UPDATE na própria solicitação enquanto `status='recebida'`, mas o
-- WITH CHECK só validava origem + parceiro_id — NÃO restringia o status novo
-- nem as colunas. Na prática, um parceiro com acesso direto à API podia:
--   - editar campos da própria solicitação ainda pendente (placa, cliente…);
--   - forçar o status para qualquer valor (ex.: 'oc_gerada', 'finalizada'),
--     fingindo progresso que a LHG não fez.
-- O portal nunca expôs isso (só oferece "Cancelar"), mas era uma brecha de
-- defense-in-depth.
--
-- Aqui o WITH CHECK passa a exigir `status = 'cancelada'`: combinado com o
-- USING (`status = 'recebida'`), a ÚNICA transição que o parceiro consegue é
-- recebida → cancelada. Qualquer outro UPDATE (editar campo mantendo recebida,
-- ou forçar outro status) é rejeitado (42501). O cancelamento do portal
-- (`update({ status: 'cancelada' })`) continua funcionando. O time interno usa
-- a policy `solicitacoes_interno_update` (is_interno()), intacta.
--
-- Script idempotente: pode ser reexecutado sem erro.

DROP POLICY IF EXISTS solicitacoes_parceiro_cancel ON solicitacoes;

CREATE POLICY solicitacoes_parceiro_cancel ON solicitacoes FOR UPDATE TO authenticated
  USING (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'recebida'
  )
  WITH CHECK (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'cancelada'
  );


-- 0029 — Marca quando o convite do parceiro_usuario foi aceito
--
-- Hoje o admin do parceiro convida um operador e não tem visibilidade de se
-- a pessoa já clicou no link e definiu a senha — `parceiro_usuarios.ativo` é
-- só "o admin desligou ou não", e `auth.users.last_sign_in_at` fica fora da
-- visão do parceiro (sem SELECT nas tabelas do schema auth).
--
-- Solução: coluna `convite_aceito_em timestamptz` nullable em
-- `parceiro_usuarios`, populada pelo próprio convidado via RPC quando ele
-- termina o fluxo de /aceitar-convite (depois do updateUser({password})
-- retornar OK). A UI então mostra "Aguardando" enquanto NULL e "Ativo" depois.
--
-- Backfill: para usuários que JÁ logaram pelo menos uma vez antes desta
-- migration, copia `auth.users.last_sign_in_at` (o melhor proxy disponível).
-- Para o cofundador/admin original do parceiro que foi seedado manualmente
-- sem passar pelo convite, isso garante que ele apareça como "Ativo" e não
-- "Aguardando" perpetuamente.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, UPDATE só onde NULL, CREATE OR REPLACE.

-- ============================================================
-- 1. Coluna nova
-- ============================================================

ALTER TABLE parceiro_usuarios
  ADD COLUMN IF NOT EXISTS convite_aceito_em timestamptz;

COMMENT ON COLUMN parceiro_usuarios.convite_aceito_em IS
  'Quando o convidado abriu o link e definiu a senha pela primeira vez. NULL = ainda pendente.';

-- ============================================================
-- 2. Backfill — para quem já logou alguma vez
-- ============================================================
-- Só roda em linhas onde a coluna ainda está NULL (idempotente).
-- Lê `auth.users.last_sign_in_at` — não precisa estar exatamente no momento
-- do aceite; é o melhor proxy para usuários pré-existentes.

UPDATE parceiro_usuarios pu
SET convite_aceito_em = au.last_sign_in_at
FROM auth.users au
WHERE pu.user_id = au.id
  AND pu.convite_aceito_em IS NULL
  AND au.last_sign_in_at IS NOT NULL;

-- ============================================================
-- 3. RPC marcar_meu_convite_aceito
-- ============================================================
-- SECURITY DEFINER porque o caller (parceiro_usuario recém-logado) tem
-- policy de UPDATE em parceiro_usuarios só para o próprio parceiro_id +
-- não-escalonamento de perfil — não dá pra autoaprovar via UPDATE direto
-- sem expandir a policy. Aqui o SECURITY DEFINER faz exatamente uma coisa
-- segura: marca a própria linha (filtra por auth.uid()) e só se ainda NULL.
--
-- Não recebe parâmetros: o caller é sempre "eu mesmo". Idempotente: chamar
-- duas vezes não muda nada (WHERE convite_aceito_em IS NULL).

CREATE OR REPLACE FUNCTION marcar_meu_convite_aceito()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE parceiro_usuarios
  SET convite_aceito_em = v_now
  WHERE user_id = v_uid
    AND convite_aceito_em IS NULL;

  -- Retorna o valor atual (após o UPDATE) — útil pro cliente confirmar.
  -- Se o UPDATE não pegou nada (já marcado, ou usuário não é parceiro),
  -- devolve o que já estava lá (ou NULL).
  RETURN (
    SELECT convite_aceito_em FROM parceiro_usuarios WHERE user_id = v_uid LIMIT 1
  );
END;
$$;

-- Permitir invocar via PostgREST.
GRANT EXECUTE ON FUNCTION marcar_meu_convite_aceito() TO authenticated;


-- 0030 — Filtra clientes_publicos para mostrar só clientes de minério
--
-- Regra de negócio: o parceiro externo só carrega minério. Clientes de retorno
-- (cliente_retorno=true / cliente_minerio=false) só são atendidos por motoristas
-- da própria LHG. Antes desta migration, a view clientes_publicos (0017)
-- filtrava apenas por `ativo = true`, então o select de "Cliente" no formulário
-- de Nova Solicitação do portal listava também os clientes-retorno —
-- desnecessário e confuso pro operador da transportadora.
--
-- Fix: adiciona `cliente_minerio = true` ao WHERE. Não importa se o cliente
-- também aceita retorno (cliente_retorno=true): se ele aceita minério, o
-- parceiro pode solicitar carregamento.
--
-- Colunas e GRANTs mantidos — só muda o filtro. CREATE OR REPLACE VIEW
-- funciona porque a lista de colunas é a mesma da 0017.

CREATE OR REPLACE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf
FROM clientes
WHERE ativo = true
  AND cliente_minerio = true;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos de minerio com colunas seguras para o Portal de Parceiros. '
  'Clientes de retorno (cliente_minerio=false) sao filtrados — so a LHG carrega retorno.';


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
  -- Lista FINAL (superset) tambem neste bloco intermediario: replay seguro.
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


-- 0032 — Adiciona 'whatsapp' aos valores aceitos por solicitacoes.origem
--
-- A coluna `origem` foi criada na 0016 com CHECK IN ('interno','parceiro','email').
-- Com a entrada do agente de IA do WhatsApp (docs/AGENT_CONTEXT.md), precisamos
-- de uma 4ª categoria para distinguir o canal no filtro "Origem" da listagem e
-- na auditoria. Reaproveitar 'email' deixaria o filtro mentiroso (mensagens de
-- WhatsApp apareceriam ao filtrar e-mail).
--
-- O CHECK original foi criado inline na 0016, com nome auto-gerado pelo
-- Postgres (`solicitacoes_origem_check`). O DO block abaixo localiza e dropa
-- qualquer CHECK em `solicitacoes` cuja definição mencione `origem IN`,
-- independente do nome — isso mantém a migration reexecutável em ambientes
-- onde o nome possa variar. Depois recria com nome canônico e os 4 valores.
--
-- Script idempotente: pode ser reexecutado sem erro.

DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'solicitacoes'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%origem%IN%'
  LOOP
    EXECUTE format('ALTER TABLE solicitacoes DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_check
  CHECK (origem IN ('interno', 'parceiro', 'email', 'whatsapp'));

COMMENT ON COLUMN solicitacoes.origem IS
  'Canal pelo qual a solicitação entrou no sistema: ''interno'' (equipe LHG '
  'cadastrando manualmente), ''parceiro'' (portal externo da Fase 8), ''email'' '
  '(triagem manual de e-mail) ou ''whatsapp'' (agente de IA via Meta Cloud API).';


-- 0033 — Bloqueio temporario de novas solicitacoes por parceiro
--
-- Adiciona um switch por parceiro que impede a criacao de novas solicitacoes
-- pelo portal, mantendo o login, a listagem e o download de arquivos das
-- solicitacoes ja existentes. Diferente de `parceiros.ativo=false`, que tranca
-- o portal inteiro (e tambem ja desativa os usuarios via UI), este flag e' uma
-- pausa "estou encerrando os testes" controlada pela equipe interna.
--
-- Mudancas:
--   1. Colunas `solicitacoes_bloqueadas` (bool, default false) e
--      `solicitacoes_bloqueadas_em` (timestamptz) em `parceiros`.
--   2. Trigger BEFORE INSERT em `solicitacoes` que aborta com SQLSTATE custom
--      `PT423` (Locked) quando a origem e' do parceiro e o flag esta ligado.
--      Internos/e-mail (`origem != 'parceiro'`) passam direto. Igual a
--      check_portal_rate_limit_diario, a funcao e' SECURITY DEFINER porque o
--      parceiro nao tem policy de SELECT em `solicitacoes`.
--
-- Idempotente.

-- ============================================================
-- 1. Colunas em parceiros
-- ============================================================

ALTER TABLE parceiros
  ADD COLUMN IF NOT EXISTS solicitacoes_bloqueadas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solicitacoes_bloqueadas_em timestamptz;

COMMENT ON COLUMN parceiros.solicitacoes_bloqueadas IS
  'Quando true, o parceiro nao consegue criar novas solicitacoes pelo portal '
  '(trigger check_parceiro_solicitacoes_bloqueadas, SQLSTATE PT423). A '
  'leitura/download de arquivos das solicitacoes existentes continua liberada.';

COMMENT ON COLUMN parceiros.solicitacoes_bloqueadas_em IS
  'Momento em que o bloqueio foi ativado (null quando solicitacoes_bloqueadas=false).';

-- ============================================================
-- 2. Trigger BEFORE INSERT em solicitacoes
-- ============================================================

CREATE OR REPLACE FUNCTION check_parceiro_solicitacoes_bloqueadas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bloqueado boolean;
BEGIN
  IF NEW.origem <> 'parceiro' OR NEW.parceiro_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT solicitacoes_bloqueadas INTO v_bloqueado
  FROM parceiros
  WHERE id = NEW.parceiro_id;

  IF v_bloqueado IS TRUE THEN
    RAISE EXCEPTION
      'Novas solicitacoes estao temporariamente indisponiveis para este parceiro.'
      USING ERRCODE = 'PT423';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_parceiro_solicitacoes_bloqueadas() IS
  'Bloqueia INSERT em solicitacoes quando parceiros.solicitacoes_bloqueadas=true. '
  'SQLSTATE PT423.';

DROP TRIGGER IF EXISTS trg_solicitacoes_parceiro_bloqueado ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_parceiro_bloqueado
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION check_parceiro_solicitacoes_bloqueadas();


-- 0034 — Placas da composicao em ordem (ANTT): 1a carreta + dolly
--
-- A nova regulamentacao fiscal da ANTT exige que TODAS as placas da composicao
-- veicular apareçam na Ordem de Carregamento, na ordem fisica do conjunto:
--   Cavalo -> 1a Carreta -> Dolly -> Ultima Carreta
-- Hoje a solicitacao so registra Cavalo (veiculo_id) e Ultima Carreta
-- (carreta_id). Esta migration adiciona dois vinculos OPCIONAIS de carreta,
-- reaproveitando o cadastro existente de `carretas` (o dolly e' cadastrado como
-- uma carreta). Quando vazios, saem em branco na OC.
--
-- Espelha os campos no fluxo do portal (parceiro_carretas), atualiza a
-- constraint de integridade de origem e recria a view portal_solicitacoes.
--
-- Idempotente.

-- ============================================================
-- 1. Vinculos internos (cadastro de carretas)
-- ============================================================

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS primeira_carreta_id uuid REFERENCES carretas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dolly_id uuid REFERENCES carretas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_primeira_carreta ON solicitacoes(primeira_carreta_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_dolly ON solicitacoes(dolly_id);

-- ============================================================
-- 2. Vinculos do portal (cadastro do parceiro)
-- ============================================================

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS parceiro_primeira_carreta_id uuid REFERENCES parceiro_carretas(id),
  ADD COLUMN IF NOT EXISTS parceiro_dolly_id uuid REFERENCES parceiro_carretas(id);

COMMENT ON COLUMN solicitacoes.primeira_carreta_id IS
  'Placa da 1a carreta da composicao (ANTT). Opcional; FK carretas.';
COMMENT ON COLUMN solicitacoes.dolly_id IS
  'Placa do dolly da composicao (ANTT). Opcional; FK carretas (dolly cadastrado como carreta).';
COMMENT ON COLUMN solicitacoes.parceiro_primeira_carreta_id IS
  'Espelho de primeira_carreta_id no fluxo do portal (FK parceiro_carretas).';
COMMENT ON COLUMN solicitacoes.parceiro_dolly_id IS
  'Espelho de dolly_id no fluxo do portal (FK parceiro_carretas).';

-- ============================================================
-- 3. Constraint de integridade de origem (cobre os novos campos)
-- ============================================================
-- Mantem a regra da 0018: solicitacao de parceiro usa apenas referencias
-- parceiro_*; interna/e-mail nao usa nenhuma referencia parceiro_*. NOT VALID:
-- nao varre linhas legadas (todas tem os novos campos NULL).

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
      AND primeira_carreta_id IS NULL
      AND dolly_id IS NULL
      AND subcontratada_id IS NULL)
    OR
    (origem <> 'parceiro'
      AND parceiro_id IS NULL
      AND parceiro_usuario_id IS NULL
      AND parceiro_motorista_id IS NULL
      AND parceiro_veiculo_id IS NULL
      AND parceiro_carreta_id IS NULL
      AND parceiro_primeira_carreta_id IS NULL
      AND parceiro_dolly_id IS NULL
      AND parceiro_subcontratada_id IS NULL)
  ) NOT VALID;

-- ============================================================
-- 4. View portal_solicitacoes — expoe os novos IDs do parceiro
-- ============================================================
-- DROP + CREATE (em vez de CREATE OR REPLACE) porque o Postgres nao permite
-- inserir colunas no meio da lista via REPLACE. O portal resolve as colunas por
-- nome, entao a ordem nao importa para a aplicacao.

DROP VIEW IF EXISTS portal_solicitacoes;
CREATE VIEW portal_solicitacoes
WITH (security_invoker = false) AS
SELECT id, numero_interno, tipo, status, origem,
       parceiro_id, parceiro_usuario_id, parceiro_motorista_id,
       parceiro_veiculo_id, parceiro_carreta_id,
       parceiro_primeira_carreta_id, parceiro_dolly_id,
       parceiro_subcontratada_id,
       cliente_id, pamcard_status, pamcard_numero,
       observacoes, created_at, enviada_em, finalizada_em
FROM solicitacoes
WHERE origem = 'parceiro' AND parceiro_id = get_current_parceiro_id();

GRANT SELECT ON portal_solicitacoes TO authenticated;

COMMENT ON VIEW portal_solicitacoes IS
  'Solicitações do parceiro logado, apenas com colunas seguras. O portal lê '
  'por aqui; o parceiro não tem policy de SELECT na tabela solicitacoes.';


-- 0035 — Loop de pendência: devolver solicitação ao parceiro e receber a volta
--
-- Hoje a comunicação parceiro <-> equipe interna é de mão única: quando o
-- veículo tem uma pendência que trava a finalização, a equipe não tem como
-- "devolver" a solicitação ao parceiro, e quando o parceiro resolve nada
-- aparece no SisLog. Esta migration cria a tabela `solicitacao_pendencias`
-- como overlay sobre a solicitação (NÃO mexe no enum `solicitacoes.status`,
-- preservando a máquina de estados, SLA e timeline).
--
-- Fluxo:
--   1. Interno cria uma pendência (motivo) -> status 'aberta'.
--   2. Parceiro vê no portal (sino + banner), resolve (resposta) -> 'resolvida'.
--   3. Interno é notificado no sino e continua a finalização.
--
-- Segurança: o parceiro NÃO tem SELECT em `solicitacoes` (Bloco 1). Para o RLS
-- do parceiro funcionar sem recursão, denormalizamos `parceiro_id` na própria
-- pendência (mesmo padrão de parceiro_motoristas etc.). Um trigger BEFORE INSERT
-- preenche `parceiro_id`/`criada_por` a partir da solicitação — o cliente não
-- precisa (nem consegue forjar) esses campos.
--
-- Script idempotente: pode ser reexecutado sem erro.

-- ============================================================
-- 1. Tabela
-- ============================================================

CREATE TABLE IF NOT EXISTS solicitacao_pendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  -- Denormalizado a partir da solicitação (trigger). É a chave do RLS do parceiro.
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'resolvida')),
  resposta_parceiro text,
  criada_por uuid REFERENCES auth.users(id),
  resolvida_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolvida_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pendencias_solicitacao ON solicitacao_pendencias(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_parceiro ON solicitacao_pendencias(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_status ON solicitacao_pendencias(status);
-- No máximo UMA pendência aberta por solicitação.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pendencia_aberta_por_solicitacao
  ON solicitacao_pendencias(solicitacao_id) WHERE status = 'aberta';

-- ============================================================
-- 2. Triggers de preenchimento + updated_at + auditoria
-- ============================================================
-- BEFORE INSERT: deriva parceiro_id da solicitação (ignora o que o cliente
-- mandar) e marca criada_por = auth.uid(). Se a solicitação não for de parceiro
-- (parceiro_id NULL), o NOT NULL aborta — pendência só existe para origem
-- 'parceiro', que é o único caso onde o loop faz sentido.
CREATE OR REPLACE FUNCTION pendencia_preencher_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT parceiro_id INTO NEW.parceiro_id FROM solicitacoes WHERE id = NEW.solicitacao_id;
  NEW.criada_por := COALESCE(NEW.criada_por, auth.uid());
  NEW.status := 'aberta';
  NEW.resolvida_em := NULL;
  NEW.resolvida_por := NULL;
  RETURN NEW;
END;
$$;

-- BEFORE UPDATE: quando alguém move 'aberta' -> 'resolvida', carimba
-- resolvida_em/por no servidor (não confia no cliente).
CREATE OR REPLACE FUNCTION pendencia_carimbar_resolucao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'resolvida' AND OLD.status <> 'resolvida' THEN
    NEW.resolvida_em := now();
    NEW.resolvida_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pendencia_preencher ON solicitacao_pendencias;
CREATE TRIGGER trg_pendencia_preencher BEFORE INSERT ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION pendencia_preencher_insert();

DROP TRIGGER IF EXISTS trg_pendencia_resolucao ON solicitacao_pendencias;
CREATE TRIGGER trg_pendencia_resolucao BEFORE UPDATE ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION pendencia_carimbar_resolucao();

DROP TRIGGER IF EXISTS trg_pendencias_updated ON solicitacao_pendencias;
CREATE TRIGGER trg_pendencias_updated BEFORE UPDATE ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS aud_solicitacao_pendencias ON solicitacao_pendencias;
CREATE TRIGGER aud_solicitacao_pendencias
  AFTER INSERT OR UPDATE OR DELETE ON solicitacao_pendencias
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================
-- 3. RLS
-- ============================================================
-- Interno: tudo. Parceiro: lê as suas (parceiro_id) e só consegue a transição
-- 'aberta' -> 'resolvida' (resposta). Sem INSERT/DELETE pelo parceiro.

ALTER TABLE solicitacao_pendencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pendencias_interno_all ON solicitacao_pendencias;
DROP POLICY IF EXISTS pendencias_parceiro_select ON solicitacao_pendencias;
DROP POLICY IF EXISTS pendencias_parceiro_resolve ON solicitacao_pendencias;

CREATE POLICY pendencias_interno_all ON solicitacao_pendencias FOR ALL TO authenticated
  USING (is_interno()) WITH CHECK (is_interno());

CREATE POLICY pendencias_parceiro_select ON solicitacao_pendencias FOR SELECT TO authenticated
  USING (parceiro_id = get_current_parceiro_id());

-- Só aberta -> resolvida. O WITH CHECK trava o status final em 'resolvida';
-- combinado com o USING (status='aberta'), a única transição possível é
-- resolver. Editar o motivo continua tecnicamente possível para o parceiro,
-- mas é inócuo (a equipe é a fonte da verdade e vê tudo); o portal só envia
-- status + resposta_parceiro.
CREATE POLICY pendencias_parceiro_resolve ON solicitacao_pendencias FOR UPDATE TO authenticated
  USING (parceiro_id = get_current_parceiro_id() AND status = 'aberta')
  WITH CHECK (parceiro_id = get_current_parceiro_id() AND status = 'resolvida');

-- ============================================================
-- 4. Realtime
-- ============================================================
-- Para que devolução/resolução apareçam ao vivo nos dois apps (igual 0013).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'solicitacao_pendencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE solicitacao_pendencias;
  END IF;
END $$;

COMMENT ON TABLE solicitacao_pendencias IS
  'Overlay de pendências sobre a solicitação: a equipe devolve ao parceiro com '
  'um motivo (aberta) e o parceiro resolve (resolvida). Não altera '
  'solicitacoes.status. parceiro_id é denormalizado para o RLS do parceiro.';


-- 0036 — Pendência: marcar quando a equipe já viu a resposta do parceiro
--
-- Torna o aviso de "parceiro respondeu" um sinal COMPARTILHADO (pop no card da
-- solicitação) em vez de só o sino, que cada usuário apaga individualmente. O
-- pop some para todos quando alguem da equipe marca como visto. So interno
-- escreve (policy pendencias_interno_all, 0035). Idempotente.

ALTER TABLE solicitacao_pendencias
  ADD COLUMN IF NOT EXISTS vista_equipe_em timestamptz;

COMMENT ON COLUMN solicitacao_pendencias.vista_equipe_em IS
  'Quando alguem da equipe interna marcou a resposta do parceiro como vista. '
  'NULL = resolvida mas ainda nao tratada (mostra pop no card). So interno escreve.';


-- ============================================================
-- 0037 — Pamcard: opção "Não Necessário" (pagamento por outro meio)
-- ============================================================
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_status_check;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_status_check
  CHECK (pamcard_status IN ('tem_cartao', 'nao_tem_cartao', 'nao_necessario'));

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_numero_quando_tem;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_numero_quando_tem
  CHECK (
    (pamcard_status = 'tem_cartao'
      AND pamcard_numero IS NOT NULL
      AND pamcard_numero ~ '^[0-9]{10,16}$')
    OR
    (pamcard_status IN ('nao_tem_cartao', 'nao_necessario') AND pamcard_numero IS NULL)
  );


-- ============================================================
-- 0038 — Parceiro: documento unificado (aceita CPF ou CNPJ)
-- ============================================================
-- Renomeia parceiros.cnpj -> documento e adiciona tipo_pessoa (PF/PJ),
-- espelhando o que a 0019 fez em parceiro_subcontratadas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'parceiros' and column_name = 'cnpj'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'parceiros' and column_name = 'documento'
  ) then
    alter table public.parceiros rename column cnpj to documento;
  end if;
end$$;

alter table public.parceiros add column if not exists tipo_pessoa text;
alter table public.parceiros drop constraint if exists parceiros_tipo_pessoa_check;
alter table public.parceiros
  add constraint parceiros_tipo_pessoa_check
  check (tipo_pessoa is null or tipo_pessoa in ('PF','PJ'));

update public.parceiros
   set tipo_pessoa = case length(regexp_replace(coalesce(documento,''), '\D', '', 'g'))
                       when 11 then 'PF'
                       when 14 then 'PJ'
                       else tipo_pessoa
                     end
 where tipo_pessoa is null and documento is not null;


-- ============================================================
-- 0039 — Portal: cadastro de cartões Pamcard (parceiro_pamcards)
-- ============================================================
CREATE TABLE IF NOT EXISTS parceiro_pamcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  numero text NOT NULL,
  apelido text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (parceiro_id, numero)
);

ALTER TABLE parceiro_pamcards DROP CONSTRAINT IF EXISTS parceiro_pamcards_numero_formato;
ALTER TABLE parceiro_pamcards
  ADD CONSTRAINT parceiro_pamcards_numero_formato CHECK (numero ~ '^[0-9]{10,16}$');

CREATE INDEX IF NOT EXISTS idx_parceiro_pamcards_parceiro ON parceiro_pamcards(parceiro_id);

DROP TRIGGER IF EXISTS trg_parceiro_pamcards_updated ON parceiro_pamcards;
CREATE TRIGGER trg_parceiro_pamcards_updated
  BEFORE UPDATE ON parceiro_pamcards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS aud_parceiro_pamcards ON parceiro_pamcards;
CREATE TRIGGER aud_parceiro_pamcards
  AFTER INSERT OR UPDATE OR DELETE ON parceiro_pamcards FOR EACH ROW EXECUTE FUNCTION audit_trigger();

ALTER TABLE parceiro_pamcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_select ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_insert ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_update ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_parceiro_delete ON parceiro_pamcards;
DROP POLICY IF EXISTS parceiro_pamcards_interno_select ON parceiro_pamcards;
CREATE POLICY parceiro_pamcards_parceiro_select ON parceiro_pamcards FOR SELECT TO authenticated
  USING (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_parceiro_insert ON parceiro_pamcards FOR INSERT TO authenticated
  WITH CHECK (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_parceiro_update ON parceiro_pamcards FOR UPDATE TO authenticated
  USING (parceiro_id = get_current_parceiro_id()) WITH CHECK (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_parceiro_delete ON parceiro_pamcards FOR DELETE TO authenticated
  USING (parceiro_id = get_current_parceiro_id());
CREATE POLICY parceiro_pamcards_interno_select ON parceiro_pamcards FOR SELECT TO authenticated
  USING (is_interno());


-- ============================================================
-- 0040 — Portal: policy de DELETE nos cadastros do parceiro
-- ============================================================
-- A 0018 (secao 8) criou so SELECT/INSERT/UPDATE; sem DELETE o botao Excluir
-- do portal era no-op. Registros em uso seguem protegidos pelas FKs de
-- solicitacoes (RESTRICT => 23503).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'parceiro_motoristas','parceiro_veiculos','parceiro_carretas','parceiro_subcontratadas'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_parceiro_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (parceiro_id = get_current_parceiro_id())', t || '_parceiro_delete', t);
  END LOOP;
END $$;


-- ============================================================
-- 0041 — Indices de performance (FKs sem indice + compostos)
-- ============================================================
-- O Postgres nao cria indice automatico em coluna de FK; estas fecham as
-- lacunas das telas quentes (joins, filtros, ordenacao) e protegem o DELETE
-- nos pais parceiro_*. Idempotente (IF NOT EXISTS / IF EXISTS).
CREATE INDEX IF NOT EXISTS idx_solicitacoes_cliente   ON solicitacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_material  ON solicitacoes(material_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_motorista ON solicitacoes(motorista_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_veiculo   ON solicitacoes(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_carreta   ON solicitacoes(carreta_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_motorista        ON solicitacoes(parceiro_motorista_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_veiculo          ON solicitacoes(parceiro_veiculo_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_carreta          ON solicitacoes(parceiro_carreta_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_primeira_carreta ON solicitacoes(parceiro_primeira_carreta_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_dolly            ON solicitacoes(parceiro_dolly_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_subcontratada    ON solicitacoes(parceiro_subcontratada_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_parceiro_usuario          ON solicitacoes(parceiro_usuario_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status_created ON solicitacoes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_tabela_created ON log_auditoria(tabela, created_at DESC);
DROP INDEX IF EXISTS idx_log_auditoria_tabela;


-- ============================================================
-- 0042 — Seguranca: fixa search_path da audit_trigger (DEFINER)
-- ============================================================
-- audit_trigger() e SECURITY DEFINER e roda em ~20 tabelas. Sem search_path
-- fixo era vetor de hijacking (function_search_path_mutable no linter do
-- Supabase). A definicao acima ja inclui o SET; este ALTER garante a correcao
-- mesmo em bancos onde a funcao foi criada antes desta secao. Idempotente.
ALTER FUNCTION audit_trigger() SET search_path = public, pg_temp;


-- ============================================================
-- 0043 — Portal: parceiro pode EDITAR a solicitacao enquanto 'recebida'
-- ============================================================
-- A 0028 havia apertado o UPDATE do parceiro para so 'recebida -> cancelada'.
-- Aqui o WITH CHECK aceita status IN ('recebida','cancelada'): libera a edicao
-- (recebida -> recebida) mantendo o cancelamento e bloqueando forcar progresso
-- (oc_gerada/finalizada). USING segue exigindo 'recebida', entao so da pra
-- editar antes de a LHG processar — a fila e preservada. Idempotente.
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

-- tipo_evento `portal_solicitacao_editada` (auditoria)
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


-- ============================================================
-- 0044 — Portal: editar/cancelar solicitacao via RPC SECURITY DEFINER
-- ============================================================
-- O parceiro NAO tem policy de SELECT em solicitacoes (le so a view
-- portal_solicitacoes). No Postgres, UPDATE ... WHERE id=... so acha a linha se
-- ela for visivel via SELECT; sem isso, edicao e cancelamento do parceiro
-- afetavam 0 linhas SEM erro. Rotamos a escrita por funcoes SECURITY DEFINER
-- (rodam como dono, bypass de RLS) que validam posse + status no corpo, sem
-- expor colunas internas. Idempotente.
CREATE OR REPLACE FUNCTION portal_editar_solicitacao(
  p_id uuid, p_motorista uuid, p_veiculo uuid, p_carreta uuid,
  p_primeira_carreta uuid, p_dolly uuid, p_subcontratada uuid, p_cliente uuid,
  p_pamcard_status text, p_pamcard_numero text, p_observacoes text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;
  UPDATE solicitacoes SET
    parceiro_motorista_id        = p_motorista,
    parceiro_veiculo_id          = p_veiculo,
    parceiro_carreta_id          = p_carreta,
    parceiro_primeira_carreta_id = p_primeira_carreta,
    parceiro_dolly_id            = p_dolly,
    parceiro_subcontratada_id    = p_subcontratada,
    cliente_id                   = p_cliente,
    pamcard_status               = p_pamcard_status,
    pamcard_numero               = p_pamcard_numero,
    observacoes                  = p_observacoes
  WHERE id = p_id AND origem = 'parceiro'
    AND parceiro_id = v_parceiro AND status = 'recebida';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada ou nao editavel (ja em processamento).'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION portal_cancelar_solicitacao(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;
  UPDATE solicitacoes SET status = 'cancelada'
  WHERE id = p_id AND origem = 'parceiro'
    AND parceiro_id = v_parceiro AND status = 'recebida';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada ou nao cancelavel (ja em processamento).'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) FROM public;
REVOKE ALL ON FUNCTION portal_cancelar_solicitacao(uuid) FROM public;
GRANT EXECUTE ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cancelar_solicitacao(uuid) TO authenticated;


-- ============================================================
-- 0045 — Kill switch / modo manutencao compartilhado (interno + portal)
-- ============================================================
-- Tabela de linha unica lida pelos dois apps no boot para congelar o acesso
-- durante um deploy. SELECT liberado para anon+authenticated (precisa ser lido
-- pre-login); NENHUMA policy de escrita -> so service_role / SQL Editor liga a
-- flag. Toggle: UPDATE public.system_status SET maintenance = true|false WHERE id = 1;

CREATE TABLE IF NOT EXISTS public.system_status (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance boolean NOT NULL DEFAULT false,
  message     text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_status (id, maintenance, message)
VALUES (1, false, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_status_select_todos ON public.system_status;
CREATE POLICY system_status_select_todos
  ON public.system_status
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.system_status TO anon, authenticated;


-- ============================================================
-- 0046 — Pendencia interna: pendencia em solicitacao SEM parceiro
-- ============================================================
-- Torna solicitacao_pendencias.parceiro_id anulavel para permitir pendencia em
-- solicitacao de origem interna (a propria equipe abre e resolve; sem loop com o
-- portal). O trigger ja deriva NULL da solicitacao interna. RLS do parceiro
-- segue segura: parceiro_id = get_current_parceiro_id() nunca casa com NULL.
-- Idempotente: DROP NOT NULL e no-op se a coluna ja for anulavel.

ALTER TABLE solicitacao_pendencias
  ALTER COLUMN parceiro_id DROP NOT NULL;

COMMENT ON COLUMN solicitacao_pendencias.parceiro_id IS
  'Denormalizado da solicitacao (trigger). NULL quando a solicitacao e de origem '
  'interna (pendencia que a propria equipe abre e resolve). Chave do RLS do '
  'parceiro — NULL nunca casa, entao o parceiro nao ve pendencias internas.';

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 0047 — Endurece o INSERT do parceiro em solicitacoes
-- ============================================================
-- A policy solicitacoes_parceiro_insert (0018, re-criada na secao 9 acima) so
-- fixava origem e parceiro_id. Como INSERT nao depende de policy de SELECT, ele
-- e o unico caminho de escrita direta que funciona de verdade para o parceiro —
-- e aceitava qualquer valor nas colunas do dominio interno (status, atendente,
-- PDF, flags de CTe/MDFe). Achado da varredura de 2026-07-21; confirmado por
-- scripts/pentest-rls.mjs (retorno com status 'finalizada' gravava).
--
-- Este bloco vem DEPOIS da secao 9 de proposito: ele substitui as duas policies
-- do parceiro pela versao endurecida, entao o estado final vale mesmo com o
-- arquivo inteiro replayado.
--
-- ATENCAO ao editar a lista de NEW.<coluna> do trigger: PL/pgSQL NAO valida
-- essas referencias na criacao da funcao. Uma coluna inexistente cria a funcao
-- sem erro e derruba TODO insert de parceiro em runtime com 42703 (aconteceu com
-- NEW.pamcard, que virou pamcard_status/pamcard_numero). Confira contra o schema
-- real antes de aplicar.

DROP POLICY IF EXISTS solicitacoes_parceiro_insert ON solicitacoes;
CREATE POLICY solicitacoes_parceiro_insert ON solicitacoes FOR INSERT TO authenticated
  WITH CHECK (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'recebida'
  );

-- UPDATE: nada a endurecer aqui. A 0043 (bloco acima) ja substituiu
-- solicitacoes_parceiro_cancel por solicitacoes_parceiro_edit_cancel, cujo
-- WITH CHECK ja limita o estado final a ('recebida','cancelada'). O DROP abaixo
-- so remove o nome legado, caso ele exista no remoto.
DROP POLICY IF EXISTS solicitacoes_parceiro_cancel ON solicitacoes;

CREATE OR REPLACE FUNCTION solicitacao_sanitizar_insert_externo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_interno() THEN
    RETURN NEW;
  END IF;

  NEW.status                    := 'recebida';
  NEW.atendente_id              := NULL;
  NEW.documentado_por           := NULL;
  NEW.documentado_em            := NULL;
  NEW.pdf_url                   := NULL;
  NEW.enviada_em                := NULL;
  NEW.finalizada_em             := NULL;
  NEW.numero_instrucao          := NULL;
  NEW.cte_emitido               := false;
  NEW.mdfe_emitido              := false;
  NEW.vale_pedagio              := false;
  NEW.created_by                := auth.uid();
  NEW.pamcard_providenciado_em  := NULL;
  NEW.pamcard_providenciado_por := NULL;
  NEW.observacoes_internas      := NULL;
  NEW.external_msg_id           := NULL;

  IF NEW.parceiro_usuario_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM parceiro_usuarios
      WHERE id = NEW.parceiro_usuario_id
        AND parceiro_id = NEW.parceiro_id
    ) THEN
      RAISE EXCEPTION 'Usuario informado nao pertence a este parceiro.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION solicitacao_sanitizar_insert_externo() IS
  'Zera as colunas de dominio interno (status, atendente, pdf, flags, datas) em '
  'INSERTs feitos por quem nao e interno, e valida a posse de parceiro_usuario_id. '
  'A policy de INSERT do parceiro so fixava origem/parceiro_id (migration 0047).';

DROP TRIGGER IF EXISTS trg_solicitacoes_sanitizar_externo ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_sanitizar_externo
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION solicitacao_sanitizar_insert_externo();

NOTIFY pgrst, 'reload schema';


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
