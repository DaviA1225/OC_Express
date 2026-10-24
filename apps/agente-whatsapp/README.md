# @sislog/agente-whatsapp

Agente de IA que atende o WhatsApp da OC Express: recebe mensagens pela **UAZAPI**,
entende texto, áudio (transcrito pela OpenAI), foto e PDF, opera o SisLog com o próprio
usuário (perfil `assistente`) e responde. Cérebro: **Claude Opus 5.5** com ferramentas.

Especificação, decisões e fases: **`docs/SPEC-AGENTE-IA.md`**.

## Estrutura

```
api/whatsapp.ts          webhook UAZAPI: confere o token da instância → grava e agenda
src/processar.ts         rajada, cadeado da conversa, mídia, ciclo do agente, resposta
src/agente/loop.ts       ciclo Claude + ferramentas (histórico append-only)
src/agente/ferramentas.ts tudo o que o agente pode fazer no SisLog
src/agente/prompt.ts     prompt de sistema (estático: entra no cache)
src/uazapi.ts            UAZAPI: leitura e filtro do webhook, mídia, envio
src/midia.ts             bucket agente-midia, transcrição, Files API
src/supabase.ts          sessão do usuário do agente via Edge Function `agente-sessao`
```

Variáveis: ver `.env.example`.

## Dev

```bash
npm install                                        # na raiz do monorepo
npm run typecheck --workspace @sislog/agente-whatsapp
npm run dev --workspace @sislog/agente-whatsapp    # vercel dev em http://localhost:3000
```

## Deploy

Projeto Vercel separado com Root Directory `apps/agente-whatsapp` (convenção do monorepo).
Depois do primeiro deploy, apontar o webhook da instância UAZAPI para
`https://<app>.vercel.app/api/whatsapp`, só com o evento `messages` e os filtros
`wasSentByApi`, `fromMeYes` e `isGroupYes` (comando na SPEC, §7). Checklist completo na SPEC, §7.
