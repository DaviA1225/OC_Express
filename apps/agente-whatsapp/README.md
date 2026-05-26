# @sislog/agente-whatsapp

Agente de IA que recebe mensagens de WhatsApp via **Meta Cloud API** e cria solicitações de OC no SisLog usando **Claude Haiku 4.5** para extração estruturada.

Faz parte do monorepo SisLog LHG. Referência completa em `docs/AGENT_CONTEXT.md`.

## Estrutura

```
apps/agente-whatsapp/
  api/
    whatsapp.ts     ← webhook Meta (GET verify + POST inbound com HMAC)
  src/
    config.ts       ← env loading com validação fail-fast
    supabase.ts     ← cliente autenticado como o usuário "assistente" do agente
  vercel.json       ← runtime Node 5.x para /api/**.ts
  tsconfig.json
  .env.example
```

## Pré-requisitos antes do primeiro deploy

1. **Usuário do agente no Supabase**: criar conta em `auth.users` + linha em `perfis_usuarios` com `perfil='assistente'`. Ver `docs/AGENT_CONTEXT.md §6.1`.
2. **Conta Meta WhatsApp Business**: app criado + número de teste aprovado + System User com token permanente.
3. **Anthropic API key**: console.anthropic.com → API keys.
4. **Migration 0032** aplicada (adiciona `origem='whatsapp'` aos valores aceitos).

## Variáveis de ambiente

Copiar `.env.example` para `.env.local` e preencher. Para produção, configurar via Vercel Dashboard.

| Var | Origem |
|---|---|
| `META_VERIFY_TOKEN` | Você escolhe (string aleatória). Usada no GET handshake. |
| `META_APP_SECRET` | Meta App → Settings → Basic → App Secret. Usado pra HMAC. |
| `META_WA_TOKEN` | System User token permanente do Meta Business Manager. |
| `META_PHONE_NUMBER_ID` | Meta dashboard → WhatsApp → API Setup → "From" → Phone number ID. |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `ANTHROPIC_MODEL` | Default `claude-haiku-4-5-20251001`. |
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API. |
| `SUPABASE_ANON_KEY` | idem. |
| `SUPABASE_AGENT_EMAIL` | E-mail do usuário do agente. |
| `SUPABASE_AGENT_PASSWORD` | Senha (≥ 12 chars). |

## Dev local

```bash
# Instalar dependências (do root do monorepo)
npm install

# Subir o serverless local em http://localhost:3000
npm run dev --workspace @sislog/agente-whatsapp
```

Para testar o GET do Meta:
```
GET /api/whatsapp?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=ping
→ 200 "ping"
```

## Deploy

Cada app do monorepo é projeto Vercel separado com Root Directory na subpasta — convenção do repo (ver memory `project_vercel_deploy`).

1. Criar projeto novo no Vercel apontando para `apps/agente-whatsapp`
2. Configurar todas as env vars
3. Após o primeiro deploy, copiar a URL pública (`https://<app>.vercel.app/api/whatsapp`) para o **Webhook URL** do Meta App → WhatsApp → Configuration
4. Colar o mesmo `META_VERIFY_TOKEN` no campo "Verify Token" do Meta e clicar Verify and Save

## Próximas iterações (escopo aberto)

- [ ] Parse do payload Meta (`entry[].changes[].value.messages`)
- [ ] Pipeline Claude com `tool_use` para extrair `{tipo, motorista, placa_cavalo, placa_carreta, cliente, material, observacoes}`
- [ ] Resolução de IDs no banco (motorista por CPF/nome, veículo por placa, etc.)
- [ ] INSERT idempotente em `solicitacoes` com `external_msg_id = wamid`, `origem = 'whatsapp'`
- [ ] Resposta automática para o solicitante via Meta Cloud API confirmando criação
- [ ] Tratamento de mensagens com mídia (anexos → bucket `solicitacoes-anexos`)
- [ ] Geração de PDF da OC server-side (portar `OCDocument.tsx` para `packages/shared/pdf`)
- [ ] Envio do PDF (signed URL 7 dias) pelo WhatsApp ao final do fluxo
