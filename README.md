# OC Express — API de Ordens de Carregamento

Backend FastAPI que replica o formulário Excel **OC Modelo1.xlsx** e gera PDFs idênticos ao modelo.

## Estrutura

```
OC_Express/
├── app/
│   ├── main.py              # App FastAPI
│   ├── database.py          # Cliente Supabase
│   ├── models.py            # Schemas Pydantic
│   ├── pdf_generator.py     # Geração de PDF (ReportLab)
│   └── routers/
│       ├── motoristas.py
│       ├── veiculos.py
│       ├── subcontratadas.py
│       └── ordens.py
├── supabase/
│   └── migrations.sql       # SQL para criar as tabelas
├── .env                     # Credenciais (não commitar)
├── requirements.txt
└── run.bat
```

## Setup

### 1. Ambiente virtual

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

### 2. Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. No SQL Editor, execute o conteúdo de `supabase/migrations.sql`
3. Copie a **Project URL** e a **anon key** (Settings → API)

### 3. Variáveis de ambiente

Edite o arquivo `.env`:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_KEY=sua-anon-key
SUPABASE_SERVICE_KEY=sua-service-role-key
```

### 4. Iniciar servidor

```bash
run.bat
# ou
.venv\Scripts\uvicorn app.main:app --reload
```

Acesse: `http://localhost:8000/docs`

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/motoristas/` | Listar motoristas |
| POST | `/motoristas/` | Criar motorista |
| GET | `/veiculos/` | Listar veículos (cavalo/carreta) |
| POST | `/veiculos/` | Criar veículo |
| GET | `/subcontratadas/` | Listar subcontratadas |
| POST | `/subcontratadas/` | Criar subcontratada |
| GET | `/ordens/` | Listar ordens |
| POST | `/ordens/` | Criar ordem |
| **POST** | **`/ordens/pdf/preview`** | **Gerar PDF direto (sem salvar)** |
| **GET** | **`/ordens/{id}/pdf`** | **Gerar PDF de OC salva** |

## Gerar PDF — exemplo

```bash
curl -X POST http://localhost:8000/ordens/pdf/preview \
  -H "Content-Type: application/json" \
  -d '{
    "numero": 3007,
    "filial": "MIRANDA - MS",
    "subcontratada": "TRANSPORTES SILVA LTDA",
    "motorista": "JOÃO DA SILVA PEREIRA",
    "cavalo_placa": "ABC-1234",
    "ultima_carreta": "DEF-5678",
    "carregamento": "MINA DO URUCUM",
    "destino": "PORTO DE LADÁRIO",
    "instrucao": "Seguir pela MS-228",
    "descarga": "TERMINAL GRANELEIRO",
    "material": "MINÉRIO DE FERRO",
    "autorizado_por": "DAVI ASAF SILVA",
    "validade_inicio": "2026-03-04",
    "validade_fim": "2026-03-05"
  }' --output OC_3007.pdf
```
