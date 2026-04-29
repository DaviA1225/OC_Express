-- =============================================
-- SisLog LHG — Schema completo (SPEC.md seção 5)
-- =============================================
-- Atenção: as tabelas legadas (subcontratadas, motoristas, veiculos, ordens)
-- do backend FastAPI antigo serão substituídas pelas versões do SPEC.

DROP TABLE IF EXISTS ordens CASCADE;
DROP TABLE IF EXISTS subcontratadas CASCADE;
DROP TABLE IF EXISTS motoristas CASCADE;
DROP TABLE IF EXISTS veiculos CASCADE;

-- ---------- Trigger genérico updated_at ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- 5.1 perfis_usuarios ----------
CREATE TABLE perfis_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  perfil text NOT NULL CHECK (perfil IN ('admin', 'supervisor', 'atendente', 'documentacao')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE TRIGGER trg_perfis_usuarios_updated BEFORE UPDATE ON perfis_usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.2 subcontratadas ----------
CREATE TABLE subcontratadas (
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
CREATE TRIGGER trg_subcontratadas_updated BEFORE UPDATE ON subcontratadas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.3 motoristas ----------
CREATE TABLE motoristas (
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
CREATE INDEX idx_motoristas_cpf ON motoristas(cpf);
CREATE INDEX idx_motoristas_subcontratada ON motoristas(subcontratada_id);
CREATE TRIGGER trg_motoristas_updated BEFORE UPDATE ON motoristas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.4 veiculos ----------
CREATE TABLE veiculos (
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
CREATE INDEX idx_veiculos_placa ON veiculos(placa);
CREATE TRIGGER trg_veiculos_updated BEFORE UPDATE ON veiculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.5 carretas ----------
CREATE TABLE carretas (
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
CREATE INDEX idx_carretas_placa ON carretas(placa);
CREATE TRIGGER trg_carretas_updated BEFORE UPDATE ON carretas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.6 clientes ----------
CREATE TABLE clientes (
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
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.7 materiais ----------
CREATE TABLE materiais (
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
CREATE TRIGGER trg_materiais_updated BEFORE UPDATE ON materiais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.8 solicitacoes ----------
CREATE TABLE solicitacoes (
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
  pamcard boolean NOT NULL DEFAULT false,
  documentado_por uuid REFERENCES auth.users(id),
  documentado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_solicitacoes_status ON solicitacoes(status);
CREATE INDEX idx_solicitacoes_tipo ON solicitacoes(tipo);
CREATE INDEX idx_solicitacoes_atendente ON solicitacoes(atendente_id);
CREATE INDEX idx_solicitacoes_created_at ON solicitacoes(created_at DESC);
CREATE TRIGGER trg_solicitacoes_updated BEFORE UPDATE ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5.9 log_auditoria ----------
CREATE TABLE log_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES auth.users(id),
  acao text NOT NULL,
  tabela text NOT NULL,
  registro_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_log_auditoria_tabela ON log_auditoria(tabela);
CREATE INDEX idx_log_auditoria_usuario ON log_auditoria(usuario_id);
CREATE INDEX idx_log_auditoria_created_at ON log_auditoria(created_at DESC);

-- ---------- Trigger de auditoria ----------
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

CREATE TRIGGER aud_solicitacoes   AFTER INSERT OR UPDATE OR DELETE ON solicitacoes   FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER aud_motoristas     AFTER INSERT OR UPDATE OR DELETE ON motoristas     FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER aud_veiculos       AFTER INSERT OR UPDATE OR DELETE ON veiculos       FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER aud_carretas       AFTER INSERT OR UPDATE OR DELETE ON carretas       FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER aud_clientes       AFTER INSERT OR UPDATE OR DELETE ON clientes       FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER aud_materiais      AFTER INSERT OR UPDATE OR DELETE ON materiais      FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER aud_subcontratadas AFTER INSERT OR UPDATE OR DELETE ON subcontratadas FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ---------- RLS ----------
-- Política inicial conforme SPEC seção 5.10: usuários autenticados podem ler/escrever tudo.
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontratadas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE motoristas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE carretas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiais       ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_auditoria   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'perfis_usuarios','subcontratadas','motoristas','veiculos','carretas',
    'clientes','materiais','solicitacoes','log_auditoria'
  ]) LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true)', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (true)', t || '_delete', t);
  END LOOP;
END $$;

-- ---------- Storage bucket ocs-pdf ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ocs-pdf', 'ocs-pdf', true)
ON CONFLICT (id) DO NOTHING;

-- Política do bucket: authenticated pode tudo
CREATE POLICY "ocs_pdf_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ocs-pdf');
CREATE POLICY "ocs_pdf_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ocs-pdf');
CREATE POLICY "ocs_pdf_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'ocs-pdf');
CREATE POLICY "ocs_pdf_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ocs-pdf');
