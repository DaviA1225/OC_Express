# Backlog — Portal Externo de Parceiros (Fase 8)

Backlog de execução do portal para transportadoras parceiras, derivado de
`SPEC-PORTAL.md` e `SPEC-PATCH-PAMCARD.md`, cruzado com o estado atual do
código (migrations até `0015`, sem `origem` nem Pamcard completo).

**Regra de ouro do projeto:** a transportadora parceira é concorrente. Ela só
pode ver os próprios dados; a equipe LHG vê e acessa tudo o que ela faz.

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` concluído · 🔴 bloqueador
· ⚠ decisão de design pendente

---

## Bloco 0 — Pré-requisitos (antes de iniciar a Fase 8)

O SPEC-PORTAL exige "Fases 0-7 + Patch Pamcard em produção por 3-4 semanas".
Hoje o Patch Pamcard **não está aplicado** (existe apenas um `pamcard: boolean`
simples em `solicitacoes`) e **não existe a coluna `origem`** — sem ela o
portal inteiro não funciona.

### 0.1 Patch Pamcard completo (SPEC-PATCH-PAMCARD)
- [ ] 🔴 Migration `XXXX_add_pamcard_and_origem.sql`: colunas `pamcard_status`,
  `pamcard_numero`, `pamcard_providenciado_em`, `pamcard_providenciado_por`,
  `origem` (`interno`/`parceiro`/`email`)
- [ ] 🔴 Constraint `solicitacoes_pamcard_numero_quando_tem` (regex `^[0-9]{10,16}$`)
- [ ] Índices `idx_solicitacoes_pamcard_pendente` e `idx_solicitacoes_origem`
- [ ] Verificar/atualizar trigger de auditoria para as novas colunas
- [ ] Regenerar `database.types.ts`
- [ ] Schema Zod com `discriminatedUnion('pamcard_status', ...)`
- [ ] Helper `formatarPamcardParaExibicao` em `src/lib/`
- [ ] Formulário Nova Solicitação: seção "Pagamento (Pamcard)" com input numérico filtrado
- [ ] Card de solicitação: badge "Cartão pendente"
- [ ] Filtros novos: "Origem" e "Pamcard" na barra de Solicitações
- [ ] Indicador de pendências de Pamcard na sidebar
- [ ] Tela de detalhe: card "Pamcard" + dialog "Cartão providenciado"
- [ ] Confirmar: Pamcard **não** entra no PDF da OC

### 0.2 Aprovações e produção
- [ ] Sistema interno (Fases 0-7) rodando em produção ≥ 3-4 semanas
- [ ] 🔴 Aprovação formal do TI/Segurança da J&F para acesso externo
- [ ] 🔴 Confirmação da transportadora parceira de que usará o portal
- [ ] Definir domínio do portal (`parceiros.lhg.com.br`) e hospedagem

---

## Bloco 1 — Decisões de design de segurança ✅ RESOLVIDO (2026-05-16)

RLS no Postgres é **por linha, não por coluna**. As decisões abaixo foram
fechadas para evitar vazar dado sensível ao concorrente mesmo com RLS "correta".
A *implementação* das views acontece no Bloco 2 (Fase 8.1).

- [x] **VIEW `portal_solicitacoes`** — decisão: o parceiro **não** recebe policy
  de `SELECT` na tabela `solicitacoes` (só `INSERT` e `UPDATE`; sem SELECT, um
  `UPDATE ... RETURNING` também não vaza colunas). A leitura é feita por uma
  view **`SECURITY DEFINER`** (`security_invoker = false`) com filtro próprio
  no `WHERE` (`origem = 'parceiro' AND parceiro_id = get_current_parceiro_id()`).
  Colunas expostas: `id, numero_interno, tipo, status, origem, parceiro_*`,
  `cliente_id, pamcard_status, pamcard_numero, observacoes, created_at`,
  `enviada_em, finalizada_em`. Fica de fora (interno): `numero_instrucao`,
  `pdf_url`, `atendente_id`, `material_id/subtipo`, `local_carregamento`,
  `validade_*`, `pamcard_providenciado_*`, `documentado_*`, `observacoes_internas`.
- [x] **VIEW `clientes_publicos`** — decisão: view `SECURITY DEFINER` expondo
  apenas `id, razao_social, cidade, uf` de `clientes` com `ativo = true`.
  Resolve a contradição SPEC 4.5 × 5.5. Não depende das tabelas de parceiro —
  pode ser criada isoladamente. Filtro por `liberado`/`cliente_minerio` fica
  como decisão de produto (MVP: só `ativo`).
- [x] **Separar observações** — decisão: adicionar coluna `observacoes_internas`
  em `solicitacoes` (na migration da Fase 8.1). `observacoes` = compartilhado
  (parceiro escreve, aparece na view); `observacoes_internas` = só interno.
- [x] **Workspaces** — decisão: **npm workspaces** (nativo, projeto já usa npm).
- [x] **Migração para monorepo** — decisão: dois commits. (1) `git mv frontend
  apps/interno` + esqueleto `apps/portal` + `package.json` raiz + `vercel.json`;
  (2) criar `packages/shared` (`database.types`, `lib/supabase`, `validators`,
  formatters) e reapontar os imports do `apps/interno` para `@sislog/shared`.

---

## Bloco 2 — Fase 8.1: Monorepo + Modelo de dados

### 2.1 Reestruturação para monorepo
- [ ] Migrar `frontend/` → `apps/interno/` (ajustar todos os imports e paths)
- [ ] Criar `packages/shared/` com tipos, validadores e `lib/supabase`
- [ ] Criar `apps/portal/` (esqueleto Vite + React + TS + Tailwind + shadcn)
- [ ] Configurar workspaces no `package.json` raiz
- [ ] Confirmar build/dev independentes de cada app
- [ ] Ajustar `vercel.json` / deploy para os dois apps

### 2.2 Migration das tabelas de parceiro — ✅ migration 0018
- [x] `parceiros` (razão social, CNPJ, contato, código interno, observações internas)
- [x] `parceiro_usuarios` (FK auth.users, perfil `admin_parceiro`/`operador_parceiro`)
- [x] `parceiro_motoristas` — UNIQUE (parceiro_id, cpf)
- [x] `parceiro_veiculos` — UNIQUE (parceiro_id, placa)
- [x] `parceiro_carretas` — UNIQUE (parceiro_id, placa)
- [x] `parceiro_subcontratadas` — UNIQUE (parceiro_id, cnpj) quando não nulo
- [x] Triggers `updated_at` + auditoria nas 6 tabelas
- [x] Patch em `solicitacoes`: colunas `parceiro_*` e `observacoes_internas`
- [x] CHECK de integridade de origem (`origem='parceiro'` × interno) — `NOT VALID`
- [x] CHECK `material_id` obrigatório fora de `recebida`/`cancelada` (isenta `retorno`) — `NOT VALID`

### 2.3 RLS — ✅ migration 0018
- [x] Funções `get_current_parceiro_id()`, `is_interno()`, `is_admin_parceiro()`
  (SECURITY DEFINER, evita recursão de RLS)
- [x] Políticas SELECT/INSERT/UPDATE nas 4 tabelas `parceiro_*` + leitura interna
- [x] Políticas em `parceiros` e `parceiro_usuarios` (interno + `admin_parceiro`)
- [x] Políticas em `solicitacoes` (interno faz tudo; parceiro cria e cancela
  enquanto `recebida`; parceiro **sem** SELECT — lê pela view)
- [x] Lockdown das tabelas internas: políticas `authenticated USING(true)` →
  `is_interno()` (`perfis_usuarios`, cadastros, `cargas_retorno`,
  `solicitacao_anexos`, `log_auditoria` com INSERT aberto p/ trigger)
- [x] View `clientes_publicos` criada (migration 0017)
- [x] View `portal_solicitacoes` criada (migration 0018, `SECURITY DEFINER`)
- [ ] **Teste de penetração de RLS**: logar como parceiro A e tentar ler dados
  de parceiro B, dados internos e colunas sensíveis via API REST
- [ ] Lockdown da RLS de **storage** (`solicitacoes-anexos`): hoje as policies
  são `authenticated USING(bucket_id=...)`; restringir a `is_interno()` antes
  de o portal ir ao ar

---

## Bloco 3 — Fase 8.2: Telas internas de gestão de parceiros

(no app `apps/interno`)

- [ ] CRUD `/cadastros/parceiros`
- [ ] Tela `/cadastros/parceiros/:id/usuarios` (convite via Supabase Auth)
- [ ] Filtro "Origem" na lista de Solicitações (reaproveita o do Patch Pamcard)
- [ ] Badge "via [Parceiro]" nos cards de solicitação
- [ ] Indicador "Material a definir" no card e na tela de detalhe interna
- [ ] Banner ⚠ "Material ainda não definido" antes de avançar de `recebida`
- [ ] Botões "Enviar WhatsApp ao parceiro" / "Enviar e-mail ao parceiro" no
  detalhe quando `status=oc_gerada` e `origem=parceiro`

---

## Bloco 4 — Fase 8.3: Portal — autenticação e cadastros

(no app `apps/portal`)

- [ ] Layout: header (56px) + navegação horizontal (44px), sem sidebar
- [ ] Identidade visual diferenciada ("Portal Parceiros LHG", acento `#1E3A8A`)
- [ ] Footer com link "Suporte" (e-mail/WhatsApp da LHG)
- [ ] Login (`/`) — sem "esqueci senha" no MVP
- [ ] CRUD Motoristas do parceiro
- [ ] CRUD Veículos do parceiro
- [ ] CRUD Carretas do parceiro
- [ ] CRUD Subcontratadas do parceiro
- [ ] Tela Usuários (somente `admin_parceiro`)

---

## Bloco 5 — Fase 8.4: Portal — solicitações

- [ ] Lista `/solicitacoes` com labels amigáveis de status (mapeamento SPEC 5.3)
- [ ] Filtros: busca, status, período
- [ ] Nova solicitação `/solicitacoes/nova` (tela cheia, coluna 720px)
  - [ ] Seção Motorista e Veículo (comboboxes com "+ Cadastrar novo")
  - [ ] Seção Destino (select de `clientes_publicos`, sem material)
  - [ ] Seção Pagamento (Pamcard)
  - [ ] Seção Observações
  - [ ] Submit cria `solicitacoes` com `origem='parceiro'`, `material_id=NULL`
- [ ] Detalhe `/solicitacoes/:id` (linha do tempo, sem download de PDF)
- [ ] Cancelamento (botão visível só com `status=recebida`)

---

## Bloco 6 — Fase 8.5: Segurança e polimento

- [ ] Rate limiting (100 req/min/usuário, 50 solicitações/dia/usuário)
- [ ] Captcha no login do portal (Cloudflare Turnstile ou hCaptcha)
- [ ] Política de senha forte (mín. 12 caracteres, troca a cada 90 dias)
- [ ] Auditoria expandida (`portal_login`, `portal_solicitacao_criada`, etc.)
- [ ] Log de tentativas de login (IP, user agent, timestamp)
- [ ] Tela "Segurança" no sistema interno (só admin)
- [ ] README e documentação do portal

---

## Fora de escopo (mesmo após o portal no ar)

Integração Protheus · app mobile nativo · WhatsApp automatizado ao parceiro ·
download de PDF dentro do portal · dashboard de métricas no portal · API
pública · multi-idioma · white-label · faturamento/financeiro.

---

## Ordem recomendada

1. ✅ **Bloco 0.1** (Patch Pamcard) — concluído (migration 0016 aplicada).
2. ✅ **Bloco 1** (decisões de segurança) — resolvido em 2026-05-16.
3. ✅ **Bloco 2.2 + 2.3** (modelo de dados + RLS) — migrations 0017 e 0018.
4. **Bloco 0.2** (aprovações) — em paralelo, fora do código.
5. Bloco 2.1 (monorepo) e Blocos 3 → 6 na ordem das sub-fases do SPEC.

**Próximo passo de código:** Bloco 2.1 — reestruturação para monorepo
(`apps/interno` + `apps/portal` + `packages/shared`). É o passo disruptivo;
o modelo de dados do portal já está pronto no banco (0018).
