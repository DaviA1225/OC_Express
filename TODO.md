# SisLog — Pendências

Lista do que ficou em aberto após a fase de testes com a equipe. Atualizar conforme evoluir.

---

## Endurecimento pós-testes (prioridade ao validar com gestor)

- [x] **RLS por perfil** — migration `0025_rls_por_perfil.sql`. Substitui o INSERT/UPDATE/DELETE `is_interno()` das tabelas internas por checagem de perfil, **espelhando exatamente** a matriz do front (`apps/interno/src/features/auth/permissions.ts`):
  - Operacionais (`subcontratadas/motoristas/veiculos/carretas`): escrita p/ `admin/analista/assistente` (assistente precisa do quick-create na Nova Solicitação).
  - `clientes`: `admin/gerente/supervisor/analista`. `materiais` e `cargas_retorno`: `admin/supervisor/analista`. (SELECT segue liberado a todo interno.)
  - `perfis_usuarios`: só `admin` escreve. Edição do próprio nome saiu do UPDATE direto → RPC `atualizar_meu_nome` (SECURITY DEFINER, só `nome_completo`, sem escalonamento). `PerfilPage.tsx` ajustada.
  - `log_auditoria`: leitura `admin/gerente/supervisor`; UPDATE/DELETE só `admin`.
  - Helper novo `meu_perfil_interno()` (SECURITY DEFINER, evita recursão de RLS).
  - Front: quick-create de cliente na Nova Solicitação agora gated por `canEditClientes` (some para assistente). `cargas_retorno` estava em `USING(true)` (brecha — qualquer authenticated, até parceiro externo, escrevia) — fechada aqui.
  - ✅ **Pentest estendido (`scripts/pentest-rls.mjs`)** — semeia 5 usuários internos (um por perfil) e valida a matriz de escrita tabela a tabela, anti-escalonamento em `perfis_usuarios` (UPDATE direto p/ `perfil='admin'` bloqueado), RPC `atualizar_meu_nome` (muda só o nome), e leitura de `log_auditoria` por perfil. **107/107 PASS.**
  - **Fora de escopo (decisão à parte):** restringir `solicitacoes`/`solicitacao_anexos` por perfil — o front já g-ateia via `canEditSolicitacoes`; RLS aqui é defense-in-depth a tratar depois.
- [x] **Bucket `ocs-pdf` privado** — migration `0026_ocs_pdf_privado.sql`: bucket vira privado + policies do storage exigem `is_interno()` (parceiro não acessa OC). Front: `GerarOCDialog` guarda o **path** em `pdf_url` (não mais URL pública); helper `features/pdf-generator/ocPdf.ts` (`ocPdfStoragePath` trata registros antigos com URL pública + `getOcPdfSignedUrl`); "Abrir PDF" no detalhe gera signed URL de 1h sob demanda (`AbrirPdfLink`); envio WhatsApp gera signed URL de **7 dias** e injeta na mensagem (`WhatsAppEnvioDialog` + `formatOCWhatsAppMessage(s, pdfUrl?)`); export da lista mostra "Sim" em vez do path. Card "Avisar o parceiro" deixou de incluir o link do PDF (correto: OC tem dado do motorista LHG, não vai p/ concorrente). Validado no pentest (parceiro não baixa nem assina PDF; URL pública dá 400). ⚠️ **Lição:** `UPDATE storage.buckets SET public=false` falha no SQL Editor (role sem privilégio de UPDATE na tabela, só INSERT) e **aborta a transação inteira** — por isso a 0026 foi reescrita com o UPDATE dentro de `DO ... EXCEPTION WHEN insufficient_privilege`. Para tornar bucket privado, usar Dashboard ou `storage.updateBucket(..., { public:false })`.
- [x] **Idempotência WhatsApp** — migration `0027_solicitacoes_external_msg_id.sql`: coluna `external_msg_id text` (nullable) + índice único parcial `uq_solicitacoes_external_msg_id` (`WHERE external_msg_id IS NOT NULL` — vários NULL convivem). Não exposta ao portal (`portal_solicitacoes` não inclui). Tipo alinhado em `@sislog/shared` (Row+Insert). Sem wiring no front — é pré-requisito do futuro agente de IA (`docs/AGENT_CONTEXT.md`), que grava o ID da mensagem e deixa o índice barrar reinserção. **Pendente:** aplicar a migration no Supabase.

## Operacional / quality of life ainda em aberto

- [ ] **Presence / lock de edição** — usar realtime do Supabase para mostrar "Fulano está editando #0287 agora" e evitar dois atendentes salvarem por cima. ~1 sessão de trabalho, alto valor para equipe de 10–15 pessoas.
- [ ] **Templates de mensagem WhatsApp** variados — além do template padrão de OC, criar para cancelamento, atraso, "já saiu". Provavelmente edição em `features/whatsapp/whatsapp.ts`.
- [ ] **Tracking público da OC** — URL com hash que o cliente abre sem login para ver status atual. Tabela `tokens_publicos` ou view + signed link.

## Grande projeto separado

- [ ] **Agente IA do WhatsApp** — descrito em `docs/AGENT_CONTEXT.md`. Recebe mensagens, faz parsing com Claude, cria solicitações como perfil `assistente`. Backend novo (Node/Python), fora do repo `frontend/`.

---

## Notas de deploy

- Hospedagem: Vercel (Hobby/free) ligado ao GitHub, autodeploy em `main`.
- Variáveis de ambiente no Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Supabase: aplicar migration `0014_solicitacao_anexos.sql` antes do primeiro teste com a equipe; adicionar a URL do Vercel em **Auth → URL Configuration → Redirect URLs**.

## Configuração server-side (Bloco 6.1 — senha forte)

Passo manual a aplicar na dashboard do Supabase, em **Authentication → Sign In / Providers → Email** (autoritativo, vale para todos os endpoints `signUp`/`updateUser` em ambos os apps):

- **Minimum password length:** 12
- **Password requirements (recomendado):** ao menos `Letters and digits` (subir para `Lowercase, uppercase, digits and symbols` se TI da J&F exigir)

Com isso, mesmo que alguém contorne o zod do front, o servidor barra senhas menores que 12 chars. A UX no front exibe mensagem amigável antes do submit (`apps/interno/.../PerfilPage.tsx` e `apps/portal/.../MinhaContaPage.tsx`).

## Convite de usuários do portal — Edge Function `convidar-parceiro-usuario`

### 1. Migration nova
- `supabase/migrations/0023_eventos_portal_usuario_convidado.sql` — amplia CHECK do `tipo_evento` e atualiza `registrar_evento_portal` para aceitar `portal_usuario_convidado`. Aplicar via `supabase db push` ou pelo SQL Editor.

### 2. Deploy da Edge Function
Pré-requisito: `npx supabase login` (abre browser) e `npx supabase link --project-ref pwufbvneqfyyqnmfxzyw`.

```bash
npx supabase functions deploy convidar-parceiro-usuario
```

A função usa as env vars que o Supabase já injeta automaticamente em todas as Edge Functions (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — **não precisa** configurar secrets adicionais.

### 3. Allowlist de Redirect URLs (Supabase Dashboard)
Em **Authentication → URL Configuration → Redirect URLs**, adicionar:
- `https://<portal-em-prod>.vercel.app/aceitar-convite` (produção)
- `http://localhost:5174/aceitar-convite` (dev local)

Sem essa entrada, o link mágico do e-mail de convite leva o usuário a uma página de erro do Supabase em vez do portal.

### 4. Template de e-mail (opcional, recomendado)
Em **Authentication → Email Templates → Invite user**, ajustar o copy do e-mail (assunto, mensagem) — o padrão do Supabase é em inglês. Por enquanto fica como está; revisar pós-MVP.

### 5. Como testar
1. Logar no portal como `admin_parceiro`.
2. Ir em **Usuários** → "Convidar usuário".
3. Preencher e-mail/nome/perfil e enviar.
4. Conferir no Supabase Inbucket local (`http://127.0.0.1:54324`) **se rodando local** ou na caixa de entrada real **se produção** que o e-mail chegou.
5. Clicar no link → cair em `/aceitar-convite` → definir senha → entrar no portal.

### 6. Limitações conhecidas
- Sem feedback de "usuário aceitou o convite" — o admin que convidou não vê quando o convidado concluiu. Para visibilidade, consultar `parceiro_usuarios.created_at` vs `auth.users.last_sign_in_at`.
- Reenvio de convite expirado ainda não implementado. Por enquanto: desativar o usuário e convidar novamente com o mesmo e-mail (ou ressuscitar manualmente o usuário em `auth.users`).
