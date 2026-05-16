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

## Bloco 1 — Decisões de design de segurança (resolver antes de codar)

RLS no Postgres é **por linha, não por coluna**. Resolver estes pontos evita
vazar dado sensível para o concorrente mesmo com RLS "correta".

- [ ] ⚠ **VIEW `portal_solicitacoes`** — o portal deve ler solicitações por uma
  view que expõe só colunas seguras. A tabela `solicitacoes` crua contém
  `numero_instrucao` (nº da instrução Protheus), `pdf_url`, `atendente_id`,
  `documentado_por` e observações internas — um parceiro consultando a API
  REST direto receberia a linha inteira.
- [ ] ⚠ **VIEW/RPC `clientes_publicos`** — resolve a contradição entre SPEC 4.5
  (bloquear `clientes` para externos) e 5.5 (parceiro escolhe cliente da LHG).
  Expor apenas `id` + `nome`; nunca `frete_*`, `liberado`, observações.
- [ ] ⚠ Separar observações do parceiro de notas internas em `solicitacoes`
  (campo `observacoes` hoje é único e seria compartilhado).
- [ ] ⚠ Definir gerenciador de workspaces: npm workspaces vs pnpm.
- [ ] ⚠ Definir estratégia de migração do `frontend/` atual → `apps/interno`
  (mover tudo de uma vez vs incremental).

---

## Bloco 2 — Fase 8.1: Monorepo + Modelo de dados

### 2.1 Reestruturação para monorepo
- [ ] Migrar `frontend/` → `apps/interno/` (ajustar todos os imports e paths)
- [ ] Criar `packages/shared/` com tipos, validadores e `lib/supabase`
- [ ] Criar `apps/portal/` (esqueleto Vite + React + TS + Tailwind + shadcn)
- [ ] Configurar workspaces no `package.json` raiz
- [ ] Confirmar build/dev independentes de cada app
- [ ] Ajustar `vercel.json` / deploy para os dois apps

### 2.2 Migration das tabelas de parceiro
- [ ] `parceiros` (razão social, CNPJ, contato, código interno, observações internas)
- [ ] `parceiro_usuarios` (FK auth.users, perfil `admin_parceiro`/`operador_parceiro`)
- [ ] `parceiro_motoristas` — UNIQUE (parceiro_id, cpf)
- [ ] `parceiro_veiculos` — UNIQUE (parceiro_id, placa)
- [ ] `parceiro_carretas` — UNIQUE (parceiro_id, placa)
- [ ] `parceiro_subcontratadas` — UNIQUE (parceiro_id, cnpj) quando não nulo
- [ ] Patch em `solicitacoes`: colunas `parceiro_id`, `parceiro_usuario_id`,
  `parceiro_motorista_id`, `parceiro_veiculo_id`, `parceiro_carreta_id`,
  `parceiro_subcontratada_id`
- [ ] CHECK de integridade `origem='parceiro'` (campos parceiro obrigatórios,
  campos internos NULL) e vice-versa
- [ ] CHECK `material_id` obrigatório fora dos status `recebida`/`cancelada`

### 2.3 RLS
- [ ] Funções `get_current_parceiro_id()` e `is_interno()`
- [ ] Políticas SELECT/INSERT/UPDATE nas 4 tabelas `parceiro_*`
- [ ] Políticas em `parceiros` e `parceiro_usuarios` (admin_parceiro gerencia usuários)
- [ ] Políticas em `solicitacoes` (parceiro vê/cria as suas, cancela enquanto `recebida`)
- [ ] Políticas restritivas em todas as tabelas internas (`motoristas`,
  `veiculos`, `carretas`, `clientes`, `materiais`, `subcontratadas`,
  `perfis_usuarios`) — `USING (is_interno())`
- [ ] RLS nas views `portal_solicitacoes` e `clientes_publicos`
- [ ] **Teste de penetração de RLS**: logar como parceiro A e tentar ler dados
  de parceiro B, dados internos e colunas sensíveis via API REST

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

1. **Bloco 0.1** (Patch Pamcard) — gargalo, independente do portal, faça já.
2. **Bloco 1** (decisões de segurança) — barato, evita retrabalho caro depois.
3. **Bloco 0.2** (aprovações) — em paralelo, fora do código.
4. Blocos 2 → 6 na ordem das sub-fases do SPEC.
