---
version: 1
slug: "apps-interno-src-pages-publico-iniciopage-tsx"
primary_target: "apps/interno/src/pages/publico/InicioPage.tsx"
related_targets: ["apps/interno/src/pages/auth/LoginPage.tsx","apps/portal/src/pages/LoginPage.tsx"]
---

# Primeira tela do SisLog (interno, rota `/`) + login

Scope: `apps/interno/src/pages/publico/InicioPage.tsx` (primeira tela pública), `/sobre` (apresentação + apoio por PIX, restaurada) e o login dos dois apps — o cartão de produção sobre a mesma foto da mina. Visitor mode: Persuade na primeira tela; Operate no login.

Histórico: a cena cinematográfica da cabine no login (2026-10-22) foi descartada pelo Davi ("não ficou muito bom"). Ele pediu reproduzir a primeira dobra do trizy.com.br, com um caminhão caçamba sendo carregado de minério no lugar do baú; botão vermelho para o login e, ao lado, o que é o SisLog + apoio (a página antiga com o PIX). Escolhas dele: login = o cartão de produção (sislog.vercel.app/login) com a foto da mina de fundo (pedido seguinte, mesma noite); primeira tela SEMPRE antes do login (inclusive para atendentes); só no interno.

## Direction contract

THESIS: A primeira tela é a mina trabalhando — uma caçamba sendo carregada — e uma frase de quem acabou com a planilha. Recusa o login-cartão e a landing de SaaS com mockup.

OWN-WORLD: Foto real (Pexels 29506742, marcas de terceiros desfocadas) sob véu escuro com luz quente; Kanit 600 em caixa alta, branco, a marca "SisLog" no laranja LHG; CTA em pílula no fill de acento #CC4100; link secundário em caixa alta com seta. Fora desta tela, nada de degradê nem pílula.

STORY: O visitante entende em uma frase o que é o SisLog, entra pelo botão laranja ou abre "O que é o SisLog" (fluxo, telas e o PIX para apoiar).

FIRST VIEWPORT: Barra transparente (símbolo + SisLog à esquerda; O que é o SisLog, Apoiar e a pílula Entrar à direita); título enorme centralizado em duas linhas; frase de apoio; CTA "Entrar no SisLog →" e link "O que é o SisLog →" lado a lado (empilhados no celular). Foto em tela cheia, sem rolagem.

FORM: primeira dobra no estilo trizy.com.br, pedida pelo usuário (brief fixado; sem sorteio). seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
