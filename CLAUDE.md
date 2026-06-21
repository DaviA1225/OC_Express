# CLAUDE.md

Orientações para agentes de IA que trabalham neste repositório (monorepo SisLog LHG
— sistema interno, portal de parceiros e agente de WhatsApp).

## Fontes de verdade
- **Domínio / dados / fases:** `docs/SPEC.md`
- **Visual / interação:** `docs/SPEC-FRONTEND.md` (prevalece em questões visuais)
- **Portal de parceiros:** `docs/SPEC-PORTAL.md`, `docs/BACKLOG-PORTAL.md`

## Design Context (Impeccable)
Antes de qualquer trabalho de UI, leia:
- **`PRODUCT.md`** — registro (`product`), usuário-foco (atendentes da operação),
  propósito, personalidade (industrial, sóbrio, eficiente), anti-referências e
  princípios estratégicos.
- **`DESIGN.md`** — sistema visual: estrutura grafite neutra com **laranja LHG
  #FF5100 como acento único** (azul #1E40AF no portal), cantos retos, plano por
  padrão, Kanit + Wanted Sans. Tokens no frontmatter; regras nas seções.

Direção curta: "A Sala de Controle" — painel de operação denso, não landing de
startup. O acento ocupa ≤10% da tela. **Evitar o look de IA/SaaS** (gradientes,
chips pastel, cards aninhados, saudação consumer, Inter-para-tudo, ícone em
quadradinho acima de títulos, eyebrow uppercase).

A skill **`/impeccable`** está instalada em `.claude/skills/` (comandos como
`/impeccable critique`, `audit`, `polish`, `document`). Um hook PostToolUse roda o
detector de anti-padrões após edições de UI.
