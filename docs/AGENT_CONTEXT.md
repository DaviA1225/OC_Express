# SisLog / OC Express — Contexto para Agente de IA (perfil **assistente**)

> Documento de referência para um agente de IA que integra WhatsApp ao sistema, atuando com as permissões do perfil **assistente**.

> **Estado em 2026-05-26.** Reflete migrations `0001`–`0031`, monorepo `apps/interno` + `apps/portal` + `packages/shared`, Pamcard refeito (status + número), bucket `ocs-pdf` **privado** com signed URL, RLS por perfil, idempotência via `external_msg_id` e coluna `origem`.

---

## 1. Resumo do sistema

**Empresa:** OC Express Transportes — transportadora contratada da mineradora **Vale (Vale do Rio Doce)**, sob a holding **LHG Logística (J&F)**.

**Operação:** equipe de 10–15 atendentes processa solicitações de Ordem de Carregamento (OC) que chegam por WhatsApp, mantém cadastros compartilhados e gera PDFs operacionais que são reenviados ao motorista/cliente. O sistema é **paralelo ao ERP corporativo (Protheus)** — a ligação é manual, via "número de instrução".

**Tipos de carga:**
- **Carregamento (minério)** — sai da mineradora, vai pro destinatário
- **Retorno** — sai do cliente de retorno, volta pro pátio

**Stack:**
- **Monorepo npm workspaces** (`package.json` raiz)
  - `apps/interno/` — sistema interno (substituiu o antigo `frontend/`)
  - `apps/portal/` — portal externo de parceiros (Fase 8)
  - `packages/shared/` — `@sislog/shared` com `database.types`, `validators`, `formatters`, factory `createSupabaseClient`
- **Frontend** (em ambos os apps): React 19 + Vite + TS + Tailwind + shadcn/ui + react-hook-form + zod + react-router v7 + @tanstack/react-query + @react-pdf/renderer + sonner + date-fns + recharts + lucide-react
- **Banco**: **Supabase Postgres** com RLS habilitada em todas as tabelas e endurecida por perfil (migration 0025)
- **Storage**: bucket `ocs-pdf` **PRIVADO** (PDFs das OCs); acesso só via signed URL
- **Storage**: bucket `solicitacoes-anexos` PRIVADO, restrito a interno + parceiro dono (migration 0020)
- **Auth**: Supabase Auth (email + senha; convite via Edge Function para parceiros)
- **Realtime**: publication `supabase_realtime` em `solicitacoes` e `cargas_retorno`
- **Edge Functions** já deployadas: `convidar-parceiro-usuario`, `reenviar-convite-parceiro-usuario`, `excluir-parceiro-usuario`
- **Deploy**: cada app é projeto Vercel separado (Root Directory na subpasta)

**Repositório:** `https://github.com/DaviA1225/OC_Express`

---

## 2. Hierarquia de perfis

São **2 universos disjuntos** de usuários no `auth.users`:

### 2.1 Time interno LHG — tabela `perfis_usuarios`
5 níveis: `admin` > `gerente` > `supervisor` > `analista` > `assistente`

> O agente entra **como `assistente`** (perfil mais restrito; suficiente para a operação dele).

### 2.2 Parceiro externo — tabela `parceiro_usuarios`
2 níveis: `admin_parceiro`, `operador_parceiro`. **Não relevante para o agente** — o agente é interno e nunca consome o portal.

### 2.3 Matriz do `assistente` (fonte de verdade: `apps/interno/src/features/auth/permissions.ts`)

| Ação | Permitido? |
|---|:-:|
| Ver Dashboard | ✅ |
| Ver e **criar/editar/transit/gerar PDF** de Solicitações | ✅ (`canEditSolicitacoes`) |
| Exportar CSV de Solicitações | ✅ |
| **Cadastrar/editar** Motoristas, Veículos, Carretas, Subcontratadas | ✅ (`canEditCadastrosOperacionais`) |
| Ver Clientes, Materiais, Cargas de Retorno | ✅ |
| **Editar** Clientes / Materiais / Cargas de Retorno | ❌ |
| Ver Parceiros (visualização) | ✅ (`canViewParceiros`) |
| Editar Parceiros | ❌ |
| Ver Auditoria, Relatórios, Usuários, Segurança | ❌ |
| **Bulk actions** (qualquer página) | ❌ |

> **Esta matriz agora é reforçada no banco (RLS por perfil — migration 0025).** Não é mais "RLS permissiva + UI controla": o `assistente` que tentar `INSERT` em `clientes` recebe `42501` direto do Postgres.

---

## 3. Esquema do banco

Todas as tabelas têm `id uuid PK`, `created_at timestamptz`, `updated_at timestamptz` (auto), `created_by uuid REFERENCES auth.users(id)` e `ativo boolean` (exceto `solicitacoes` e `log_auditoria`). Triggers de auditoria gravam `INSERT/UPDATE/DELETE` em `log_auditoria` com `dados_antes`/`dados_depois` em JSONB.

### 3.1 `perfis_usuarios`
Link 1:1 com `auth.users`. **Sem isso, o usuário não tem perfil e não passa pelo `ProtectedRoute` do frontend nem na função `is_interno()` do banco.**

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
requer_instrucao boolean -- se true, status 'em_cadastro' exige numero_instrucao
```

### 3.8 `solicitacoes` — **fato principal**
```
numero_interno serial UNIQUE  -- contador automático, exibido como "#0042"
tipo text CHECK IN ('carregamento','retorno')
status text CHECK IN (
  'recebida','em_cadastro','instrucao_emitida',
  'oc_gerada','oc_enviada','finalizada','cancelada'
) DEFAULT 'recebida'

origem text DEFAULT 'interno'  -- 'interno' | 'parceiro' | 'email'  ⚠ ver §6.0
external_msg_id text           -- ID externo da mensagem (idempotência) — único quando preenchido

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
observacoes text         -- compartilhado (parceiro também escreve)
observacoes_internas text -- só interno (não aparece na view do portal)

atendente_id uuid REFERENCES auth.users  -- quem criou
pdf_url text             -- ⚠ agora guarda o PATH no bucket (ex.: "OC_0042_20260526.pdf"), não URL pública
enviada_em timestamptz
finalizada_em timestamptz

cte_emitido boolean, mdfe_emitido boolean,
vale_pedagio boolean

-- Pamcard (refeito em 0016, substituiu o antigo boolean):
pamcard_status text NOT NULL DEFAULT 'nao_tem_cartao'
  CHECK IN ('tem_cartao','nao_tem_cartao')
pamcard_numero text       -- 10–16 dígitos quando status='tem_cartao'
pamcard_providenciado_em timestamptz
pamcard_providenciado_por uuid REFERENCES auth.users(id)

documentado_por uuid, documentado_em timestamptz

-- Vínculo opcional com portal (NULL para origens interno/email):
parceiro_id uuid REFERENCES parceiros
parceiro_usuario_id uuid REFERENCES parceiro_usuarios -- ON DELETE SET NULL
```

**Constraints relevantes:**
- `solicitacoes_pamcard_numero_quando_tem` — `pamcard_status='tem_cartao'` ⇒ `pamcard_numero ~ '^[0-9]{10,16}$'`; `'nao_tem_cartao'` ⇒ `pamcard_numero IS NULL`
- Índice único parcial `uq_solicitacoes_external_msg_id` (WHERE NOT NULL) → idempotência do agente

### 3.9 `cargas_retorno`
Pares (cliente, local) pré-cadastrados que abastecem solicitações tipo `retorno`.
```
cliente_id uuid REFERENCES clientes  -- precisa ter cliente_retorno=true
local_carregamento text NOT NULL
observacoes text
ativo boolean DEFAULT true
```

### 3.10 `solicitacao_anexos`
Anexos enviados pelo parceiro/interno por solicitação (migration 0014). Bucket `solicitacoes-anexos` privado; acesso só pelo dono + interno.

### 3.11 `parceiros` / `parceiro_usuarios` / `parceiro_*`
Tabelas da Fase 8 (portal externo). **Agente não toca aqui** — só `solicitacoes` recebe vínculo em `parceiro_id`/`parceiro_usuario_id` quando `origem='parceiro'`. Para o agente, esses campos ficam `NULL`.

### 3.12 `eventos_portal`
Auditoria dedicada do portal externo. Não usada pelo agente.

### 3.13 `log_auditoria`
Trigger `audit_trigger()` em todas as tabelas operacionais — preenchida automaticamente.

### 3.14 Storage
- **Bucket** `ocs-pdf` — **PRIVADO** desde 0026; PDF da OC. Padrão de nome: `OC_<numero_interno_pad4>_<AAAAMMDD>.pdf`. Acesso via signed URL.
- **Bucket** `solicitacoes-anexos` — PRIVADO; anexos. Acesso restrito a `is_interno()` OU `solicitacao_pertence_ao_parceiro_logado()`.

### 3.15 Realtime
Tabelas com publication ativa: `solicitacoes`, `cargas_retorno`.

### 3.16 Funções SQL relevantes
- `is_interno()` — `auth.uid()` está em `perfis_usuarios` ativo. Base da RLS interna.
- `meu_perfil_interno()` — retorna o `perfil` do usuário logado (`SECURITY DEFINER`).
- `atualizar_meu_nome(novo_nome text)` — RPC para o usuário comum editar o próprio nome.
- `registrar_evento_portal(...)` — auditoria do portal (não usar no agente).
- `get_current_parceiro_id()` — usada pelas views/RLS do portal.

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
| `em_cadastro` → `instrucao_emitida` | atendente preenche número Protheus | grava `numero_instrucao` (obrigatório quando `material.requer_instrucao`) |
| `instrucao_emitida` → `oc_gerada` | atendente click "Gerar OC" | render PDF, upload pro Storage (privado), `pdf_url` = path |
| `oc_gerada` → `oc_enviada` | usuário abre WhatsApp pelo dialog | grava `enviada_em = now()` + signed URL de 7 dias na mensagem |
| `oc_enviada` → `finalizada` | atendente click "Finalizar" | grava `finalizada_em = now()` |
| Qualquer → `cancelada` | atendente click "Cancelar" | terminal |

> **Importante:** `pdf_url` no banco agora guarda o **path** do arquivo no bucket. Para enviar pelo WhatsApp, gere uma `createSignedUrl('ocs-pdf', path, 60*60*24*7)` (7 dias). Para abrir internamente, 1 hora basta.

---

## 5. Layout do PDF da OC

Renderizado em `apps/interno/src/features/pdf-generator/OCDocument.tsx` via `@react-pdf/renderer`. Recebe um objeto `OCData` com:

- `numero` (string padded 4 dig: "0042")
- `empresa` ('OC EXPRESS TRANSPORTES'), `cnpj_filial`, `filial` (vêm do material)
- `subcontratada`, `motorista` (formato "Nome — CPF xxx"), `cavalo_placa`, `ultima_carreta`
- `carregamento`, `destino` (cidade/UF do cliente), `instrucao`, `descarga` (razão social do cliente)
- `material` (nome ou subtipo se minério), `observacoes_padrao` (bloco do material)
- `autorizado_por` (nome do atendente), `validade_inicio`, `validade_fim` (Date)
- `logoUrl` (data URL embutida no bundle)

> **Pamcard NÃO entra no PDF** (decisão fechada no SPEC-PATCH-PAMCARD).

---

## 6. O que o agente precisa fazer (operações típicas)

Use `@supabase/supabase-js` autenticado como o **usuário do agente (perfil `assistente`)** — assim `created_by` e `usuario_id` em `log_auditoria` ficam corretos e a RLS por perfil aplica sozinha. **Evite `service_role`** em runtime — perde-se a auditoria e contorna-se a RLS sem necessidade.

### 6.0 Coluna `origem` — decisão pendente ⚠

Hoje os valores aceitos são `'interno' | 'parceiro' | 'email'`. **Recomendado:** adicionar `'whatsapp'` (migration nova) para o agente, em vez de reaproveitar `'email'` — assim o filtro "Origem" da listagem fica fiel ao canal real. Decisão pendente.

### 6.1 Setup do usuário do agente

```sql
-- 1) Criar conta no Supabase Auth (dashboard ou admin API)
-- 2) Inserir perfil:
INSERT INTO perfis_usuarios (user_id, nome_completo, perfil, ativo)
VALUES ('<uuid-do-auth-user>', 'Agente IA WhatsApp', 'assistente', true);
```

Depois disso, `is_interno()` retorna `true` para esse `auth.uid()` e a RLS interna aceita ele.

### 6.2 Receber mensagem do WhatsApp → criar solicitação (com idempotência)

```ts
// 1. Normaliza telefone (formato wa.me) — usar normalizeWhatsAppPhone do front
const solicitanteTelefone = '(67) 99999-1234'

// 2. external_msg_id deve ser o ID da mensagem no provedor (Meta wamid, etc.).
//    O índice único parcial impede reprocessar a mesma mensagem.
const { data, error } = await supabase
  .from('solicitacoes')
  .insert({
    tipo: 'carregamento',         // 'carregamento' | 'retorno'
    status: 'recebida',
    origem: 'whatsapp',           // ver §6.0; até existir, usar 'email' temporariamente
    external_msg_id: wamid,       // ⇐ chave de idempotência
    solicitante_nome: 'João',
    solicitante_telefone: solicitanteTelefone,
    observacoes: '<texto original do WhatsApp>',
    // motorista_id, veiculo_id, carreta_id, cliente_id, material_id: opcionais nesse momento
  })
  .select()
  .single()

// Se a mensagem já tinha sido processada, o INSERT falha com 23505 (unique_violation).
// Trate como "já existe — busca pelo external_msg_id e segue".
if (error?.code === '23505') {
  const { data: existente } = await supabase
    .from('solicitacoes')
    .select('*')
    .eq('external_msg_id', wamid)
    .single()
  // ...
}
```

### 6.3 Buscar dados de cadastro (para resolver IDs a partir de texto)

```ts
// Motorista por nome ou CPF
await supabase.from('motoristas')
  .select('id, nome_completo, cpf, telefone')
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
//   1) renderiza PDF em buffer
//   2) upload no bucket privado
//   3) salva o PATH (não a URL!) em pdf_url
await supabase.storage
  .from('ocs-pdf')
  .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true })

await supabase.from('solicitacoes')
  .update({ status: 'oc_gerada', pdf_url: path })  // ⚠ path, não URL pública
  .eq('id', solicitacaoId)

// Para enviar pelo WhatsApp — gera signed URL de 7 dias:
const { data: signed } = await supabase.storage
  .from('ocs-pdf')
  .createSignedUrl(path, 60 * 60 * 24 * 7)

await supabase.from('solicitacoes')
  .update({ status: 'oc_enviada', enviada_em: new Date().toISOString() })
  .eq('id', solicitacaoId)
```

### 6.5 Cadastrar entidade nova (motorista, veículo, carreta, subcontratada)
RLS aceita do `assistente` para essas 4 tabelas (migration 0025).

```ts
await supabase.from('motoristas').insert({
  nome_completo: 'José da Silva',
  cpf: '123.456.789-00',
  telefone: '(67) 99999-1234',
})
```

> Tentar `INSERT/UPDATE` em `clientes`, `materiais` ou `cargas_retorno` retornará `42501` (assistente não tem permissão). Para esses casos, peça intervenção humana via observação na solicitação.

### 6.6 Gerar e enviar PDF

Opções (escolha em §10):
1. Reusar `apps/interno` (rodar `@react-pdf/renderer` em Node — biblioteca já é cross-runtime)
2. Reusar `app/pdf_generator.py` legado (ReportLab) via HTTP
3. Edge Function com `puppeteer` ou similar

Após gerar e upload:
```ts
const path = `OC_${pad4(numero)}_${yyyymmdd()}.pdf`
await supabase.storage.from('ocs-pdf')
  .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true })
const { data: signed } = await supabase.storage
  .from('ocs-pdf')
  .createSignedUrl(path, 60 * 60 * 24 * 7)  // 7 dias para o destinatário externo
const pdfUrlParaWhatsApp = signed?.signedUrl
```

### 6.7 Mensagem padrão de OC para WhatsApp

Definida em `apps/interno/src/features/whatsapp/whatsapp.ts:formatOCWhatsAppMessage`. Reusar a mesma estrutura:

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

PDF: https://...signed...
```

---

## 7. Constraints e validações importantes

- **CPF/CNPJ**: validação real em `packages/shared/src/validators.ts` (`isValidCpf`, `isValidCnpj`, `isValidDocumento`). Reusar via `import { isValidCpf } from '@sislog/shared/validators'`.
- **Placa**: padrão antigo `ABC1234` ou MERCOSUL `ABC1D23` — sempre uppercase.
- **Subcontratada inferida do veículo**: ao escolher um veículo, auto-preencha `subcontratada_id` da solicitação com o `subcontratada_id` do veículo. Replicar isso no agente.
- **Material minério exige subtipo**: se `material.nome` casa com regex `/MIN[ÉE]RIO/i`, é obrigatório `material_subtipo ∈ {SINTER, HEMATITA, LUMP}`.
- **Cliente de retorno NÃO pode ser usado em solicitação de carregamento** (frontend filtra). Para retorno, geralmente o cliente vem da `cargas_retorno`.
- **`requer_instrucao` por material**: se `materiais.requer_instrucao=true`, a transição para `instrucao_emitida` exige `numero_instrucao` preenchido (validação no front; replicar no agente).
- **`enviada_em` e `finalizada_em`**: `timestamptz`; grave `now()` quando transita.
- **Pamcard**: se a mensagem do WhatsApp menciona "tem cartão" / número de cartão, preencher `pamcard_status='tem_cartao'` + `pamcard_numero` (10–16 dígitos). Caso contrário, deixar o default (`'nao_tem_cartao'`).

---

## 8. RLS (Row-Level Security)

**A partir da migration 0025**, as policies não são mais "permissivas" — são por perfil. Resumo do que muda para o agente (`assistente`):

| Tabela | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `solicitacoes` | ✅ `is_interno()` | ✅ `is_interno()` (transições controladas no app) |
| `solicitacao_anexos` | ✅ interno OU dono | ✅ interno OU dono |
| `subcontratadas`, `motoristas`, `veiculos`, `carretas` | ✅ interno | ✅ admin/analista/**assistente** |
| `clientes` | ✅ interno | ❌ (admin/gerente/supervisor/analista) |
| `materiais` | ✅ interno | ❌ (admin/supervisor/analista) |
| `cargas_retorno` | ✅ interno | ❌ (admin/supervisor/analista) |
| `perfis_usuarios` | ✅ interno | ❌ (só admin) |
| `log_auditoria` | ❌ (só admin/gerente/supervisor) | INSERT auto, UPDATE/DELETE só admin |
| `parceiros` / `parceiro_*` | ✅ interno | depende — agente normalmente nem toca |
| `eventos_portal` | só admin | só a função `registrar_evento_portal` |

> **Implicação:** se o agente identifica um cliente/material novo no texto, ele **não pode** criar — precisa avisar a equipe (ex.: criar solicitação `recebida` com `observacoes` indicando o pendente).

Trigger de rate limit (`check_portal_rate_limit_diario`) é **só para `origem='parceiro'`** — agente passa direto.

---

## 9. Migrations aplicadas (referência)

```
0001 initial_schema                — schema base + RLS + bucket ocs-pdf (público na época)
0002 seed                          — dados de teste
0003 carretas_subcontratada
0004 clientes_frete_liberado
0005 clientes_tipos_carreta
0006 clientes_frete_por_tipo
0007 subcontratadas_documento
0008 solicitacoes_oc_extras
0009 solicitacoes_subcontratada
0010 cargas_retorno
0011 clientes_tipo_carga           — cliente_minerio + cliente_retorno
0012 perfis_hierarquia             — 5 perfis: admin/gerente/supervisor/analista/assistente
0013 realtime_publication
0014 solicitacao_anexos            — bucket privado + tabela de anexos
0015 materiais_requer_instrucao
0016 solicitacoes_pamcard_origem   — Pamcard refeito + coluna `origem`
0017 clientes_publicos_view        — view SECURITY DEFINER p/ portal
0018 portal_parceiros_dados        — parceiro_*, RLS endurecida, view portal_solicitacoes
0019 align_parceiro_cadastros
0020 anexos_portal_access          — bucket solicitacoes-anexos privado
0021 eventos_portal                — auditoria do portal
0022 portal_rate_limit_diario      — 50 solic/dia/usuário do portal (SQLSTATE PT429)
0023 eventos_portal_usuario_convidado
0024 busca_global_unaccent
0025 rls_por_perfil                — ⚠ ENDURECE RLS por perfil (espelha permissions.ts)
0026 ocs_pdf_privado               — ⚠ bucket OC PRIVADO + signed URLs
0027 solicitacoes_external_msg_id  — ⚠ idempotência para o agente WhatsApp
0028 parceiro_update_so_cancela
0029 parceiro_usuarios_convite_aceito
0030 clientes_publicos_so_minerio
0031 excluir_parceiro_usuario      — FK ON DELETE SET NULL + evento portal_usuario_excluido
```

---

## 10. Stack do agente — escolha fechada (rentabilidade)

| Componente | Escolha | Custo aprox. | Por quê |
|---|---|---|---|
| **Provedor WhatsApp** | **Meta Cloud API (oficial)** | Grátis até 1.000 conversas iniciadas/mês; o caso de uso é reativo (cliente abre) — praticamente todas as conversas caem em "service" (grátis dentro da janela 24h). | Oficial, sem risco de banimento, webhooks estáveis. Z-API custaria R$ 79–149/mês; WPPConnect/Baileys são free mas com risco real de bloqueio de número. |
| **Runtime** | **Vercel Serverless (Node)** | Free tier (Hobby) ~100GB-h/mês; o webhook do agente é leve (poucos req/min). | Reusa o monorepo (`@sislog/shared`, `database.types`), CI/CD junto com os apps existentes, logs no mesmo lugar. Edge Function do Supabase teria 60s de timeout (apertado quando o LLM demora). |
| **LLM** | **Claude Haiku 4.5** + tool use | ~$1/MTok input, ~$5/MTok output. Volume baixo (poucas mensagens/dia) → < US$ 5/mês. | Extração estruturada (intent, entidades) é exatamente onde Haiku brilha — rápido e barato. Sonnet só se a precisão for insuficiente em testes. Tool use direto fica como nosso "schema-enforcer". |
| **PDF server-side** | **Portar `OCDocument.tsx` para `packages/shared` e renderizar com `@react-pdf/renderer` no Node** | $0 extra. | `@react-pdf/renderer` roda nativo em Node. Uma única fonte de verdade do layout (sem divergir do front). Evita manter o backend Python só pra isso. |
| **Banco/Auth** | `@supabase/supabase-js` autenticado como o **usuário do agente (assistente)** | $0 (incluído no Supabase atual). | Audit trail correto (`created_by`/`log_auditoria`), RLS aplica sozinha. `service_role` só para o setup inicial. |
| **Webhook** | Endpoint `POST /api/whatsapp/inbound` no projeto Vercel do agente | $0. | Meta envia webhook → valida assinatura HMAC → cria/atualiza solicitação. |

**Custo total estimado em regime:** US$ 0–10/mês para o volume típico (≈ 20–50 mensagens/dia).

**Quando reconsiderar:**
- Se Meta exigir templates pré-aprovados para reabrir conversa fora da janela 24h e isso virar friction → considerar Z-API.
- Se Haiku não acertar extração consistentemente (< 90% sem retoque humano) → trocar por Sonnet 4.6 (~3x mais caro, ainda barato).
- Se portar `@react-pdf` para Node der mais trabalho que o esperado → manter o backend Python rodando num Railway de US$ 5/mês.

---

## 11. Convenções e padrões úteis

- **Telefone WhatsApp**: normalize para apenas dígitos com DDI 55 prefixado. Ver `normalizeWhatsAppPhone` em `apps/interno/src/features/whatsapp/whatsapp.ts`.
- **Formato OC#**: padded 4 dígitos com `#` na frente (`#0042`). Helper `formatNumeroOC` no front.
- **Datas**: `validade_inicio`/`validade_fim` são `date` (sem hora). Outras (`enviada_em`, `created_at`) são `timestamptz`.
- **Dia operacional**: começa às 00:00 do fuso local `America/Sao_Paulo` (-03:00, BRT).
- **Status string** no banco é `em_cadastro` mas no UI aparece como **"Em emissão"** (ver `STATUS_LABELS`).
- **Idempotência**: usar `solicitacoes.external_msg_id` (índice único parcial) — preenche com o ID da mensagem no provedor (Meta wamid, etc.). Reprocessar a mesma mensagem retorna `23505 unique_violation`, que o agente trata como "já existe".
- **PDF público vs path**: `solicitacoes.pdf_url` guarda **o path** (ex.: `OC_0042_20260526.pdf`); URL pública não existe mais — gere signed URL na hora do envio.
- **Reusar validadores**: importe de `@sislog/shared/validators` em vez de duplicar regras de CPF/CNPJ/placa.

---

## 12. Checklist de pré-requisitos para iniciar o agente

- [ ] Decidir e aplicar `origem='whatsapp'` (migration nova) **ou** documentar que o agente usa `'email'` temporariamente
- [ ] Criar usuário do agente no Supabase Auth + linha em `perfis_usuarios` (perfil `assistente`)
- [ ] Cadastrar conta Meta WhatsApp Business + número aprovado + webhook URL
- [ ] Criar projeto Vercel (`apps/agente-whatsapp` no monorepo) com env vars (`META_WA_TOKEN`, `META_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_AGENT_EMAIL`, `SUPABASE_AGENT_PASSWORD`)
- [ ] Portar `OCDocument.tsx` para `packages/shared/pdf` (ou decidir reusar Python)
- [ ] Implementar webhook GET (verify) + POST (inbound) + assinatura HMAC
- [ ] Implementar pipeline: parse → tool use Haiku → resolver IDs → INSERT idempotente
- [ ] Implementar respostas de confirmação/erro pelo Meta Cloud API
- [ ] Testar end-to-end com número de teste antes de ligar no número oficial
