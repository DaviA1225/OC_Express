-- =====================================================================
-- OC Express / SisLog LHG — Schema cumulativo (migrations 0001 → 0068)
-- =====================================================================
--
-- Este arquivo agrega TODAS as migrations num único script IDEMPOTENTE.
-- Pode ser executado quantas vezes precisar no SQL Editor do Supabase
-- sem erro: cada CREATE usa IF NOT EXISTS, cada CREATE POLICY/TRIGGER e
-- precedido de DROP IF EXISTS, e renomes/migracoes ficam em DO blocks
-- com checagem em information_schema.
--
-- Quando criar uma migration nova em supabase/migrations/, refletir aqui.
-- ONDE colar depende do que a migration faz:
--
--   • Cria ou troca POLICY  -> ANTES da secao da 0051 (RLS/InitPlan). Ela e
--     uma varredura sobre o estado vivo: policy colada depois dela fica de
--     fora e volta a avaliar os helpers por linha. Foi o caso da 0059/0060.
--   • So DDL, sem policy    -> no fim, antes da secao "Operacional /
--     vinculos de usuario". Foi o caso da 0055.
--
-- As duas regras ja se contradisseram uma vez: o texto antigo mandava sempre
-- colar no fim, o que teria posto as policies da 0059/0060 depois da varredura.
-- Na duvida, ANTES da 0051 e sempre seguro — nada la embaixo depende de ordem.
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
-- Pelo mesmo motivo, o CHECK `solicitacoes_origem_integridade` aparece nos blocos
-- da 0018 e da 0034 ja na forma FINAL da 0054 (sem exigir `parceiro_usuario_id`):
-- a forma antiga proibia o ON DELETE SET NULL que a propria 0031 dispara, e um
-- replay a reinstalaria, quebrando de novo a exclusao de usuario do parceiro.
--
-- ATENCAO — a secao da 0051 (RLS/InitPlan) e uma VARREDURA sobre `pg_policies`,
-- ou seja, age sobre o estado vivo em vez de listar policies uma a uma. Ela tem
-- que ficar DEPOIS de toda criacao de policy deste arquivo, senao as policies
-- criadas adiante voltam avaliando os helpers por linha (regressao medida de
-- 142 ms -> 8,2 s num COUNT de log_auditoria). Policy nova daqui em diante entra
-- ANTES dessa secao.
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
-- idx_motoristas_subcontratada removido: a coluna `motoristas.subcontratada_id`
-- foi dropada pela 0055 (minimizacao LGPD) e este CREATE INDEX passaria a
-- falhar num replay com "column does not exist", derrubando a transacao inteira.
-- Os indices equivalentes de veiculos/carretas/solicitacoes continuam validos.
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

-- `parceiro_usuario_id IS NOT NULL` NAO entra aqui, embora a 0018 original
-- exigisse: ver a 0054 no fim do arquivo. A forma antiga proibia o ON DELETE
-- SET NULL da 0031 e travava a exclusao de usuario do parceiro; a presenca no
-- INSERT e garantida pelo trigger da 0047/0054.
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_integridade;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_integridade
  CHECK (
    (origem = 'parceiro'
      AND parceiro_id IS NOT NULL
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
-- migrations 0031/0043, e os tres de agendamento da 0061) mesmo neste bloco
-- antigo (0023): re-adicionar a lista curta num remoto ja populado aborta
-- (23514) porque ja existem linhas desses tipos, dando rollback de TODA a
-- transacao do SQL Editor. Superset = replay seguro.
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
    'portal_usuario_excluido',
    'portal_agendamento_solicitado',
    'portal_agendamento_cancelado',
    'portal_agendamento_reagendado'
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
    'portal_usuario_excluido',
    'portal_agendamento_solicitado',
    'portal_agendamento_cancelado',
    'portal_agendamento_reagendado'
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
--
-- Assim como no bloco da 0018 acima, `parceiro_usuario_id IS NOT NULL` foi
-- retirado do ramo do parceiro — forma final da 0054.

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_integridade;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_integridade
  CHECK (
    (origem = 'parceiro'
      AND parceiro_id IS NOT NULL
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
-- 0048 — Indice de log_auditoria por registro auditado
-- =====================================================================
-- `log_auditoria` era 80 MB em ~44 mil linhas contra ~10 MB de todo o resto do
-- banco. Nenhum indice cobria `registro_id`, entao a reconstrucao da linha do
-- tempo de status nos Relatorios varria a tabela inteira a cada bloco de ids.

CREATE INDEX IF NOT EXISTS idx_log_auditoria_registro_created
  ON log_auditoria(registro_id, created_at DESC);

COMMENT ON INDEX idx_log_auditoria_registro_created IS
  'Historico por registro auditado. Sustenta o registro_id IN (...) + ORDER BY '
  'created_at dos Relatorios (reconstrucao de transicoes de status) e a leitura '
  'de historico de um registro. Migration 0048.';


-- =====================================================================
-- 0049 + 0050 — UPDATE grava so os campos alterados
-- =====================================================================
-- O audit_trigger da secao 2 gravava `to_jsonb(OLD)` e `to_jsonb(NEW)` inteiros
-- a cada UPDATE — duas copias da linha por alteracao de um campo. Era o que
-- fazia log_auditoria responder sozinha por ~90% do banco.
--
-- A 0049 fez o delta inline no trigger; a 0050 extraiu para a funcao pura
-- `audit_jsonb_delta` (testavel por RPC, para falha aparecer na resposta em vez
-- de virar fallback silencioso). So a forma final da 0050 esta aqui: replayar a
-- versao intermediaria da 0049 nao mudaria o estado final.

CREATE OR REPLACE FUNCTION audit_jsonb_delta(p_old jsonb, p_new jsonb)
RETURNS TABLE (antes jsonb, depois jsonb)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(jsonb_object_agg(e.key, p_old -> e.key), '{}'::jsonb),
    COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  FROM jsonb_each(p_new) AS e
  WHERE e.value IS DISTINCT FROM (p_old -> e.key);
$$;

COMMENT ON FUNCTION audit_jsonb_delta(jsonb, jsonb) IS
  'Reduz um par (antes, depois) as chaves que mudaram. Pura e testavel por RPC: '
  'existe separada do trigger justamente para que falhas aparecam na resposta em '
  'vez de virarem fallback silencioso (migration 0050).';

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user   uuid;
  v_old    jsonb;
  v_new    jsonb;
  v_antes  jsonb;
  v_depois jsonb;
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
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    BEGIN
      SELECT d.antes, d.depois INTO v_antes, v_depois
        FROM audit_jsonb_delta(v_old, v_new) AS d;
    EXCEPTION WHEN OTHERS THEN
      v_antes  := v_old;
      v_depois := v_new;
    END;
    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
    VALUES (v_user, 'UPDATE', TG_TABLE_NAME, NEW.id, v_antes, v_depois);
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes)
    VALUES (v_user, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION audit_trigger() IS
  'Trilha de auditoria. INSERT/DELETE guardam a linha completa; UPDATE guarda '
  'apenas as chaves alteradas, nos dois lados (migrations 0049/0050). '
  'SECURITY DEFINER com search_path fixo (0042).';


-- =====================================================================
-- 0054 — CHECK de origem aceita autor apagado
-- =====================================================================
-- Os blocos da 0018 e da 0034, la em cima, ja saem na forma final (sem exigir
-- `parceiro_usuario_id`). Este bloco repete o resultado para quem for aplicar so
-- a parte nova num remoto vivo, e traz o trigger da 0047 com a checagem de
-- PRESENCA que substituiu a garantia perdida no CHECK.
--
-- Motivo: a 0031 trocou solicitacoes.parceiro_usuario_id para ON DELETE SET NULL
-- (preservar o historico ao apagar o usuario) e o CHECK proibia exatamente esse
-- estado. Excluir usuario do parceiro so funcionava para quem nunca criou
-- solicitacao.

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_origem_integridade;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_integridade
  CHECK (
    (origem = 'parceiro'
      AND parceiro_id IS NOT NULL
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

COMMENT ON CONSTRAINT solicitacoes_origem_integridade ON solicitacoes IS
  'Solicitacao de parceiro usa apenas referencias parceiro_*; interna/e-mail nao '
  'usa nenhuma. parceiro_usuario_id NULO em linha de parceiro significa AUTOR '
  'APAGADO (ON DELETE SET NULL da 0031); a presenca no INSERT e exigida pelo '
  'trigger solicitacao_sanitizar_insert_externo (0047/0054).';

CREATE OR REPLACE FUNCTION solicitacao_sanitizar_insert_externo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Presenca do autor: era garantida pelo CHECK de origem ate a 0054.
  IF NEW.origem = 'parceiro' AND NEW.parceiro_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Solicitacao de parceiro exige parceiro_usuario_id.'
      USING ERRCODE = '23514';
  END IF;

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
  'INSERTs feitos por quem nao e interno, e valida presenca e posse de '
  'parceiro_usuario_id (migrations 0047 e 0054).';

DROP TRIGGER IF EXISTS trg_solicitacoes_sanitizar_externo ON solicitacoes;
CREATE TRIGGER trg_solicitacoes_sanitizar_externo
  BEFORE INSERT ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION solicitacao_sanitizar_insert_externo();


-- =====================================================================
-- 0056-0060 — Conformidade LGPD (auditoria de 2026-08-09)
-- =====================================================================
-- Bloco colocado AQUI, e nao no fim do arquivo, de proposito: a 0059 e a 0060
-- criam policy, e toda policy precisa nascer ANTES da varredura da 0051 logo
-- abaixo — senao ela fica avaliando meu_perfil_interno() por linha.
--
-- O "porque" de cada decisao esta nos arquivos de migration; aqui fica so o
-- DDL necessario para reconstruir o banco.

-- ---------- 0059 — log_acesso (registro de LEITURA de dado pessoal) ----------
CREATE TABLE IF NOT EXISTS log_acesso (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acao       text NOT NULL CHECK (acao IN ('export_csv', 'download_oc_pdf', 'abrir_anexo')),
  recurso    text,
  detalhe    jsonb,
  ip         text,
  user_agent text,
  origem     text NOT NULL DEFAULT 'interno' CHECK (origem IN ('interno', 'portal')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_log_acesso_created_at ON log_acesso (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_acesso_usuario    ON log_acesso (usuario_id);
CREATE INDEX IF NOT EXISTS idx_log_acesso_acao       ON log_acesso (acao);

ALTER TABLE log_acesso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS log_acesso_select ON log_acesso;
CREATE POLICY log_acesso_select ON log_acesso
  FOR SELECT TO authenticated
  USING (meu_perfil_interno() IN ('admin', 'gerente', 'supervisor'));

CREATE OR REPLACE FUNCTION registrar_acesso(
  p_acao text, p_recurso text DEFAULT NULL, p_detalhe jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid(); v_headers json; v_ip text; v_ua text;
  v_origem text; v_detalhe jsonb; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;
  IF p_acao NOT IN ('export_csv', 'download_oc_pdf', 'abrir_anexo') THEN RETURN NULL; END IF;
  BEGIN v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_ua := left(v_headers ->> 'user-agent', 500);
  END IF;
  v_origem := CASE WHEN is_interno() THEN 'interno' ELSE 'portal' END;
  v_detalhe := p_detalhe;
  IF v_detalhe IS NOT NULL AND length(v_detalhe::text) > 1024 THEN
    v_detalhe := jsonb_build_object('truncado', true);
  END IF;
  INSERT INTO log_acesso (usuario_id, acao, recurso, detalhe, ip, user_agent, origem)
  VALUES (v_user, p_acao, left(p_recurso, 120), v_detalhe, v_ip, v_ua, v_origem)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION registrar_acesso(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_acesso(text, text, jsonb) TO authenticated;

-- ---------- 0060 — fila de remocao no storage (anexos orfaos) ----------
CREATE TABLE IF NOT EXISTS storage_remocao_pendente (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket         text NOT NULL,
  path           text NOT NULL,
  motivo         text NOT NULL,
  solicitacao_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  removido_em    timestamptz,
  erro           text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_remocao_pendente_aberta
  ON storage_remocao_pendente (bucket, path) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_storage_remocao_pendente_abertas
  ON storage_remocao_pendente (created_at) WHERE removido_em IS NULL;

CREATE OR REPLACE FUNCTION enfileirar_remocao_anexo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO storage_remocao_pendente (bucket, path, motivo, solicitacao_id)
  VALUES ('solicitacoes-anexos', OLD.storage_path, TG_OP, OLD.solicitacao_id)
  ON CONFLICT DO NOTHING;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;  -- limpeza nunca aborta a exclusao que o usuario pediu
END; $$;

DROP TRIGGER IF EXISTS trg_anexo_enfileira_remocao ON solicitacao_anexos;
CREATE TRIGGER trg_anexo_enfileira_remocao
  AFTER DELETE ON solicitacao_anexos
  FOR EACH ROW EXECUTE FUNCTION enfileirar_remocao_anexo();

ALTER TABLE storage_remocao_pendente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_remocao_pendente_select ON storage_remocao_pendente;
CREATE POLICY storage_remocao_pendente_select ON storage_remocao_pendente
  FOR SELECT TO authenticated
  USING (meu_perfil_interno() IN ('admin', 'gerente', 'supervisor'));

CREATE OR REPLACE FUNCTION marcar_storage_removido(p_path text, p_erro text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR p_path IS NULL THEN RETURN; END IF;
  IF p_erro IS NULL THEN
    UPDATE storage_remocao_pendente SET removido_em = now(), erro = NULL
     WHERE path = p_path AND removido_em IS NULL;
  ELSE
    UPDATE storage_remocao_pendente SET erro = left(p_erro, 500)
     WHERE path = p_path AND removido_em IS NULL;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION marcar_storage_removido(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION marcar_storage_removido(text, text) TO authenticated;

-- ---------- 0056 (+0059) — politica de retencao ----------
-- Prazos: log_auditoria 5 anos; eventos_portal e log_acesso 1 ano.
-- p_dry_run = true por padrao. Nao esta agendada: rodar pelo SQL Editor.
CREATE OR REPLACE FUNCTION purgar_dados_antigos(
  p_dry_run boolean DEFAULT true,
  p_dias_auditoria int DEFAULT 1826,
  p_dias_eventos int DEFAULT 365
)
RETURNS TABLE (tabela text, corte timestamptz, linhas_alvo bigint, apagadas boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_corte_aud timestamptz := now() - make_interval(days => p_dias_auditoria);
  v_corte_evt timestamptz := now() - make_interval(days => p_dias_eventos);
  v_n bigint;
BEGIN
  IF p_dias_auditoria < 180 OR p_dias_eventos < 180 THEN
    RAISE EXCEPTION 'retencao curta demais (auditoria=% dias, eventos=% dias). Minimo 180.',
      p_dias_auditoria, p_dias_eventos;
  END IF;

  SELECT count(*) INTO v_n FROM log_auditoria WHERE created_at < v_corte_aud;
  IF NOT p_dry_run AND v_n > 0 THEN DELETE FROM log_auditoria WHERE created_at < v_corte_aud; END IF;
  tabela := 'log_auditoria'; corte := v_corte_aud; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0); RETURN NEXT;

  SELECT count(*) INTO v_n FROM eventos_portal WHERE created_at < v_corte_evt;
  IF NOT p_dry_run AND v_n > 0 THEN DELETE FROM eventos_portal WHERE created_at < v_corte_evt; END IF;
  tabela := 'eventos_portal'; corte := v_corte_evt; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0); RETURN NEXT;

  SELECT count(*) INTO v_n FROM log_acesso WHERE created_at < v_corte_evt;
  IF NOT p_dry_run AND v_n > 0 THEN DELETE FROM log_acesso WHERE created_at < v_corte_evt; END IF;
  tabela := 'log_acesso'; corte := v_corte_evt; linhas_alvo := v_n;
  apagadas := (NOT p_dry_run AND v_n > 0); RETURN NEXT;
END; $$;
REVOKE ALL ON FUNCTION purgar_dados_antigos(boolean, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purgar_dados_antigos(boolean, int, int) FROM anon, authenticated;

-- ---------- 0057 — direitos do titular ----------
CREATE OR REPLACE FUNCTION audit_scrub_pii(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE COALESCE(
    (SELECT jsonb_object_agg(e.key,
              CASE WHEN e.key IN ('nome_completo','nome_completo_unaccent','cpf',
                                  'telefone','observacoes','solicitante_nome',
                                  'solicitante_nome_unaccent','solicitante_telefone')
                   AND e.value <> 'null'::jsonb
                   THEN '"[ANONIMIZADO]"'::jsonb ELSE e.value END)
       FROM jsonb_each(p) AS e), p) END;
$$;

CREATE OR REPLACE FUNCTION exportar_dados_titular(p_cpf text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_digitos text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_ids_int uuid[]; v_ids_par uuid[]; v_out jsonb;
BEGIN
  IF meu_perfil_interno() IS DISTINCT FROM 'admin'
     AND meu_perfil_interno() IS DISTINCT FROM 'gerente' THEN
    RAISE EXCEPTION 'forbidden: exportar_dados_titular exige perfil admin ou gerente';
  END IF;
  IF length(v_digitos) <> 11 THEN
    RAISE EXCEPTION 'cpf invalido: informe os 11 digitos (recebido: % digitos)', length(v_digitos);
  END IF;

  SELECT array_agg(id) INTO v_ids_int FROM motoristas
   WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;
  SELECT array_agg(id) INTO v_ids_par FROM parceiro_motoristas
   WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;
  v_ids_int := COALESCE(v_ids_int, ARRAY[]::uuid[]);
  v_ids_par := COALESCE(v_ids_par, ARRAY[]::uuid[]);

  SELECT jsonb_build_object(
    'gerado_em', now(), 'gerado_por', auth.uid(), 'cpf_consultado', p_cpf,
    'encontrado', (array_length(v_ids_int,1) IS NOT NULL OR array_length(v_ids_par,1) IS NOT NULL),
    'cadastro_frota_interna', COALESCE(
      (SELECT jsonb_agg(to_jsonb(m)) FROM motoristas m WHERE m.id = ANY(v_ids_int)), '[]'::jsonb),
    'cadastro_frota_parceiro', COALESCE(
      (SELECT jsonb_agg(to_jsonb(pm) || jsonb_build_object('parceiro', p.razao_social))
         FROM parceiro_motoristas pm JOIN parceiros p ON p.id = pm.parceiro_id
        WHERE pm.id = ANY(v_ids_par)), '[]'::jsonb),
    'solicitacoes', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', s.id, 'numero_interno', s.numero_interno,
                'tipo', s.tipo, 'status', s.status, 'origem', s.origem,
                'created_at', s.created_at, 'finalizada_em', s.finalizada_em))
         FROM solicitacoes s
        WHERE s.motorista_id = ANY(v_ids_int) OR s.parceiro_motorista_id = ANY(v_ids_par)), '[]'::jsonb),
    'anexos', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('filename', a.filename, 'storage_path', a.storage_path,
                'mime_type', a.mime_type, 'created_at', a.created_at))
         FROM solicitacao_anexos a JOIN solicitacoes s ON s.id = a.solicitacao_id
        WHERE s.motorista_id = ANY(v_ids_int) OR s.parceiro_motorista_id = ANY(v_ids_par)), '[]'::jsonb),
    'auditoria_do_cadastro', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('acao', l.acao, 'tabela', l.tabela,
                'registro_id', l.registro_id, 'quando', l.created_at,
                'por', COALESCE(pu.nome_completo, l.usuario_id::text)))
         FROM log_auditoria l LEFT JOIN perfis_usuarios pu ON pu.user_id = l.usuario_id
        WHERE (l.tabela = 'motoristas' AND l.registro_id = ANY(v_ids_int))
           OR (l.tabela = 'parceiro_motoristas' AND l.registro_id = ANY(v_ids_par))), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END; $$;
REVOKE ALL ON FUNCTION exportar_dados_titular(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION exportar_dados_titular(text) TO authenticated;

CREATE OR REPLACE FUNCTION anonimizar_titular(p_cpf text, p_confirmar boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_digitos text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_ids_int uuid[]; v_ids_par uuid[]; v_abertas bigint; v_scrub_aud bigint := 0;
  v_marcador constant text := '[ANONIMIZADO]';
BEGIN
  IF meu_perfil_interno() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: anonimizar_titular exige perfil admin';
  END IF;
  IF length(v_digitos) <> 11 THEN
    RAISE EXCEPTION 'cpf invalido: informe os 11 digitos (recebido: % digitos)', length(v_digitos);
  END IF;

  SELECT array_agg(id) INTO v_ids_int FROM motoristas
   WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;
  SELECT array_agg(id) INTO v_ids_par FROM parceiro_motoristas
   WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;
  v_ids_int := COALESCE(v_ids_int, ARRAY[]::uuid[]);
  v_ids_par := COALESCE(v_ids_par, ARRAY[]::uuid[]);

  IF array_length(v_ids_int,1) IS NULL AND array_length(v_ids_par,1) IS NULL THEN
    RETURN jsonb_build_object('encontrado', false, 'cpf_consultado', p_cpf);
  END IF;

  SELECT count(*) INTO v_abertas FROM solicitacoes s
   WHERE (s.motorista_id = ANY(v_ids_int) OR s.parceiro_motorista_id = ANY(v_ids_par))
     AND s.status NOT IN ('finalizada', 'cancelada');
  IF v_abertas > 0 THEN
    RAISE EXCEPTION 'titular tem % solicitacao(oes) em andamento — finalize ou cancele antes de anonimizar', v_abertas;
  END IF;

  IF NOT p_confirmar THEN
    RETURN jsonb_build_object('simulacao', true, 'encontrado', true, 'cpf_consultado', p_cpf,
      'cadastros_frota_interna', COALESCE(array_length(v_ids_int,1), 0),
      'cadastros_frota_parceiro', COALESCE(array_length(v_ids_par,1), 0),
      'solicitacoes_preservadas', (SELECT count(*) FROM solicitacoes s
         WHERE s.motorista_id = ANY(v_ids_int) OR s.parceiro_motorista_id = ANY(v_ids_par)),
      'linhas_de_auditoria_a_limpar', (SELECT count(*) FROM log_auditoria l
         WHERE (l.tabela = 'motoristas' AND l.registro_id = ANY(v_ids_int))
            OR (l.tabela = 'parceiro_motoristas' AND l.registro_id = ANY(v_ids_par))),
      'aviso', 'nada foi alterado. Repita com p_confirmar => true para aplicar.');
  END IF;

  UPDATE motoristas SET nome_completo = v_marcador,
         cpf = 'ANON-' || left(replace(id::text, '-', ''), 12),
         telefone = NULL, observacoes = NULL, ativo = false
   WHERE id = ANY(v_ids_int);
  UPDATE parceiro_motoristas SET nome_completo = v_marcador,
         cpf = 'ANON-' || left(replace(id::text, '-', ''), 12),
         telefone = NULL, observacoes = NULL, ativo = false
   WHERE id = ANY(v_ids_par);

  -- DEPOIS dos UPDATEs de proposito: eles disparam o audit_trigger, que grava
  -- o nome e o CPF antigos. Limpar antes reintroduziria o dado em silencio.
  WITH alvo AS (
    UPDATE log_auditoria l SET dados_antes = audit_scrub_pii(l.dados_antes),
                               dados_depois = audit_scrub_pii(l.dados_depois)
     WHERE (l.tabela = 'motoristas' AND l.registro_id = ANY(v_ids_int))
        OR (l.tabela = 'parceiro_motoristas' AND l.registro_id = ANY(v_ids_par))
    RETURNING 1)
  SELECT count(*) INTO v_scrub_aud FROM alvo;

  RETURN jsonb_build_object('simulacao', false, 'encontrado', true,
    'anonimizado_em', now(), 'anonimizado_por', auth.uid(),
    'cadastros_frota_interna', COALESCE(array_length(v_ids_int,1), 0),
    'cadastros_frota_parceiro', COALESCE(array_length(v_ids_par,1), 0),
    'linhas_de_auditoria_limpas', v_scrub_aud,
    'ids_preservados', to_jsonb(v_ids_int || v_ids_par));
END; $$;
REVOKE ALL ON FUNCTION anonimizar_titular(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION anonimizar_titular(text, boolean) TO authenticated;

-- ---------- 0058 — registrar_evento_portal: IP/UA do header + rate limit ----------
-- Substitui a versao da 0021/0023/0031/0043 acima. IP e user-agent passam a
-- vir dos headers (o cliente nao forja) e ha teto de metadata e rate limit.
CREATE INDEX IF NOT EXISTS idx_eventos_portal_ip_created
  ON eventos_portal (ip, created_at DESC) WHERE tipo_evento = 'portal_login_falha';

CREATE OR REPLACE FUNCTION registrar_evento_portal(p_tipo_evento text, p_payload jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_pu parceiro_usuarios%ROWTYPE;
  v_parceiro_id uuid; v_parceiro_usuario_id uuid; v_email_tentado text;
  v_solicitacao_id uuid; v_ip text; v_user_agent text; v_metadata jsonb;
  v_headers json; v_recentes int; v_id uuid;
BEGIN
  IF p_tipo_evento NOT IN ('portal_login','portal_login_falha','portal_logout',
    'portal_solicitacao_criada','portal_solicitacao_editada',
    'portal_solicitacao_cancelada','portal_senha_alterada',
    'portal_usuario_convidado','portal_usuario_excluido') THEN
    RAISE EXCEPTION 'tipo_evento invalido: %', p_tipo_evento;
  END IF;

  BEGIN v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_user_agent := v_headers ->> 'user-agent';
  END IF;
  v_user_agent := left(COALESCE(v_user_agent, p_payload ->> 'user_agent'), 500);

  IF p_tipo_evento = 'portal_login_falha' AND v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_recentes FROM eventos_portal
     WHERE tipo_evento = 'portal_login_falha' AND ip = v_ip
       AND created_at > now() - interval '5 minutes';
    IF v_recentes >= 20 THEN RETURN NULL; END IF;  -- silencioso de proposito
  END IF;

  IF p_tipo_evento = 'portal_login_falha' THEN
    v_email_tentado := left(p_payload ->> 'email_tentado', 320);
  ELSE
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v_pu FROM parceiro_usuarios
      WHERE user_id = v_user_id AND ativo = true LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_parceiro_id := v_pu.parceiro_id; v_parceiro_usuario_id := v_pu.id;
  END IF;

  v_solicitacao_id := NULLIF(p_payload ->> 'solicitacao_id', '')::uuid;
  v_metadata := COALESCE(p_payload, '{}'::jsonb)
                - ARRAY['email_tentado','ip','user_agent','solicitacao_id'];
  IF v_metadata = '{}'::jsonb THEN v_metadata := NULL;
  ELSIF length(v_metadata::text) > 2048 THEN
    v_metadata := jsonb_build_object('truncado', true, 'motivo', 'metadata acima de 2KB',
                                     'bytes_originais', length(v_metadata::text));
  END IF;

  INSERT INTO eventos_portal (tipo_evento, user_id, parceiro_id, parceiro_usuario_id,
    email_tentado, solicitacao_id, ip, user_agent, metadata)
  VALUES (p_tipo_evento, v_user_id, v_parceiro_id, v_parceiro_usuario_id,
    v_email_tentado, v_solicitacao_id, v_ip, v_user_agent, v_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION registrar_evento_portal(text, jsonb) TO anon, authenticated;


-- =====================================================================
-- 0061 — Modulo de Agendamentos (docs/SPEC-AGENDAMENTOS.md)
-- =====================================================================
-- Digitaliza a solicitacao de agendamento de descarga em terminal. Fica ANTES
-- da varredura da 0051 porque cria policies (agendamentos, terminal_janelas e
-- storage.objects).
--
-- Decisoes que o schema materializa: agendamento e sempre filho de uma
-- solicitacao; a NF nasce no carregamento, logo o pedido so vale depois que a
-- carga sai; data desejada e preferencia, nao exigencia; reagendar cria linha
-- nova ('substituido' na anterior); o que exige agendamento e atributo do
-- CLIENTE, nao da rota.

-- ---------- clientes: quem exige agendamento ----------
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS requer_agendamento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal_nome text,
  ADD COLUMN IF NOT EXISTS antecedencia_minima_horas integer,
  ADD COLUMN IF NOT EXISTS observacoes_agendamento text;

-- ---------- terminal_janelas: grade de slots ----------
-- Dois padroes de grade, nao um: 08..16 de 1 h com 4 vagas (TCI, Arcelor,
-- Metalsider) e 06/13/19 de 6 h com 10 vagas (A.B/CSN). Uma linha por slot —
-- janela_inicio/janela_fim nao representariam os dois.
CREATE TABLE IF NOT EXISTS terminal_janelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  hora time NOT NULL,
  duracao_minutos integer NOT NULL DEFAULT 60,
  capacidade integer,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (cliente_id, hora)
);
CREATE INDEX IF NOT EXISTS idx_terminal_janelas_cliente
  ON terminal_janelas(cliente_id) WHERE ativo = true;

DROP TRIGGER IF EXISTS trg_terminal_janelas_updated ON terminal_janelas;
CREATE TRIGGER trg_terminal_janelas_updated BEFORE UPDATE ON terminal_janelas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS aud_terminal_janelas ON terminal_janelas;
CREATE TRIGGER aud_terminal_janelas AFTER INSERT OR UPDATE OR DELETE ON terminal_janelas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ---------- agendamentos ----------
CREATE TABLE IF NOT EXISTS agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_interno serial UNIQUE NOT NULL,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  parceiro_id uuid REFERENCES parceiros(id) ON DELETE CASCADE,
  parceiro_usuario_id uuid REFERENCES parceiro_usuarios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'solicitado',
  data_preferida date NOT NULL,
  hora_preferida time,
  observacoes text,
  nota_fiscal text,
  nota_fiscal_origem text,
  data_agendada date,
  hora_agendada time,
  hora_fora_da_grade boolean NOT NULL DEFAULT false,
  comprovante_path text,
  nf_pdf_path text,
  contrato_frete_path text,   -- 0064
  substitui_agendamento_id uuid REFERENCES agendamentos(id) ON DELETE SET NULL,
  motivo_reagendamento text,
  assumido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assumido_em timestamptz,
  agendado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agendado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 0064 — coluna do contrato de frete. Precisa de ALTER e nao so do CREATE TABLE
-- acima: num banco que ja tem `agendamentos` (parou na 0061), o CREATE TABLE IF
-- NOT EXISTS e no-op e a coluna nunca chegaria — e o CHECK abaixo, que a
-- referencia, quebraria com "column does not exist".
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS contrato_frete_path text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_status_check') THEN
    ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_status_check
      CHECK (status IN ('solicitado','em_andamento','agendado','substituido','cancelado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_nf_origem_check') THEN
    ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_nf_origem_check
      CHECK (nota_fiscal_origem IS NULL OR nota_fiscal_origem IN ('automatica','manual'));
  END IF;
END $$;

-- `agendado_completo` na forma FINAL da 0064 (com o contrato de frete), e SEM
-- guarda de "se nao existir": um banco parado na 0061 ja tem a constraint na
-- forma antiga, e a guarda faria o replay puxar para o lado errado — deixaria a
-- versao de tres campos no lugar, achando que estava tudo certo. DROP + ADD
-- converge de qualquer estado.
--
-- NOT VALID pelo mesmo motivo da migration: existem agendamentos concluidos
-- ANTES desta regra, e um replay nao pode abortar por causa deles. A regra vale
-- para toda linha inserida ou atualizada daqui em diante; para fechar a divida,
-- anexe o contrato nas linhas herdadas e rode
-- `ALTER TABLE agendamentos VALIDATE CONSTRAINT agendamentos_agendado_completo`.
ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_agendado_completo;
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_agendado_completo
  CHECK (status <> 'agendado'
         OR (data_agendada IS NOT NULL AND hora_agendada IS NOT NULL
             AND comprovante_path IS NOT NULL
             AND contrato_frete_path IS NOT NULL)) NOT VALID;

-- Um agendamento vivo por solicitacao: e este indice que obriga o
-- reagendamento a passar pela RPC (substitui + insere na mesma transacao).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_ativo_por_solicitacao
  ON agendamentos(solicitacao_id)
  WHERE status IN ('solicitado','em_andamento','agendado');
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_parceiro ON agendamentos(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_solicitacao ON agendamentos(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_fila
  ON agendamentos(created_at) WHERE status IN ('solicitado','em_andamento');
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_agendada
  ON agendamentos(data_agendada, hora_agendada) WHERE status = 'agendado';

CREATE OR REPLACE FUNCTION agendamento_preencher_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente_requer boolean;
BEGIN
  SELECT s.parceiro_id, c.requer_agendamento
    INTO NEW.parceiro_id, v_cliente_requer
    FROM solicitacoes s
    LEFT JOIN clientes c ON c.id = s.cliente_id
   WHERE s.id = NEW.solicitacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = '23503';
  END IF;
  IF v_cliente_requer IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta rota nao exige agendamento.' USING ERRCODE = '23514';
  END IF;
  IF NEW.parceiro_usuario_id IS NULL THEN
    SELECT pu.id INTO NEW.parceiro_usuario_id FROM parceiro_usuarios pu
     WHERE pu.user_id = auth.uid() AND pu.ativo = true LIMIT 1;
  END IF;
  NEW.created_by := auth.uid();
  NEW.status := 'solicitado';
  NEW.assumido_por := NULL; NEW.assumido_em := NULL;
  NEW.agendado_por := NULL; NEW.agendado_em := NULL;
  NEW.data_agendada := NULL; NEW.hora_agendada := NULL;
  NEW.hora_fora_da_grade := false; NEW.comprovante_path := NULL;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION agendamento_transicao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ok boolean; v_slots integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_ok := CASE OLD.status
      WHEN 'solicitado'   THEN NEW.status IN ('em_andamento','cancelado')
      WHEN 'em_andamento' THEN NEW.status IN ('agendado','solicitado','cancelado')
      WHEN 'agendado'     THEN NEW.status IN ('substituido','cancelado')
      ELSE false
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Transicao invalida de % para %.', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'em_andamento' AND OLD.status <> 'em_andamento' THEN
    NEW.assumido_por := COALESCE(auth.uid(), NEW.assumido_por);
    NEW.assumido_em := now();
  END IF;
  IF NEW.status = 'solicitado' AND OLD.status = 'em_andamento' THEN
    NEW.assumido_por := NULL; NEW.assumido_em := NULL;
  END IF;
  IF NEW.status = 'agendado' AND OLD.status <> 'agendado' THEN
    NEW.agendado_por := COALESCE(auth.uid(), NEW.agendado_por);
    NEW.agendado_em := now();
    SELECT count(*) INTO v_slots FROM terminal_janelas tj
      JOIN solicitacoes s ON s.cliente_id = tj.cliente_id
     WHERE s.id = NEW.solicitacao_id AND tj.ativo = true;
    IF v_slots = 0 THEN
      NEW.hora_fora_da_grade := false;
    ELSE
      NEW.hora_fora_da_grade := NOT EXISTS (
        SELECT 1 FROM terminal_janelas tj
          JOIN solicitacoes s ON s.cliente_id = tj.cliente_id
         WHERE s.id = NEW.solicitacao_id AND tj.ativo = true AND tj.hora = NEW.hora_agendada);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_agendamento_preencher ON agendamentos;
CREATE TRIGGER trg_agendamento_preencher BEFORE INSERT ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION agendamento_preencher_insert();
DROP TRIGGER IF EXISTS trg_agendamento_transicao ON agendamentos;
CREATE TRIGGER trg_agendamento_transicao BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION agendamento_transicao();
DROP TRIGGER IF EXISTS trg_agendamentos_updated ON agendamentos;
CREATE TRIGGER trg_agendamentos_updated BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS aud_agendamentos ON agendamentos;
CREATE TRIGGER aud_agendamentos AFTER INSERT OR UPDATE OR DELETE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ---------- RLS ----------
-- Parceiro le (o SELECT tambem e o que habilita o Realtime dele) e escreve
-- so pelas RPCs, como na 0044.
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_janelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agendamentos_interno_all ON agendamentos;
DROP POLICY IF EXISTS agendamentos_parceiro_select ON agendamentos;
CREATE POLICY agendamentos_interno_all ON agendamentos FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));
CREATE POLICY agendamentos_parceiro_select ON agendamentos FOR SELECT TO authenticated
  USING (parceiro_id = (SELECT get_current_parceiro_id()));

DROP POLICY IF EXISTS terminal_janelas_interno_all ON terminal_janelas;
DROP POLICY IF EXISTS terminal_janelas_leitura ON terminal_janelas;
CREATE POLICY terminal_janelas_interno_all ON terminal_janelas FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));
CREATE POLICY terminal_janelas_leitura ON terminal_janelas FOR SELECT TO authenticated
  USING (ativo = true);

-- ---------- Storage: bucket privado agendamentos-docs ----------
-- Diferente de `ocs-pdf`, o parceiro LE os proprios comprovantes: e o que ele
-- precisa receber de volta. Escrita so da equipe.
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('agendamentos-docs', 'agendamentos-docs', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem privilegio para criar o bucket agendamentos-docs via SQL. Crie-o PRIVADO pelo Dashboard.';
END $$;

CREATE OR REPLACE FUNCTION storage_agendamento_pertence_ao_parceiro_logado(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM agendamentos
     WHERE id::text = split_part(p_name, '/', 1)
       AND parceiro_id IS NOT NULL
       AND parceiro_id = get_current_parceiro_id());
$$;

DROP POLICY IF EXISTS "agendamentos_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "agendamentos_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "agendamentos_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "agendamentos_docs_delete" ON storage.objects;
CREATE POLICY "agendamentos_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agendamentos-docs'
         AND ((SELECT is_interno()) OR storage_agendamento_pertence_ao_parceiro_logado(name)));
CREATE POLICY "agendamentos_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agendamentos-docs' AND (SELECT is_interno()));
CREATE POLICY "agendamentos_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agendamentos-docs' AND (SELECT is_interno()));
CREATE POLICY "agendamentos_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agendamentos-docs' AND (SELECT is_interno()));

-- ---------- clientes_publicos ganha as colunas de agendamento (0061 + 0062) ----------
-- O portal precisa saber se o destino exige agendamento e qual a antecedencia;
-- o parceiro nao tem SELECT em `clientes` e esta view e a via para isso.
--
-- Forma FINAL ja com a 0062: entram os tres campos ESTRUTURADOS e fica de fora
-- `observacoes_agendamento`, que e texto livre da equipe. A view responde a
-- role `anon` (a anon key viaja no bundle do front), entao prosa da operacao
-- nao pode passar por aqui — mesma razao pela qual `agendamentos` guarda um
-- booleano em vez de "observacoes internas".
--
-- DROP + CREATE, e nao CREATE OR REPLACE: replace nao remove coluna, e um banco
-- parado na 0061 (com quatro colunas) faria o replay abortar. Nada depende
-- desta view, entao o DROP e seguro. O SELECT do `anon` volta pelos default
-- privileges do schema public, como antes.
DROP VIEW IF EXISTS clientes_publicos;
CREATE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf,
       requer_agendamento, terminal_nome, antecedencia_minima_horas
FROM clientes
WHERE ativo = true
  AND cliente_minerio = true;
GRANT SELECT ON clientes_publicos TO authenticated;

-- ---------- RPCs ----------
-- Ocupacao da propria LHG por slot: referencia parcial, nunca disponibilidade.
-- A vaga real vive no sistema do terminal e outras transportadoras tambem
-- ocupam slots. DEFINER porque o parceiro so enxerga os proprios agendamentos.
CREATE OR REPLACE FUNCTION agendamentos_ocupacao_slot(p_cliente_id uuid, p_data date)
RETURNS TABLE (hora time, duracao_minutos integer, capacidade integer, ocupados integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT tj.hora, tj.duracao_minutos, tj.capacidade,
         (SELECT count(*)::integer FROM agendamentos a
            JOIN solicitacoes s ON s.id = a.solicitacao_id
           WHERE a.status = 'agendado' AND a.data_agendada = p_data
             AND a.hora_agendada = tj.hora AND s.cliente_id = p_cliente_id) AS ocupados
    FROM terminal_janelas tj
   WHERE tj.cliente_id = p_cliente_id AND tj.ativo = true
   ORDER BY tj.hora;
$$;

-- Grade padrao por id do cliente — o casamento por razao_social e fragil (a
-- base tem 'A. B. OPERADORA DE TERMINAIS L' e ' Estoque-A. B. OPERADORA DE TE').
CREATE OR REPLACE FUNCTION terminal_aplicar_grade_padrao(p_cliente_id uuid, p_modelo text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_inseridos integer := 0;
BEGIN
  IF p_modelo = 'horaria' THEN
    INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade, created_by)
    SELECT p_cliente_id, g.h::time, 60, 4, auth.uid()
      FROM generate_series(timestamp '2000-01-01 08:00', timestamp '2000-01-01 16:00',
                           interval '1 hour') AS g(h)
    ON CONFLICT (cliente_id, hora) DO NOTHING;
  ELSIF p_modelo = 'janela_longa' THEN
    INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade, created_by)
    SELECT p_cliente_id, g.h, 360, 10, auth.uid()
      FROM (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
    ON CONFLICT (cliente_id, hora) DO NOTHING;
  ELSE
    RAISE EXCEPTION 'Modelo de grade invalido: % (use horaria ou janela_longa).', p_modelo
      USING ERRCODE = '22023';
  END IF;
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RETURN v_inseridos;
END; $$;

-- Nucleo do reagendamento, sem GRANT: so as duas RPCs abaixo o chamam, depois
-- de autorizar. DEFINER sem checagem de permissao nao pode ir a authenticated.
CREATE OR REPLACE FUNCTION agendamento_reagendar_core(
  p_agendamento_id uuid, p_motivo text, p_nova_data date, p_nova_hora time)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_antigo agendamentos%ROWTYPE; v_novo uuid;
BEGIN
  SELECT * INTO v_antigo FROM agendamentos WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado.' USING ERRCODE = 'PT404';
  END IF;
  IF v_antigo.status <> 'agendado' THEN
    RAISE EXCEPTION 'So um agendamento ja confirmado pode ser reagendado.' USING ERRCODE = 'PT409';
  END IF;
  IF p_nova_data IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data desejada.' USING ERRCODE = '22004';
  END IF;
  UPDATE agendamentos
     SET status = 'substituido',
         motivo_reagendamento = COALESCE(NULLIF(btrim(p_motivo), ''), motivo_reagendamento)
   WHERE id = p_agendamento_id;
  INSERT INTO agendamentos (solicitacao_id, data_preferida, hora_preferida, observacoes,
                            nota_fiscal, nota_fiscal_origem,
                            substitui_agendamento_id, motivo_reagendamento)
  VALUES (v_antigo.solicitacao_id, p_nova_data, p_nova_hora, v_antigo.observacoes,
          v_antigo.nota_fiscal, v_antigo.nota_fiscal_origem,
          p_agendamento_id, NULLIF(btrim(p_motivo), ''))
  RETURNING id INTO v_novo;
  RETURN v_novo;
END; $$;
REVOKE ALL ON FUNCTION agendamento_reagendar_core(uuid, text, date, time) FROM public, anon, authenticated;

-- Forma FINAL da 0068 (com `p_nota_fiscal`). O DROP da assinatura de 4
-- argumentos e obrigatorio: lista de argumentos diferente cria SOBRECARGA, nao
-- substitui, e sobrariam duas versoes para o PostgREST escolher.
DROP FUNCTION IF EXISTS portal_solicitar_agendamento(uuid, date, time, text);
CREATE OR REPLACE FUNCTION portal_solicitar_agendamento(
  p_solicitacao_id uuid, p_data_preferida date, p_hora_preferida time, p_observacoes text,
  p_nota_fiscal text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
  v_status text; v_cliente uuid; v_requer boolean; v_antecedencia integer;
  v_min_data date; v_slots integer; v_nota text; v_id uuid;
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;
  SELECT s.status, s.cliente_id, c.requer_agendamento, c.antecedencia_minima_horas
    INTO v_status, v_cliente, v_requer, v_antecedencia
    FROM solicitacoes s LEFT JOIN clientes c ON c.id = s.cliente_id
   WHERE s.id = p_solicitacao_id AND s.origem = 'parceiro' AND s.parceiro_id = v_parceiro;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'PT404';
  END IF;
  IF v_requer IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta rota nao exige agendamento.' USING ERRCODE = 'PT409';
  END IF;
  -- A NF nasce no carregamento: antes da OC enviada o pedido chega cedo demais.
  IF v_status NOT IN ('oc_enviada','finalizada') THEN
    RAISE EXCEPTION 'O agendamento so pode ser pedido depois que a carga sai (OC enviada).'
      USING ERRCODE = 'PT409';
  END IF;
  IF p_data_preferida IS NULL THEN
    RAISE EXCEPTION 'Informe a data desejada.' USING ERRCODE = '22004';
  END IF;
  -- Fuso explicito: o servidor roda em UTC e o front calcula a data minima no
  -- relogio local. Sem isto, das 21h em diante o SisLog recusaria uma data que
  -- a propria tela acabou de oferecer (mesmo motivo do dia-calendario da 0022).
  v_min_data := ((now() AT TIME ZONE 'America/Sao_Paulo')
                 + make_interval(hours => COALESCE(v_antecedencia, 0)))::date;
  IF p_data_preferida < v_min_data THEN
    RAISE EXCEPTION 'Este terminal exige % h de antecedencia.', COALESCE(v_antecedencia, 0)
      USING ERRCODE = 'PT422';
  END IF;
  IF p_hora_preferida IS NOT NULL THEN
    SELECT count(*) INTO v_slots FROM terminal_janelas
     WHERE cliente_id = v_cliente AND ativo = true;
    IF v_slots > 0 AND NOT EXISTS (
      SELECT 1 FROM terminal_janelas
       WHERE cliente_id = v_cliente AND ativo = true AND hora = p_hora_preferida) THEN
      RAISE EXCEPTION 'Horario indisponivel na grade deste terminal.' USING ERRCODE = 'PT422';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM agendamentos
              WHERE solicitacao_id = p_solicitacao_id
                AND status IN ('solicitado','em_andamento','agendado')) THEN
    RAISE EXCEPTION 'Ja existe um agendamento em aberto para esta solicitacao.'
      USING ERRCODE = 'PT409';
  END IF;
  -- Teto de tamanho: numero de nota nao passa disso, e o campo e livre.
  v_nota := NULLIF(left(btrim(p_nota_fiscal), 40), '');
  INSERT INTO agendamentos (solicitacao_id, data_preferida, hora_preferida, observacoes,
                            nota_fiscal, nota_fiscal_origem)
  VALUES (p_solicitacao_id, p_data_preferida, p_hora_preferida, NULLIF(btrim(p_observacoes), ''),
          v_nota, CASE WHEN v_nota IS NULL THEN NULL ELSE 'manual' END)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Forma FINAL da 0065: cancela em QUALQUER estado vivo (solicitado,
-- em_andamento, agendado). A 0061 travava em 'solicitado' com o argumento de
-- que depois disso a equipe ja podia ter agendado no terminal — argumento
-- invertido: manter de pe um pedido que o parceiro abandonou e que faz o
-- SisLog mentir, com a equipe tocando uma janela que ninguem vai usar.
-- Continua sem DELETE: a linha vira 'cancelado' e fica no historico (2.4).
CREATE OR REPLACE FUNCTION portal_cancelar_agendamento(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;
  UPDATE agendamentos SET status = 'cancelado'
   WHERE id = p_id AND parceiro_id = v_parceiro
     AND status IN ('solicitado', 'em_andamento', 'agendado');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este agendamento ja foi cancelado ou substituido.'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN p_id;
END; $$;

CREATE OR REPLACE FUNCTION portal_reagendar_agendamento(
  p_id uuid, p_motivo text, p_nova_data date, p_nova_hora time)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM agendamentos
                  WHERE id = p_id AND parceiro_id = v_parceiro AND status = 'agendado') THEN
    RAISE EXCEPTION 'Agendamento nao encontrado ou nao reagendavel.' USING ERRCODE = 'PT409';
  END IF;
  RETURN agendamento_reagendar_core(p_id, p_motivo, p_nova_data, p_nova_hora);
END; $$;

CREATE OR REPLACE FUNCTION agendamento_reagendar(
  p_agendamento_id uuid, p_motivo text, p_nova_data date, p_nova_hora time)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_interno() THEN
    RAISE EXCEPTION 'Apenas a equipe interna pode reagendar por aqui.' USING ERRCODE = '42501';
  END IF;
  RETURN agendamento_reagendar_core(p_agendamento_id, p_motivo, p_nova_data, p_nova_hora);
END; $$;

-- Trava de concorrencia: numa equipe de 15 pessoas, sem isto duas agendam a
-- mesma nota. Item parado ha mais de 2 h volta a ser assumivel.
CREATE OR REPLACE FUNCTION agendamento_assumir(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE agendamentos
     SET status = 'em_andamento', assumido_por = auth.uid(), assumido_em = now()
   WHERE id = p_id
     AND (status = 'solicitado'
       OR (status = 'em_andamento' AND assumido_em < now() - interval '2 hours')
       OR (status = 'em_andamento' AND assumido_por = auth.uid()));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este agendamento ja esta com outra pessoa.' USING ERRCODE = 'PT409';
  END IF;
  RETURN p_id;
END; $$;

REVOKE ALL ON FUNCTION agendamentos_ocupacao_slot(uuid, date) FROM public, anon;
REVOKE ALL ON FUNCTION terminal_aplicar_grade_padrao(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION portal_cancelar_agendamento(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION portal_reagendar_agendamento(uuid, text, date, time) FROM public, anon;
REVOKE ALL ON FUNCTION agendamento_reagendar(uuid, text, date, time) FROM public, anon;
REVOKE ALL ON FUNCTION agendamento_assumir(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION agendamentos_ocupacao_slot(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION terminal_aplicar_grade_padrao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cancelar_agendamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_reagendar_agendamento(uuid, text, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION agendamento_reagendar(uuid, text, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION agendamento_assumir(uuid) TO authenticated;

-- ---------- Eventos do portal ----------
-- O CHECK ja esta na forma final (superset) nos blocos da 0023 e da 0031 mais
-- acima; aqui so a funcao, que precisa vir DEPOIS da versao da 0058 para que a
-- ultima definicao seja a que aceita os tres tipos novos. Mesmo corpo da 0058
-- (IP/UA dos headers, teto de metadata, rate limit no login falho).
CREATE OR REPLACE FUNCTION registrar_evento_portal(p_tipo_evento text, p_payload jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_pu parceiro_usuarios%ROWTYPE;
  v_parceiro_id uuid; v_parceiro_usuario_id uuid; v_email_tentado text;
  v_solicitacao_id uuid; v_ip text; v_user_agent text; v_metadata jsonb;
  v_headers json; v_recentes int; v_id uuid;
BEGIN
  IF p_tipo_evento NOT IN ('portal_login','portal_login_falha','portal_logout',
    'portal_solicitacao_criada','portal_solicitacao_editada',
    'portal_solicitacao_cancelada','portal_senha_alterada',
    'portal_usuario_convidado','portal_usuario_excluido',
    'portal_agendamento_solicitado','portal_agendamento_cancelado',
    'portal_agendamento_reagendado') THEN
    RAISE EXCEPTION 'tipo_evento invalido: %', p_tipo_evento;
  END IF;

  BEGIN v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_user_agent := v_headers ->> 'user-agent';
  END IF;
  v_user_agent := left(COALESCE(v_user_agent, p_payload ->> 'user_agent'), 500);

  IF p_tipo_evento = 'portal_login_falha' AND v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_recentes FROM eventos_portal
     WHERE tipo_evento = 'portal_login_falha' AND ip = v_ip
       AND created_at > now() - interval '5 minutes';
    IF v_recentes >= 20 THEN RETURN NULL; END IF;  -- silencioso de proposito
  END IF;

  IF p_tipo_evento = 'portal_login_falha' THEN
    v_email_tentado := left(p_payload ->> 'email_tentado', 320);
  ELSE
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v_pu FROM parceiro_usuarios
      WHERE user_id = v_user_id AND ativo = true LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_parceiro_id := v_pu.parceiro_id; v_parceiro_usuario_id := v_pu.id;
  END IF;

  v_solicitacao_id := NULLIF(p_payload ->> 'solicitacao_id', '')::uuid;
  v_metadata := COALESCE(p_payload, '{}'::jsonb)
                - ARRAY['email_tentado','ip','user_agent','solicitacao_id'];
  IF v_metadata = '{}'::jsonb THEN v_metadata := NULL;
  ELSIF length(v_metadata::text) > 2048 THEN
    v_metadata := jsonb_build_object('truncado', true, 'motivo', 'metadata acima de 2KB',
                                     'bytes_originais', length(v_metadata::text));
  END IF;

  INSERT INTO eventos_portal (tipo_evento, user_id, parceiro_id, parceiro_usuario_id,
    email_tentado, solicitacao_id, ip, user_agent, metadata)
  VALUES (p_tipo_evento, v_user_id, v_parceiro_id, v_parceiro_usuario_id,
    v_email_tentado, v_solicitacao_id, v_ip, v_user_agent, v_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION registrar_evento_portal(text, jsonb) TO anon, authenticated;

-- ---------- Registro de acesso a dado pessoal (LGPD art. 37) ----------
-- Duas leituras novas deste modulo: o comprovante/PDF da NF (nome, CPF, placas)
-- e o CPF do painel de trabalho, que aparece mascarado e so e revelado ao
-- copiar. Vem DEPOIS da versao da 0059 para que a ultima definicao valha.
ALTER TABLE log_acesso DROP CONSTRAINT IF EXISTS log_acesso_acao_check;
ALTER TABLE log_acesso ADD CONSTRAINT log_acesso_acao_check
  CHECK (acao IN ('export_csv', 'download_oc_pdf', 'abrir_anexo',
                  'abrir_documento_agendamento', 'copiar_cpf'));

CREATE OR REPLACE FUNCTION registrar_acesso(
  p_acao text, p_recurso text DEFAULT NULL, p_detalhe jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid(); v_headers json; v_ip text; v_ua text;
  v_origem text; v_detalhe jsonb; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;
  IF p_acao NOT IN ('export_csv', 'download_oc_pdf', 'abrir_anexo',
                    'abrir_documento_agendamento', 'copiar_cpf') THEN
    RETURN NULL;  -- entrada invalida nao derruba o fluxo do usuario
  END IF;
  BEGIN v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_ua := left(v_headers ->> 'user-agent', 500);
  END IF;
  v_origem := CASE WHEN is_interno() THEN 'interno' ELSE 'portal' END;
  v_detalhe := p_detalhe;
  IF v_detalhe IS NOT NULL AND length(v_detalhe::text) > 1024 THEN
    v_detalhe := jsonb_build_object('truncado', true);
  END IF;
  INSERT INTO log_acesso (usuario_id, acao, recurso, detalhe, ip, user_agent, origem)
  VALUES (v_user, p_acao, left(p_recurso, 120), v_detalhe, v_ip, v_ua, v_origem)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION registrar_acesso(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_acesso(text, text, jsonb) TO authenticated;

-- ---------- Realtime ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND tablename = 'agendamentos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agendamentos;
  END IF;
END $$;

-- ---------- Seed da grade ----------
-- So para clientes JA marcados com requer_agendamento. Em base limpa nao faz
-- nada — marcar o cliente e decisao da equipe, na tela, onde se escolhe o
-- registro certo por id em vez de adivinhar por texto.
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT c.id, g.h::time, 60, 4
  FROM clientes c
  CROSS JOIN generate_series(timestamp '2000-01-01 08:00', timestamp '2000-01-01 16:00',
                             interval '1 hour') AS g(h)
 WHERE c.requer_agendamento = true
   AND (upper(c.razao_social) LIKE '%TCI%'
     OR upper(c.razao_social) LIKE '%ARCELOR%'
     OR upper(c.razao_social) LIKE '%METALSIDER%')
ON CONFLICT (cliente_id, hora) DO NOTHING;

INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT c.id, g.h, 360, 10
  FROM clientes c
  CROSS JOIN (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
 WHERE c.requer_agendamento = true
   AND (upper(c.razao_social) LIKE '%A. B.%'
     OR upper(c.razao_social) LIKE '%OPERADORA DE TERMINAIS%')
ON CONFLICT (cliente_id, hora) DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- 0051 (+0052/0053) — RLS: helpers avaliados UMA vez por query
-- =====================================================================
-- PRECISA SER O ULTIMO BLOCO QUE TOCA POLICY. Nao e uma lista de policies: e uma
-- varredura sobre `pg_policies`, o estado vivo. Toda policy criada ACIMA e
-- reescrita aqui; toda policy criada ABAIXO ficaria de fora.
--
-- Por que existe: `is_interno()`, `meu_perfil_interno()`, `is_admin_parceiro()`,
-- `get_current_parceiro_id()` e `auth.uid()` chamadas direto no USING/WITH CHECK
-- sao avaliadas POR LINHA candidata, mesmo sendo STABLE. Dentro de um subselect
-- viram InitPlan — uma avaliacao por query. Medido em 2026-07-27: COUNT em
-- log_auditoria (44 mil linhas) caiu de 8,2 s para 142 ms, e perfis_usuarios
-- tinha acumulado 305 milhoes de seq scans numa tabela de 28 linhas.
--
-- Nenhuma condicao de acesso e adicionada, removida ou alterada: `(SELECT f())`
-- devolve o mesmo que `f()`. So a forma de avaliar muda.
--
-- Diferencas em relacao a migration 0051 original, ja incorporando 0052 e 0053:
--   * a tabela `rls_initplan_report` nao entra (era conferencia pos-deploy e a
--     0053 a removeu);
--   * a lista de policies e materializada ANTES do laco. A 0051 varreu o
--     catalogo alterando dentro do mesmo laco, e o cursor preguicoso devolveu
--     cada policy duas vezes (sem dano — a reescrita e determinística — mas
--     inflou a contagem de 79 para 158).
--
-- Idempotente: o lookbehind `(?<!SELECT )` impede re-encapsular o que ja esta
-- encapsulado, entao reexecutar nao gera `(SELECT (SELECT f()))`.

DO $do$
DECLARE
  r            record;
  v_novo_qual  text;
  v_novo_check text;
  v_sql        text;
  -- `\m` = inicio de palavra: evita casar o sufixo de um nome maior.
  c_padrao     text := '(?<!SELECT )\m(is_interno|meu_perfil_interno|is_admin_parceiro|get_current_parceiro_id|auth\.uid)\(\)';
BEGIN
  FOR r IN
    SELECT * FROM (
      SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
       WHERE schemaname = 'public'
       ORDER BY tablename, policyname
    ) s
  LOOP
    v_novo_qual  := regexp_replace(r.qual,       c_padrao, '(SELECT \1())', 'g');
    v_novo_check := regexp_replace(r.with_check, c_padrao, '(SELECT \1())', 'g');

    CONTINUE WHEN v_novo_qual IS NOT DISTINCT FROM r.qual
              AND v_novo_check IS NOT DISTINCT FROM r.with_check;

    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF v_novo_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_novo_qual);
    END IF;
    IF v_novo_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_novo_check);
    END IF;

    EXECUTE v_sql;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- 0055 — Minimizacao LGPD: colunas de dado pessoal sem uso
-- =====================================================================
-- Nove colunas com dado pessoal que nenhum formulario, tela, relatorio, PDF,
-- exportacao ou policy usava (auditoria LGPD de 09/08/2026). Contagem no
-- remoto antes do drop: so `motoristas.rg`/`.antt` tinham 1 linha preenchida,
-- e era o motorista ficticio do seed 0002 — nenhum dado real foi perdido.
--
-- Este bloco fica DEPOIS dos CREATE TABLE que ainda declaram essas colunas, e
-- os dois caminhos convergem: em banco novo o CREATE cria e este DROP remove;
-- em banco vivo o CREATE IF NOT EXISTS e no-op e o DROP IF EXISTS tambem, se
-- ja tiver rodado. Nao toca em policy, entao pode ficar depois da varredura da
-- 0051 sem reintroduzir a regressao de InitPlan.

ALTER TABLE motoristas
  DROP COLUMN IF EXISTS rg,
  DROP COLUMN IF EXISTS antt,
  DROP COLUMN IF EXISTS subcontratada_id;

ALTER TABLE parceiro_motoristas
  DROP COLUMN IF EXISTS rg,
  DROP COLUMN IF EXISTS antt;

ALTER TABLE subcontratadas
  DROP COLUMN IF EXISTS contato_nome,
  DROP COLUMN IF EXISTS contato_telefone;

ALTER TABLE parceiro_subcontratadas
  DROP COLUMN IF EXISTS contato_nome,
  DROP COLUMN IF EXISTS contato_telefone;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- 0063 + 0066 + 0067 — Terminais: TCI, A.B/CSN e MRS Sao Bento (+ regra do TCI)
-- =====================================================================
-- Configuracao operacional, nao schema: marca os dois primeiros clientes que
-- exigem agendamento e cria a grade de cada um. Por ID — a conferencia no
-- remoto mostrou que a A.B esta gravada como 'A.B OPERADORA DE TERMINAIS' (sem
-- espaco depois do 'A.'), que o LIKE '%A. B.%' da 0061 nao alcanca.
--
-- ArcelorMittal (cb4d3528-...) e Metalsider (fc9eba1a-...) seguem desligados;
-- ligar cada um e um toggle na tela de Clientes.
--
-- Nao destrutivo: `terminal_nome` so e preenchido se estiver vazio, e as
-- janelas usam ON CONFLICT DO NOTHING — replay nao desfaz ajuste da equipe.

UPDATE clientes
   SET requer_agendamento = true,
       terminal_nome = COALESCE(NULLIF(btrim(terminal_nome), ''), 'TCI Itutinga')
 WHERE id = '99dbb554-5340-4b78-9e36-6eb7228d0835';

UPDATE clientes
   SET requer_agendamento = true,
       terminal_nome = COALESCE(NULLIF(btrim(terminal_nome), ''), 'A.B / CSN Pindamonhangaba')
 WHERE id = '652eb27d-c040-470a-8a96-314ae7011b59';

INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT '99dbb554-5340-4b78-9e36-6eb7228d0835', g.h::time, 60, 4
  FROM generate_series(timestamp '2000-01-01 08:00',
                       timestamp '2000-01-01 16:00',
                       interval '1 hour') AS g(h)
ON CONFLICT (cliente_id, hora) DO NOTHING;

INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT '652eb27d-c040-470a-8a96-314ae7011b59', g.h, 360, 10
  FROM (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
ON CONFLICT (cliente_id, hora) DO NOTHING;

-- ---------- 0066 — MRS Estacao Sao Bento (Mogi das Cruzes) ----------
-- Primeiro terminal a mostrar que "segue o padrao do TCI" era o FORMATO (slots
-- discretos), nao os numeros: 07:00-17:30 em janelas de 30 min com 3 vagas, o
-- que da 66/dia contra 36 do TCI e 30 da A.B. Janela de meia hora rende o dobro
-- de slots — a diferenca e real, nao erro de cadastro.
--
-- Ultimo slot em 17:30 porque "das 7 as 18" foi lido como horario de
-- funcionamento: a ultima janela inteira termina 18:00.
UPDATE clientes
   SET requer_agendamento = true,
       terminal_nome = COALESCE(NULLIF(btrim(terminal_nome), ''),
                                'MRS São Bento — Mogi das Cruzes')
 WHERE id = '0281905e-646a-431f-abf1-80d7d7e757e1';

INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT '0281905e-646a-431f-abf1-80d7d7e757e1', g.h::time, 30, 3
  FROM generate_series(timestamp '2000-01-01 07:00',
                       timestamp '2000-01-01 17:30',
                       interval '30 minutes') AS g(h)
ON CONFLICT (cliente_id, hora) DO NOTHING;

-- ---------- 0067 — Regra do TCI: exige telefone do motorista ----------
-- `observacoes_agendamento` e o que o painel mostra como "Regra do terminal",
-- e e onde exigencia especifica de um terminal vive — em vez de virar coluna
-- nova a cada pedido. Acrescenta em linha nova se a equipe ja escreveu algo, e
-- nao mexe se telefone ja estiver mencionado (reexecutar nao duplica).
UPDATE clientes
   SET observacoes_agendamento = CASE
         WHEN observacoes_agendamento IS NULL OR btrim(observacoes_agendamento) = ''
           THEN 'Exige o telefone do motorista no agendamento.'
         WHEN observacoes_agendamento ILIKE '%telefone%'
           THEN observacoes_agendamento
         ELSE btrim(observacoes_agendamento) || E'\nExige o telefone do motorista no agendamento.'
       END
 WHERE id = '99dbb554-5340-4b78-9e36-6eb7228d0835';

-- Aviso, nao erro: a equipe vai ajustar capacidade quando confirmar os numeros
-- com cada terminal, e este arquivo roda em UMA transacao — abortar por
-- divergencia legitima derrubaria o replay inteiro.
DO $$
DECLARE
  v_tci integer;
  v_ab  integer;
BEGIN
  SELECT COALESCE(sum(capacidade), 0) INTO v_tci FROM terminal_janelas
   WHERE cliente_id = '99dbb554-5340-4b78-9e36-6eb7228d0835' AND ativo;
  SELECT COALESCE(sum(capacidade), 0) INTO v_ab  FROM terminal_janelas
   WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59' AND ativo;
  IF v_tci <> 36 OR v_ab <> 30 THEN
    RAISE WARNING 'Grade fora do padrao da SPEC: TCI=% (padrao 36), A.B=% (padrao 30).', v_tci, v_ab;
  END IF;
END $$;

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
