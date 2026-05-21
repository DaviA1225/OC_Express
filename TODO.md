# SisLog — Pendências

Lista do que ficou em aberto após a fase de testes com a equipe. Atualizar conforme evoluir.

---

## Endurecimento pós-testes (prioridade ao validar com gestor)

- [ ] **RLS por perfil** — hoje policies são permissivas (`USING (true)` para todo `authenticated`). Substituir por checagem em `perfis_usuarios.perfil`:
  - Cadastros (`clientes`, `materiais`, `cargas_retorno`): `INSERT/UPDATE/DELETE` apenas para `admin/gerente/supervisor`; `analista/assistente` só `SELECT`.
  - `perfis_usuarios`: só `admin` modifica.
  - `log_auditoria`: leitura restrita a `admin/gerente/supervisor`.
  - `solicitacao_anexos`: avaliar regra por `uploaded_by` ou `atendente_id` da solicitação.
- [ ] **Bucket `ocs-pdf` privado** — converter em privado e usar signed URLs (mesmo padrão de `solicitacoes-anexos`). PDF contém nome/CPF do motorista, placa, etc.
- [ ] **Idempotência WhatsApp** — adicionar coluna `external_msg_id text UNIQUE` em `solicitacoes`. Pré-requisito para o futuro agente de IA não duplicar mensagens reprocessadas.

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
