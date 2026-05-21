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

### 2.1 Reestruturação para monorepo — ✅ concluído
- [x] Migrar `frontend/` → `apps/interno/` (commit `2a8700f`)
- [x] Criar `packages/shared/` (`@sislog/shared`) com `database.types`,
  `validators`, `formatters` e factory `createSupabaseClient`. Subpath exports
  (`/types`, `/validators`, `/formatters`, `/supabase`). Os arquivos
  `lib/*`/`types/*` do `apps/interno` viraram re-export shims — zero edição
  nos ~100 sites de import.
- [x] Criar `apps/portal/` (esqueleto Vite + React + TS) — **Tailwind + shadcn
  ficam para o Bloco 4** (montagem da identidade visual do portal)
- [x] Configurar workspaces no `package.json` raiz
- [x] Confirmar build/dev independentes: `npm run build -w @sislog/interno`
  passa (`tsc -b` + `vite build`); dev do interno (5173) e portal (5174) sobem
- [x] `vercel.json` por app (`apps/interno`, `apps/portal`)

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
- [x] **Teste de penetração de RLS** (2026-05-20): script
  `scripts/pentest-rls.mjs` (38 cenários, 38 PASS) — parceiro A vs. parceiro B
  em todas as tabelas `parceiro_*`, `solicitacoes` (sem SELECT direto, INSERT
  só com `parceiro_id` próprio, sem `origem=interno`, sem cancelar/deletar
  alheio), view `portal_solicitacoes` (só do dono), view `clientes_publicos`
  (apenas `id/razao_social/cidade/uf`), tabelas internas bloqueadas (10 delas
  + `log_auditoria`) e bucket `solicitacoes-anexos` (upload em pasta alheia
  e download cross-tenant negados). Reexecutável: `npm run pentest:rls`.
- [x] Lockdown da RLS de **storage** (`solicitacoes-anexos`) — migration
  `0020_anexos_portal_access.sql` restringe tabela e bucket a `is_interno()`
  OU `solicitacao_pertence_ao_parceiro_logado()`. Validado pelo pentest.

---

## Bloco 3 — Fase 8.2: Telas internas de gestão de parceiros

(no app `apps/interno`)

- [x] CRUD `/cadastros/parceiros` — `ParceirosPage`; edição restrita a
  admin/gerente/supervisor (`canEditParceiros`), visualização livre. Tabelas
  `parceiro_*` e views tipadas no `@sislog/shared`.
- [ ] 🔴 Tela `/cadastros/parceiros/:id/usuarios` (convite via Supabase Auth)
  — **adiado**: o convite cria usuário no Auth e exige a `service_role` key,
  inviável no frontend. Pendente de uma Supabase Edge Function dedicada.
- [x] Filtro "Origem" na lista de Solicitações — já existia (feito junto da
  camada de dados do portal).
- [x] Badge "via [Parceiro]" nos cards de solicitação — join de `parceiro` no
  `SELECT_WITH_JOINS`; badge azul com a razão social.
- [x] Indicador "Material a definir" no card e na tela de detalhe interna
  (origem=parceiro, sem `material_id`, exceto retorno).
- [x] Banner ⚠ "Material ainda não definido" no detalhe em `recebida`; o botão
  "Marcar em emissão" fica desabilitado até definir o material.
- [x] Botões "Enviar WhatsApp ao parceiro" / "Enviar e-mail ao parceiro" no
  detalhe (card "Avisar o parceiro") quando `status` é `oc_gerada`/`oc_enviada`
  e `origem=parceiro`.

---

## Bloco 4 — Fase 8.3: Portal — autenticação e cadastros

(no app `apps/portal`)

- [x] Setup do app: Tailwind, shadcn (ui copiada do interno), alias `@`,
  `index.css` com identidade azul, `lib/supabase` (factory `@sislog/shared`).
- [x] Layout: header (56px) + navegação horizontal (44px), sem sidebar.
- [x] Identidade visual diferenciada ("Portal Parceiros LHG", azul
  `#1E40AF`/`#1E3A8A`).
- [x] Footer com link "Suporte" (e-mail/WhatsApp) — **placeholders**, trocar
  pelos contatos reais da LHG.
- [x] Login (`/`) — sem "esqueci senha"; auth via `parceiro_usuarios`.
- [x] CRUD Motoristas do parceiro.
- [x] CRUD Veículos do parceiro.
- [x] CRUD Carretas do parceiro.
- [x] CRUD Subcontratadas do parceiro.
- [~] Tela Usuários (somente `admin_parceiro`) — lista, edita perfil e
  ativa/desativa. Convite de novo usuário **adiado** (Edge Function).

---

## Bloco 5 — Fase 8.4: Portal — solicitações — ✅ concluído (2026-05-19)

- [x] Lista `/solicitacoes` com labels amigáveis de status (mapeamento SPEC 5.3,
  em `features/solicitacoes/status.ts`) — grid de cards, resolve nomes no
  cliente (a view `portal_solicitacoes` só traz IDs).
- [x] Filtros: busca (motorista/placa/cliente/número), status (grupos
  amigáveis) e período.
- [x] Nova solicitação `/solicitacoes/nova` (tela cheia, coluna 720px)
  - [x] Seção Motorista e Veículo (comboboxes com "+ Cadastrar novo" →
    diálogos `QuickCreate`)
  - [x] Seção Destino (combobox de `clientes_publicos`, sem material)
  - [x] Seção Pagamento (Pamcard) — radio + input numérico filtrado
  - [x] Seção Observações
  - [x] Submit cria `solicitacoes` com `origem='parceiro'`, `material_id=NULL`.
    O id é gerado no cliente (`crypto.randomUUID`) — o parceiro não tem policy
    de SELECT em `solicitacoes`, então não dá para usar INSERT … RETURNING.
- [x] Detalhe `/solicitacoes/:id` (dados + linha do tempo, sem download de PDF)
- [x] Cancelamento (botão visível só com `status=recebida`; RLS garante a regra)
- Primitivos de UI copiados do `apps/interno` para o portal: `popover`,
  `command`, `radio-group`, `Combobox` (+ deps `@radix-ui/react-popover`,
  `@radix-ui/react-radio-group`, `cmdk`).
- ⚠ Pendência menor: `apps/portal` não tem `eslint.config.js` (lacuna do
  Bloco 4) — `npm run lint` falha; o gate de tipos (`tsc`) passa.

---

## Bloco 6 — Fase 8.5: Segurança e polimento

Ordem recalibrada em 2026-05-20 (decisões: senha 90d fora do MVP, rate
limit só diário via trigger SQL, captcha adiado para depois do MVP).

### 6.1 Senha forte (mínimo 12 chars) — ✅ concluído (2026-05-20)
- [x] Zod do `SegurancaCard` em `apps/interno/.../PerfilPage.tsx` subiu de
  `min(6)` para `min(12)` + subtítulo atualizado.
- [x] Nova página `apps/portal/.../MinhaContaPage.tsx` (rota `/minha-conta`)
  com schema `min(12)` + confirmação + tradução do erro server-side do
  Supabase ("password should be at least…"). Acesso pelo dropdown do header
  ("Minha conta") — antes só existia "Sair".
- [ ] **Passo manual pendente:** em `Authentication → Sign In / Providers →
  Email` na dashboard do Supabase, subir `Minimum password length` para `12`.
  Sem isso, o servidor ainda aceita senhas menores. Documentado em `TODO.md`.
- [x] (Removido) ~~Troca a cada 90 dias~~ — fora do MVP.

### 6.2 Auditoria expandida + log de login (juntas) — código pronto (2026-05-20)
- [x] Migration `0021_eventos_portal.sql`: tabela dedicada (preferida a alargar
  `log_auditoria` para não misturar DML automático com eventos de aplicação) +
  função `registrar_evento_portal(tipo, payload jsonb)` `SECURITY DEFINER` que
  deriva parceiro/usuário do `auth.uid()` (cliente não consegue forjar).
- [x] Helper `apps/portal/src/lib/eventos.ts` (`registrarEvento`) — fire-and-forget,
  injeta `user_agent` do navegador (IP fica null no MVP — exige Edge Function).
- [x] Integrações no portal: `useAuth` (login/login_falha/logout), `useSolicitacoes`
  (solicitacao_criada/solicitacao_cancelada), `MinhaContaPage` (senha_alterada).
- [x] RLS: SELECT só `is_interno()`. INSERT/UPDATE/DELETE direto bloqueado
  (única porta é a função `SECURITY DEFINER`).
- [x] Pentest estendido em `scripts/pentest-rls.mjs` (7 cenários novos).
- [x] Migration aplicada e validada em 2026-05-20 — `npm run pentest:rls`
  reporta **45/45 PASS** (inclusive: função deriva `parceiro_id` do `auth.uid()`
  e ignora `parceiro_id` no payload; anon consegue registrar `portal_login_falha`
  mas não eventos que exigem usuário; RPC rejeita `tipo_evento` desconhecido).

### 6.3 Tela "Segurança" no sistema interno — ✅ concluído (2026-05-20)
- [x] Rota `/seguranca` (PerfilRoute allowed={['admin']}) + item na sidebar
  (seção Sistema) só visível para admin (`canViewSeguranca`).
- [x] Card de destaque no topo: nº de falhas de login nas últimas 24h
  (`useLoginFalhasUltimas24h`) — fica amarelo se ≥ 5.
- [x] Filtros (querystring): período (default 7d), tipo de evento (chips
  multi-select), parceiro (chips). URL compartilhável.
- [x] Tabela paginada 30/pg com data/hora, badge colorido por tipo, parceiro,
  usuário (ou `email_tentado` quando login falhou), link da solicitação +
  user-agent encurtado em tooltip + IP.

### 6.4 Rate limiting diário (50 solicitações/dia/usuário)
- [x] Trigger BEFORE INSERT em `solicitacoes` que conta o dia corrente do
  `parceiro_usuario_id` e bloqueia com erro amigável ao passar de 50
  (migration `0022`, `SECURITY DEFINER`, SQLSTATE `PT429`, dia de calendário
  em `America/Sao_Paulo`, conta todas — ativas e canceladas)
- [x] Mensagem clara no portal quando o erro voltar do banco
  (`traduzirErroBanco` agora detecta `PT429` e mostra toast amigável)
- [ ] (Adiado) Limite global de req/min — exigiria Edge Function ou
  Cloudflare; reavaliar pós-MVP se houver sinal de abuso

### 6.5 README e documentação
- [x] `apps/portal/README.md` — visão geral, como rodar, fluxo de auth,
  estrutura, segurança (RLS/eventos/rate limit), pentest, contatos
- [x] `docs/SPEC-PORTAL.md` atualizada — §7 reescrito (auditoria via
  `eventos_portal`, rate limit 50/dia implementado e 100/min adiado,
  captcha parqueado, senha 12 chars sem complexidade/rotação, tela
  `/seguranca`) e §8 marcado com os blocos do BACKLOG concluídos

### Item parqueado — Captcha no login
- [ ] Provedor a decidir (candidatos: Cloudflare Turnstile, hCaptcha).
  Estrutura de login deve aceitar encaixe futuro sem refactor grande.

### Item parqueado — Ativar React Compiler + migrar `watch()` → `useWatch()`
- [ ] Quando ligarmos o React Compiler (plugin do Vite/Babel) nos dois apps,
  reativar `react-hooks/incompatible-library` no eslint config e trocar todas
  as chamadas `watch('campo')` por `useWatch({ control, name: 'campo' })` —
  são ~13 arquivos com formulários (QuickCreates, CRUDs, NovaSolicitacao).
  Hoje a regra está desligada porque o compiler não está ativo, então o
  warning era ruído puro.

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
4. ✅ **Bloco 2.1** (monorepo + `packages/shared`) — concluído em 2026-05-18.
5. ✅ **Bloco 3** (telas internas de gestão de parceiros) — concluído em
   2026-05-18.
6. ✅ **Bloco 4** (portal: auth, layout, cadastros) — concluído em 2026-05-18.
7. ✅ **Bloco 5** (portal: solicitações) — concluído em 2026-05-19.
8. **Bloco 0.2** (aprovações) — em paralelo, fora do código.
9. **Bloco 6** (segurança e polimento) — última sub-fase.

**Próximo passo de código:** Bloco 6.1 — senha forte (mín. 12 chars, sem
rotação). Em seguida 6.2 (auditoria + log de login), 6.3 (tela Segurança),
6.4 (rate limit diário via trigger), 6.5 (README). Captcha parqueado, a
decidir provedor depois. Pendências paralelas: convite de usuários (Edge
Function), contatos reais de suporte no footer e `eslint.config.js` do
`apps/portal`. Bloco 2.3 fechado em 2026-05-20 (pentest verde + lockdown
do storage aplicado na migration 0020).
