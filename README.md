# SisLog LHG

Monorepo do SisLog LHG — sistema interno de operação, portal de parceiros e
agente de WhatsApp. Gera Ordens de Carregamento (OC) em PDF e gerencia todo o
fluxo de solicitações, cadastros e relatórios.

> Orientações para agentes de IA e fontes de verdade do domínio estão em
> [`CLAUDE.md`](CLAUDE.md), [`docs/SPEC.md`](docs/SPEC.md) e
> [`docs/SPEC-FRONTEND.md`](docs/SPEC-FRONTEND.md).

## Estrutura

```
OC_Express/
├── apps/
│   ├── interno/            # App do time interno (React + Vite + TS)
│   ├── portal/             # Portal de parceiros (React + Vite + TS)
│   └── agente-whatsapp/    # Agente de WhatsApp
├── packages/
│   └── shared/             # Tipos, formatadores e validadores compartilhados
├── supabase/
│   ├── migrations/         # Migrations SQL (aplicadas no remoto)
│   └── functions/          # Edge Functions (Deno): convite, exclusão e
│                           #   download de OC de parceiro
└── docs/                   # SPECs de domínio, frontend e portal
```

A geração do PDF da OC acontece **no frontend interno**
(`apps/interno/src/features/pdf-generator/`, via `@react-pdf/renderer`); o
arquivo é guardado no bucket privado `ocs-pdf` no Supabase.

## Requisitos

- Node.js 20+
- Conta/projeto Supabase (o banco e a autenticação são o backend)

## Setup

```bash
npm install                 # instala todos os workspaces
```

Cada app lê suas variáveis de um `.env` local (padrão Vite, prefixo `VITE_`).
Veja o `.env.example` de cada app em `apps/*`.

## Scripts (raiz)

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe o app interno em modo dev |
| `npm run dev:portal` | Sobe o portal de parceiros |
| `npm run dev:agente` | Sobe o agente de WhatsApp |
| `npm run build` | Build de produção do app interno |
| `npm run build:portal` | Build de produção do portal |
| `npm run build:all` | Build dos dois apps + typecheck do agente |
| `npm run lint` | ESLint do app interno |
| `npm run db:status` | Lista o estado das migrations no remoto |
| `npm run db:push` | Aplica migrations pendentes no remoto |
| `npm run pentest:rls` | Roda os testes de RLS |

## Deploy

Cada app é um projeto Vercel separado, com **Root Directory** apontando para a
subpasta correspondente (`apps/interno`, `apps/portal`). As Edge Functions e
migrations vivem no Supabase e são publicadas à parte
(`supabase functions deploy <nome>` e `npm run db:push`).
