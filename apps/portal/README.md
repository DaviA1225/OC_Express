# Portal de Parceiros — SisLog LHG

Portal web isolado para transportadoras parceiras criarem solicitações de
carregamento que caem direto na inbox interna da LHG. O parceiro só enxerga
os próprios dados; a equipe LHG vê e acessa tudo o que ele faz.

> Fontes de verdade da fase 8: `docs/SPEC-PORTAL.md`, `docs/SPEC-PATCH-PAMCARD.md`
> e o checklist `docs/BACKLOG-PORTAL.md`.

## Stack

React 19 · TypeScript · Vite · Tailwind + shadcn/ui · react-router v7 ·
@tanstack/react-query · react-hook-form + zod · sonner · lucide-react.
Banco: Supabase Postgres (mesma instância usada pelo sistema interno).

Identidade visual: azul `#1E40AF`. Tela cheia até 720px nos formulários.

## Como rodar

A partir da **raiz do monorepo** (`OC_Express/`):

```sh
npm install                              # instala todos os workspaces
npm run dev:portal                       # vite dev em :5173 (use --port se preciso)
npm run build:portal                     # produção (tsc + vite build)
npm run lint --workspace @sislog/portal  # eslint
```

> Quando rodar interno e portal ao mesmo tempo, suba o portal em outra porta:
> `npm run dev:portal -- --port 5174 --strictPort`.

### Variáveis de ambiente

Copie `apps/portal/.env.example` para `apps/portal/.env.local` e preencha:

```
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

O portal aponta para a **mesma instância** Supabase do sistema interno.

## Estrutura

```
apps/portal/src/
  App.tsx                       rotas (lazy) e providers
  hooks/useAuth.tsx             sessão + perfil do parceiro
  lib/supabase.ts               cliente Supabase
  lib/eventos.ts                auditoria via RPC registrar_evento_portal
  components/layout/            header, nav horizontal, footer
  components/ProtectedRoute.tsx redireciona para /login se sem sessão
  components/shared/            Combobox, ConfirmDialog, CrudListPage, EmptyState
  components/ui/                primitivos shadcn (copiados do interno)
  components/solicitacoes/      StatusBadge, QuickCreate
  features/cadastros/           useParceiroCrud (genérico para as 4 bases)
  features/solicitacoes/        useSolicitacoes, status amigáveis
  features/anexos/              upload e listagem via storage solicitacoes-anexos
  pages/LoginPage.tsx
  pages/MinhaContaPage.tsx      troca de senha (zod min(12) — Bloco 6.1)
  pages/cadastros/              motoristas, veículos, carretas, subcontratadas
  pages/solicitacoes/           lista, nova, detalhe
  pages/UsuariosPage.tsx        admin do parceiro gerencia operadores
```

Componentes compartilhados entre interno e portal (tipos do banco, validators,
formatters, factory do client) ficam em `packages/shared` (`@sislog/shared`).

## Autenticação

- Login com **e-mail/senha** via Supabase Auth (`signInWithPassword`).
- Sessão persistida pelo `supabase-js`; `useAuth` resolve o vínculo em
  `parceiro_usuarios` (perfil `admin_parceiro` ou `operador_parceiro`) e a
  empresa parceira (tabela `parceiros`).
- `ProtectedRoute` exige sessão; o `PortalLayout` esconde itens admin de
  operadores normais via `hasPerfilParceiro`.
- `loadPerfil` é diferido com `setTimeout(0)` dentro do `onAuthStateChange`
  para evitar o deadlock conhecido do supabase-js.
- Senha mínima: **12 caracteres** (validado no front; o server-side fica em
  *Authentication → Sign In / Providers → Email → Minimum password length*
  na dashboard do Supabase).

Convite de novos usuários ainda não está implementado (depende de uma Edge
Function — adiado conforme `BACKLOG-PORTAL.md`).

## Segurança

O portal vive sobre as garantias do banco — o front é só uma camada
conveniente:

- **RLS** restringe leitura/escrita por `parceiro_id = get_current_parceiro_id()`
  em todas as tabelas `parceiro_*`.
- **`solicitacoes` não tem SELECT policy** para o parceiro. A leitura sai pela
  view `portal_solicitacoes` (`SECURITY DEFINER`). Como não há SELECT direto,
  o INSERT gera o `id` no cliente (`crypto.randomUUID`) para conhecer o
  destino da redireção.
- **`clientes_publicos`**: view que expõe só `id, razao_social, cidade, uf`
  dos clientes ativos da LHG — nunca frete, status, contatos etc.
- **Storage `solicitacoes-anexos`** filtrado por
  `solicitacao_pertence_ao_parceiro_logado()`.
- **Auditoria (`eventos_portal`)**: única porta de escrita é a função
  `registrar_evento_portal` (`SECURITY DEFINER`) — o cliente não consegue
  forjar `parceiro_id`, ela deriva do `auth.uid()`. Eventos:
  `portal_login`, `portal_login_falha`, `portal_logout`,
  `portal_solicitacao_criada`, `portal_solicitacao_cancelada`,
  `portal_senha_alterada`.
- **Rate limit diário**: trigger `BEFORE INSERT` em `solicitacoes`
  (migration `0022`) bloqueia a 51ª solicitação do dia (calendário em
  `America/Sao_Paulo`) por `parceiro_usuario_id` com SQLSTATE `PT429`. O
  contador inclui canceladas — criar+cancelar não burla. `traduzirErroBanco`
  detecta o código e mostra o toast amigável.

Pentest reexecutável: `npm run pentest:rls` na raiz. Cobre isolamento entre
parceiros, bloqueio de leitura direta em `solicitacoes`, storage,
`eventos_portal` e rate limit. **49/49 PASS** hoje.

## Fluxos principais

- **/solicitacoes** — grid de cards (status amigáveis da SPEC 5.3), busca,
  filtros de status e período. URL compartilhável.
- **/solicitacoes/nova** — formulário tela cheia (720px), comboboxes com
  quick-create de motorista/veículo/carreta/subcontratada, Pamcard, anexos
  opcionais (imagens/PDF até o limite do bucket). O material é deixado em
  branco — a equipe interna define no processamento (SPEC 5.5).
- **/solicitacoes/:id** — dados + linha do tempo. Cancelamento só em status
  `recebida`.
- **/motoristas, /veiculos, /carretas, /subcontratadas** — CRUDs do parceiro
  (genéricos via `useParceiroCrud`).
- **/usuarios** — só admin: lista, edita perfil, desativa usuários.
- **/minha-conta** — troca de senha (12+ chars).

## Contatos de suporte

Hoje placeholders em `PortalLayout.tsx` (`SUPORTE_EMAIL`,
`SUPORTE_WHATSAPP`). **Trocar pelos contatos reais antes do go-live.**
