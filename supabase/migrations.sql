-- =============================================
-- OC Express - Supabase Schema
-- =============================================

-- Subcontratadas (transportadoras — PF ou PJ)
CREATE TABLE IF NOT EXISTS subcontratadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    documento TEXT UNIQUE,          -- CPF (PF) ou CNPJ (PJ)
    tipo_pessoa TEXT CHECK (tipo_pessoa IN ('PF', 'PJ')),
    telefone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Motoristas
CREATE TABLE IF NOT EXISTS motoristas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    cnh TEXT,
    telefone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Veículos (cavalos e carretas)
CREATE TABLE IF NOT EXISTS veiculos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placa TEXT UNIQUE NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('cavalo', 'carreta')),
    modelo TEXT,
    proprietario TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ordens de Carregamento
CREATE TABLE IF NOT EXISTS ordens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero INTEGER UNIQUE NOT NULL,
    filial TEXT NOT NULL,
    subcontratada_id UUID REFERENCES subcontratadas(id),
    motorista_id UUID REFERENCES motoristas(id),
    cavalo_placa TEXT NOT NULL,
    ultima_carreta TEXT,
    carregamento TEXT NOT NULL,
    destino TEXT NOT NULL,
    instrucao TEXT,
    descarga TEXT,
    material TEXT NOT NULL,
    autorizado_por TEXT NOT NULL DEFAULT 'DAVI ASAF SILVA',
    validade_inicio DATE NOT NULL,
    validade_fim DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies (opcional - descomente se quiser segurança por row)
-- ALTER TABLE subcontratadas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE motoristas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ordens ENABLE ROW LEVEL SECURITY;

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_ordens_numero ON ordens(numero);
CREATE INDEX IF NOT EXISTS idx_ordens_motorista ON ordens(motorista_id);
CREATE INDEX IF NOT EXISTS idx_motoristas_cpf ON motoristas(cpf);
CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa);
