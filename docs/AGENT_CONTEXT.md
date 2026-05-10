# SisLog / OC Express — Contexto para Agente de IA (perfil **assistente**)

> Documento de referência para um agente de IA que integra WhatsApp ao sistema, atuando com as permissões do perfil **assistente**.

---

## 1. Resumo do sistema

**Empresa:** OC Express Transportes — transportadora contratada da mineradora **Vale (Vale do Rio Doce)**.

**Operação:** equipe de 10–15 atendentes processa solicitações de Ordem de Carregamento (OC) que chegam por WhatsApp, mantém cadastros compartilhados e gera PDFs operacionais que são reenviados ao motorista/cliente. O sistema é **paralelo ao ERP corporativo (Protheus)** — a ligação é manual, via "número de instrução".

**Tipos de carga:**
- **Carregamento (minério)** — sai da mineradora, vai pro destinatário
- **Retorno** — sai do cliente de retorno, volta pro pátio

**Stack:**
- Frontend: React 19 + Vite + TS + Tailwind + shadcn/ui + react-hook-form + zod + react-router v7 + @tanstack/react-query + @react-pdf/renderer + sonner + date-fns + recharts
- Banco: **Supabase Postgres** (RLS habilitado em todas as tabelas; políticas permissivas para `authenticated`)
- Storage: bucket público `ocs-pdf` (PDFs das OCs)
- Auth: Supabase Auth (email + senha)
- Realtime: publication `supabase_realtime` em `solicitacoes` e `cargas_retorno`

**Repositório:** `https://github.com/DaviA1225/OC_Express`

---

## 2. Hierarquia de perfis

5 níveis: `admin` > `gerente` > `supervisor` > `analista` > `assistente`

**O que o perfil `assistente` (perfil do agente) PODE fazer:**

| Ação | Permitido? |
|---|:-:|
| Ver Dashboard | ✅ |
| Ver e **criar/editar/transit/gerar PDF** de Solicitações | ✅ |
| Exportar CSV de Solicitações | ✅ |
| Cadastrar/editar Motoristas, Veículos, Carretas, Subcontratadas | ✅ |
| Ver Clientes, Materiais, Cargas de Retorno | ✅ |
| **Editar** Clientes / Materiais / Cargas de Retorno | ❌ |
| Ver Auditoria, Relatórios, Usuários | ❌ |
| **Bulk actions** (qualquer página) | ❌ |

> Em SQL/RLS isso não é diferenciado — RLS atual permite `INSERT/UPDATE/DELETE` para todo `authenticated`. Quem aplica a regra do perfil é o frontend. **Para o agente, os predicados em `frontend/src/features/auth/permissions.ts` são a fonte de verdade.**

---

## 3. Esquema do banco

Todas as tabelas têm `id uuid PK`, `created_at timestamptz`, `updated_at timestamptz` (auto), `created_by uuid REFERENCES auth.users(id)` e `ativo boolean` (exceto `solicitacoes` e `log_auditoria`). Triggers de auditoria gravam `INSERT/UPDATE/DELETE` em `log_auditoria` com `dados_antes`/`dados_depois` em JSONB.

### 3.1 `perfis_usuarios`
Link 1:1 com `auth.users`. **Sem isso, o usuário não tem perfil e não passa pelo `ProtectedRoute` do frontend.**

```
id uuid PK
user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE
nome_completo text
perfil text CHECK IN ('admin','gerente','supervisor','analista','assistente')
ativo boolean DEFAULT true
```

### 3.2 `subcontratadas`
Transportadoras (PJ) ou autônomos (PF) que efetivamente movimentam a carga.
```
razao_social text
documento text       -- CPF (PF) ou CNPJ (PJ), formato livre
tipo_pessoa text     -- 'PF' | 'PJ'
contato_nome text
contato_telefone text
```

### 3.3 `motoristas`
**Motorista é independente** — não pertence a uma subcontratada. Só nome + CPF + telefone.
```
nome_completo text
cpf text UNIQUE
telefone text         -- formato livre, normalizar para WhatsApp via DDI 55
rg text, antt text, observacoes text  -- todos opcionais
subcontratada_id uuid  -- legado, geralmente NULL
```

### 3.4 `veiculos` (cavalos mecânicos)
```
placa text UNIQUE
tipo text  -- ex: 'Cavalo Trucado 3 Eixos', 'Cavalo Trucado 4 Eixos'
subcontratada_id uuid  -- IMPORTANTE: ao escolher veículo, a subcontratada é inferida daqui
```

### 3.5 `carretas` (semi-reboques)
```
placa text UNIQUE
tipo text  -- 'Caçamba 3 Eixos', 'Caçamba 4 Eixos', 'Bi-Trem Caçamba',
           -- 'Rodo-Trem Caçamba', 'Graneleiro LS 3 Eixos', 'Graneleiro LS 4 Eixos',
           -- 'Bi-Trem Graneleiro', 'Rodo-Trem Graneleiro'
capacidade_ton numeric
subcontratada_id uuid
```

### 3.6 `clientes`
Tem **dois sub-tipos via flags booleanas**, podendo ser ambos:
```
razao_social text
cnpj text, endereco text, cidade text, uf text
latitude numeric, longitude numeric

frete_cacamba numeric    -- R$/ton para caçamba
frete_graneleiro numeric -- R$/ton para graneleiro
liberado boolean         -- false bloqueia recebimento
aceita_cacamba boolean
aceita_graneleiro boolean

cliente_minerio boolean DEFAULT true   -- destinatário de carga de minério
cliente_retorno boolean DEFAULT false  -- origem de carga de retorno
```

### 3.7 `materiais`
```
nome text UNIQUE       -- 'MINÉRIO', 'PEDRA', 'AREIA' etc.
cnpj_filial text       -- CNPJ que aparece no PDF
filial text            -- nome da filial que aparece no PDF
origem_padrao text     -- pré-preenche local_carregamento
destino_padrao text
observacoes_padrao text -- bloco de instruções no PDF
```

### 3.8 `solicitacoes` — **fato principal**
```
numero_interno serial UNIQUE  -- contador automático, exibido como "#0042"
tipo text CHECK IN ('carregamento','retorno')
status text CHECK IN (
  'recebida','em_cadastro','instrucao_emitida',
  'oc_gerada','oc_enviada','finalizada','cancelada'
) DEFAULT 'recebida'

solicitante_nome text
solicitante_telefone text   -- quem mandou a mensagem no WhatsApp

motorista_id uuid REFERENCES motoristas
veiculo_id uuid REFERENCES veiculos
carreta_id uuid REFERENCES carretas
subcontratada_id uuid REFERENCES subcontratadas
cliente_id uuid REFERENCES clientes
material_id uuid REFERENCES materiais
material_subtipo text  -- 'SINTER' | 'HEMATITA' | 'LUMP' (apenas minério)

local_carregamento text  -- ex: 'TUPACERY', 'URUCUM' (vem do material ou da carga_retorno)
validade_inicio date, validade_fim date
numero_instrucao text    -- número do Protheus que liga ao ERP
observacoes text

atendente_id uuid REFERENCES auth.users  -- quem criou
pdf_url text             -- URL pública do PDF no Storage
enviada_em timestamptz   -- quando foi marcada como oc_enviada
finalizada_em timestamptz

cte_emitido boolean, mdfe_emitido boolean,
vale_pedagio boolean, pamcard boolean
documentado_por uuid, documentado_em timestamptz
```

### 3.9 `cargas_retorno`
Pares (cliente, local) pré-cadastrados que abastecem solicitações tipo `retorno`.
```
cliente_id uuid REFERENCES clientes  -- precisa ter cliente_retorno=true
local_carregamento text NOT NULL
observacoes text
ativo boolean DEFAULT true
```

### 3.10 `log_auditoria`
Preenchida automaticamente por trigger `audit_trigger()` em todas as tabelas operacionais.
```
usuario_id uuid REFERENCES auth.users
acao text   -- 'INSERT' | 'UPDATE' | 'DELETE'
tabela text
registro_id uuid
dados_antes jsonb
dados_depois jsonb
created_at timestamptz
```

### 3.11 Storage
- **Bucket** `ocs-pdf` (público) — PDFs das OCs
- Padrão de nome: `OC_<numero_interno_pad4>_<AAAAMMDD>.pdf`

### 3.12 Realtime
Tabelas com publication ativa: `solicitacoes`, `cargas_retorno`.

---

## 4. Ciclo de vida da Solicitação

```
recebida ──▶ em_cadastro ──▶ instrucao_emitida ──▶ oc_gerada ──▶ oc_enviada ──▶ finalizada
   │             │                  │                  │              │
   └─────────────┴──────────────────┴──────────────────┴──────────────┴──▶ cancelada
```

**Transições e efeitos colaterais:**

| De → Para | Quem dispara | Efeito |
|---|---|---|
| `recebida` → `em_cadastro` | atendente click "Marcar em emissão" | só atualiza status |
| `em_cadastro` → `instrucao_emitida` | atendente preenche número Protheus | grava `numero_instrucao` |
| `instrucao_emitida` → `oc_gerada` | atendente click "Gerar OC" | render PDF, upload pro Storage, salva `pdf_url` |
| `oc_gerada` → `oc_enviada` | usuário abre WhatsApp pelo dialog | grava `enviada_em = now()` |
| `oc_enviada` → `finalizada` | atendente click "Finalizar" | grava `finalizada_em = now()` |
| Qualquer → `cancelada` | atendente click "Cancelar" | terminal |

---

## 5. Layout do PDF da OC

Renderizado em `frontend/src/features/pdf-generator/OCDocument.tsx` via `@react-pdf/renderer`. Recebe um objeto `OCData` com:

- `numero` (string padded 4 dig: "0042")
- `empresa` ('OC EXPRESS TRANSPORTES'), `cnpj_filial`, `filial` (vêm do material)
- `subcontratada`, `motorista` (formato "Nome — CPF xxx"), `cavalo_placa`, `ultima_carreta`
- `carregamento`, `destino` (cidade/UF do cliente), `instrucao`, `descarga` (razão social do cliente)
- `material` (nome ou subtipo se minério), `observacoes_padrao` (bloco do material)
- `autorizado_por` (nome do atendente), `validade_inicio`, `validade_fim` (Date)
- `logoUrl` (data URL embutida no bundle, `frontend/src/features/pdf-generator/logo.ts`)

---

## 6. O que o agente precisa fazer (operações típicas)

Todas as operações pelo SDK do Supabase (`@supabase/supabase-js`) ou REST `PostgREST`. Use a **service-role key** se rodar server-side **OU** crie um usuário dedicado e logue como `assistente` (recomendado para auditoria correta — `created_by` e `usuario_id` em `log_auditoria` ficam corretos).

### 6.1 Setup do usuário do agente

```sql
-- Cria conta no Supabase Auth (via dashboard ou API admin)
-- Depois insere o perfil:
INSERT INTO perfis_usuarios (user_id, nome_completo, perfil, ativo)
VALUES ('<uuid-do-auth-user>', 'Agente IA WhatsApp', 'assistente', true);
```

### 6.2 Receber mensagem do WhatsApp → criar solicitação

```ts
// 1. Identifica solicitante pelo telefone (e-164 sem '+', ex: '5567999991234')
const solicitanteTelefone = '(67) 99999-1234'  // formato livre, normalize antes

// 2. (opcional) tenta resolver motorista, veículo, etc. via NLU sobre a mensagem

// 3. Insere solicitação
const { data, error } = await supabase
  .from('solicitacoes')
  .insert({
    tipo: 'carregamento',          // ou 'retorno'
    status: 'recebida',
    solicitante_nome: 'João',
    solicitante_telefone: solicitanteTelefone,
    observacoes: '<texto original do WhatsApp>',
    // motorista_id, veiculo_id, carreta_id, cliente_id, material_id: opcionais nesse momento
  })
  .select()
  .single()
```

### 6.3 Buscar dados de cadastro (para resolver IDs a partir de texto)

```ts
// Motorista por nome ou CPF
await supabase.from('motoristas')
  .select('id, nome_completo, cpf')
  .or('nome_completo.ilike.%João%,cpf.ilike.%123%')
  .eq('ativo', true)
  .limit(5)

// Veículo por placa (sempre upper, sem hífen — formato MERCOSUL ou padrão)
await supabase.from('veiculos')
  .select('id, placa, tipo, subcontratada_id')
  .ilike('placa', '%ABC1234%').eq('ativo', true)

// Cliente de minério (destinatário)
await supabase.from('clientes')
  .select('id, razao_social, cidade, uf, liberado')
  .eq('cliente_minerio', true).eq('ativo', true)
  .ilike('razao_social', '%vale%')

// Cargas de retorno disponíveis
await supabase.from('cargas_retorno')
  .select('id, local_carregamento, cliente:cliente_id(razao_social, cidade, uf)')
  .eq('ativo', true)
```

### 6.4 Avançar status
```ts
await supabase.from('solicitacoes')
  .update({ status: 'em_cadastro' })
  .eq('id', solicitacaoId)

// Ao gerar PDF (server-side):
await supabase.from('solicitacoes')
  .update({ status: 'oc_gerada', pdf_url: '<url>' })
  .eq('id', solicitacaoId)

// Após enviar pelo WhatsApp:
await supabase.from('solicitacoes')
  .update({ status: 'oc_enviada', enviada_em: new Date().toISOString() })
  .eq('id', solicitacaoId)
```

### 6.5 Cadastrar entidade nova (motorista, veículo, carreta, subcontratada)

```ts
await supabase.from('motoristas').insert({
  nome_completo: 'José da Silva',
  cpf: '123.456.789-00',
  telefone: '(67) 99999-1234',
})
```

### 6.6 Gerar e enviar PDF

O PDF é renderizado pelo `@react-pdf/renderer` no client. Para servidor, opções:
1. **Reusar o backend Python legado** (`app/pdf_generator.py` usa ReportLab) — endpoint `POST /ordens/pdf/preview`
2. Rodar `@react-pdf/renderer` em Node (`renderToStream` em `node`)
3. Usar uma função Edge (Supabase Edge Functions) com `puppeteer` ou similar

Após gerar:
```ts
const { error } = await supabase.storage
  .from('ocs-pdf')
  .upload(`OC_${pad4(numero)}_${yyyymmdd()}.pdf`, pdfBlob, {
    contentType: 'application/pdf', upsert: true,
  })
const { data: pub } = supabase.storage.from('ocs-pdf').getPublicUrl(filename)
const pdfUrl = pub.publicUrl
```

### 6.7 Mensagem padrão de OC para WhatsApp

Já definida em `frontend/src/features/whatsapp/whatsapp.ts:formatOCWhatsAppMessage`. Reuse a mesma estrutura:

```
*ORDEM DE CARREGAMENTO #0042*

Motorista: João Silva — CPF 123.456.789-00
Cavalo: ABC-1234
Carreta: XYZ-5678
Empresa: Transportadora X

Carregamento: TUPACERY
Destino: VALE — Corumbá/MS
Material: MINÉRIO — HEMATITA
Instrução: 12345

Validade: 05/05/2026 a 06/05/2026

PDF: https://...
```

---

## 7. Constraints e validações importantes

- **CPF/CNPJ**: validação real em `frontend/src/lib/validators.ts` (`isValidCpf`, `isValidCnpj`, `isValidDocumento`).
- **Placa**: padrão antigo `ABC1234` ou MERCOSUL `ABC1D23` — sempre uppercase.
- **Subcontratada inferida do veículo**: ao escolher um veículo, o frontend auto-preenche `subcontratada_id` com o `subcontratada_id` do veículo. Replicar isso no agente.
- **Material minério exige subtipo**: se `material.nome` casa com regex `/MIN[ÉE]RIO/i`, é obrigatório `material_subtipo ∈ {SINTER, HEMATITA, LUMP}`.
- **Cliente de retorno NÃO pode ser usado em solicitação de carregamento** (frontend filtra). Para retorno, geralmente o cliente vem da `cargas_retorno`.
- **`enviada_em` e `finalizada_em`**: timestamptz; o frontend grava `now()` quando transita.

---

## 8. RLS (Row-Level Security)

Hoje todas as políticas são **permissivas para `authenticated`**:

```sql
CREATE POLICY <tabela>_select ON <tabela> FOR SELECT TO authenticated USING (true);
CREATE POLICY <tabela>_insert ON <tabela> FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY <tabela>_update ON <tabela> FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY <tabela>_delete ON <tabela> FOR DELETE TO authenticated USING (true);
```

Ou seja: **qualquer usuário logado pode tudo no banco**. A diferenciação de perfil é apenas no UI. Se o agente entrar como `assistente`, tecnicamente conseguiria fazer mais que o UI permite — **a responsabilidade de aplicar a regra é dele**.

Caso queira reforçar via RLS no futuro, dá pra criar políticas que checam `(SELECT perfil FROM perfis_usuarios WHERE user_id = auth.uid())`.

---

## 9. Migrations aplicadas (referência)

```
0001_initial_schema.sql        — schema base + RLS + bucket ocs-pdf
0002_seed.sql                  — dados de teste
0003_carretas_subcontratada.sql
0004_clientes_frete_liberado.sql
0005_clientes_tipos_carreta.sql
0006_clientes_frete_por_tipo.sql
0007_subcontratadas_documento.sql
0008_solicitacoes_oc_extras.sql
0009_solicitacoes_subcontratada.sql
0010_cargas_retorno.sql
0011_clientes_tipo_carga.sql   — cliente_minerio + cliente_retorno
0012_perfis_hierarquia.sql     — 5 perfis: admin/gerente/supervisor/analista/assistente
0013_realtime_publication.sql  — habilita realtime nas 2 tabelas operacionais
```

---

## 10. Stack do agente — recomendação

| Componente | Sugestão |
|---|---|
| Runtime | Node.js (mesmo ecossistema do frontend) ou Python |
| WhatsApp provider | Z-API ou Meta Cloud API (oficial); WPPConnect/Baileys se quiser não-oficial |
| LLM | Anthropic Claude (parsing das mensagens, extração estruturada) |
| Banco | `@supabase/supabase-js` autenticado como o usuário do agente |
| PDF | reusar `app/pdf_generator.py` (Python/ReportLab) via HTTP, OU portar para Node usando `@react-pdf/renderer` |
| Webhook | endpoint público para receber mensagens do provedor; processa, identifica solicitante, cria/atualiza solicitação |
| Templates | `formatOCWhatsAppMessage` em `frontend/src/features/whatsapp/whatsapp.ts` |

---

## 11. Convenções e padrões úteis

- **Telefone WhatsApp**: normalize para apenas dígitos com DDI 55 prefixado. Ver `normalizeWhatsAppPhone` em `frontend/src/features/whatsapp/whatsapp.ts`.
- **Formato OC#**: padded 4 dígitos com `#` na frente (`#0042`).
- **Datas**: `validade_inicio`/`validade_fim` são `date` (sem hora). Outras (`enviada_em`, `created_at`) são `timestamptz`.
- **Dia operacional**: começa às 00:00 do fuso local (-03:00, BRT).
- **Status string** no banco é `em_cadastro` mas no UI aparece como **"Em emissão"** (ver `STATUS_LABELS`).
- **Idempotência**: ao receber a mesma mensagem 2x, evite criar solicitação duplicada — sugiro usar hash do `solicitante_telefone + body + minuto` ou um campo `external_msg_id` (não existe hoje, considerar adicionar).
