-- =============================================
-- SisLog LHG — Seed inicial (SPEC.md seção 5.10/5.11)
-- =============================================

-- ---------- 9 Materiais (exatos da seção 5.11) ----------
INSERT INTO materiais (nome, cnpj_filial, filial, origem_padrao, destino_padrao, observacoes_padrao)
VALUES
  ('MINÉRIO',       '50.438.766/0003-92', 'MIRANDA - MS',          NULL,                NULL,
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('PEDRA',         '50.438.766/0003-92', 'MIRANDA - MS',          'TERENOS - MS',      'CORUMBÁ - MS',
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('AREIA',         '50.438.766/0003-92', 'MIRANDA - MS',          'TRÊS LAGOAS - MS',  'CAMPO GRANDE - MS',
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('SORGO',         '50.438.766/0003-92', 'MIRANDA - MS',          'BONITO - MS',       'CORUMBÁ - MS',
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('CASCA DE SOJA', '50.438.766/0003-92', 'MIRANDA - MS',          'DOURADOS - MS',     'CORUMBÁ - MS',
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('CALCÁRIO',      '50.438.766/0003-92', 'MIRANDA - MS',          'MIRANDA - MS',      NULL,
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('COQUE',         '50.438.766/0004-73', 'BELO HORIZONTE - MG',   'UBERABA - MG',      'JATEI - MS',
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('GESSO',         '50.438.766/0004-73', 'BELO HORIZONTE - MG',   'UBERABA - MG',      'JATEI - MS',
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.'),
  ('SUCATA',        '50.438.766/0004-73', 'BELO HORIZONTE - MG',   NULL,                NULL,
   '1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas.')
ON CONFLICT (nome) DO NOTHING;

-- ---------- 3 Subcontratadas ----------
INSERT INTO subcontratadas (razao_social, cnpj, contato_nome, contato_telefone) VALUES
  ('Transportes Pantanal Ltda',     '12.345.678/0001-90', 'Carlos Mendes',   '(67) 99812-3456'),
  ('Logística Bonito S/A',          '23.456.789/0001-12', 'Marina Souza',    '(67) 99765-1122'),
  ('Cargo Express Transportes ME',  '34.567.890/0001-34', 'Roberto Lima',    '(67) 99654-7788')
ON CONFLICT (cnpj) DO NOTHING;

-- ---------- 5 Clientes ----------
INSERT INTO clientes (razao_social, cnpj, endereco, cidade, uf, latitude, longitude) VALUES
  ('Mineração Vale do Aço S/A',    '11.222.333/0001-44', 'Av. Industrial, 1500',   'CORUMBÁ',       'MS', -19.0090, -57.6533),
  ('Agropecuária Cerrado Ltda',    '22.333.444/0001-55', 'Rod. BR-262 km 410',     'CAMPO GRANDE',  'MS', -20.4697, -54.6201),
  ('Usina Sucroenergia Bonito',    '33.444.555/0001-66', 'Estrada da Usina, s/n',  'BONITO',        'MS', -21.1313, -56.4881),
  ('Frigorífico Pantanal',         '44.555.666/0001-77', 'BR-262 km 350',          'TERENOS',       'MS', -20.4377, -54.8612),
  ('Indústria Metalúrgica MG',     '55.666.777/0001-88', 'Av. Aço, 2000',          'JATEI',         'MS', -22.4767, -54.3084)
ON CONFLICT DO NOTHING;

-- ---------- 5 Motoristas ----------
INSERT INTO motoristas (nome_completo, cpf, rg, antt, telefone, subcontratada_id)
SELECT * FROM (
  VALUES
    ('João Pereira da Silva', '111.444.777-35', '12.345.678', 'ANTT-1234567', '(67) 99811-2233', (SELECT id FROM subcontratadas WHERE cnpj = '12.345.678/0001-90')),
    ('Antônio Carlos Rocha',  '222.555.888-46', '23.456.789', 'ANTT-2345678', '(67) 99822-3344', (SELECT id FROM subcontratadas WHERE cnpj = '23.456.789/0001-12')),
    ('Pedro Henrique Lima',   '333.666.999-57', '34.567.890', 'ANTT-3456789', '(67) 99833-4455', (SELECT id FROM subcontratadas WHERE cnpj = '34.567.890/0001-34')),
    ('Marcos Vinícius Souza', '444.777.111-68', '45.678.901', 'ANTT-4567890', '(67) 99844-5566', (SELECT id FROM subcontratadas WHERE cnpj = '12.345.678/0001-90')),
    ('Lucas Ferreira Santos', '555.888.222-79', '56.789.012', 'ANTT-5678901', '(67) 99855-6677', (SELECT id FROM subcontratadas WHERE cnpj = '23.456.789/0001-12'))
) AS t(nome_completo, cpf, rg, antt, telefone, subcontratada_id)
ON CONFLICT (cpf) DO NOTHING;

-- ---------- 4 Veículos ----------
INSERT INTO veiculos (placa, tipo, subcontratada_id)
SELECT * FROM (
  VALUES
    ('ABC1D23', 'Cavalo 6x2', (SELECT id FROM subcontratadas WHERE cnpj = '12.345.678/0001-90')),
    ('DEF2E34', 'Cavalo 6x4', (SELECT id FROM subcontratadas WHERE cnpj = '23.456.789/0001-12')),
    ('GHI3F45', 'Truck',      (SELECT id FROM subcontratadas WHERE cnpj = '34.567.890/0001-34')),
    ('JKL4G56', 'Toco',       (SELECT id FROM subcontratadas WHERE cnpj = '12.345.678/0001-90'))
) AS t(placa, tipo, subcontratada_id)
ON CONFLICT (placa) DO NOTHING;

-- ---------- 4 Carretas ----------
INSERT INTO carretas (placa, tipo, capacidade_ton) VALUES
  ('MNO5H67', 'Basculante', 30.0),
  ('PQR6I78', 'Graneleira', 32.0),
  ('STU7J89', 'Caçamba',    28.0),
  ('VWX8K90', 'Prancha',    25.0)
ON CONFLICT (placa) DO NOTHING;
