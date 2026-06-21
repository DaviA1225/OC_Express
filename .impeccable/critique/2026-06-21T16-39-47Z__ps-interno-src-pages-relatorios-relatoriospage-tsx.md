---
target: Relatórios
total_score: 31
p0_count: 0
p1_count: 0
timestamp: 2026-06-21T16-39-47Z
slug: ps-interno-src-pages-relatorios-relatoriospage-tsx
---
# Critique — Relatórios (`apps/interno/src/pages/relatorios/RelatoriosPage.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:---:|------|
| 1 | Visibility of System Status | 3 | Skeletons + export; sem visibilidade de erro |
| 2 | Match System / Real World | 4 | Domínio claro, TMA explicado |
| 3 | User Control and Freedom | 3 | Presets de período + export; sem range custom/drill |
| 4 | Consistency and Standards | **2** | KPI chips pastel + gráficos azuis contrariam o reskin/DESIGN.md |
| 5 | Error Prevention | 3 | Analytics read-only |
| 6 | Recognition Rather Than Recall | 4 | Gráficos + legendas + listas textuais |
| 7 | Flexibility and Efficiency | 3 | Presets + CSV |
| 8 | Aesthetic and Minimalist | 3 | Resíduo "dashboard de IA": chips pastel + linha azul |
| 9 | Error Recovery | **2** | Falha de fetch vira "Sem dados" |
| 10 | Help and Documentation | 4 | Subtítulos explicam cada card |
| **Total** | | **31/40** | **Bom — ficou atrás do reskin** |

## Anti-Patterns Verdict
**LLM:** o problema é **inconsistência com o sistema já estabelecido** — esta tela não foi atualizada no reskin. KPI cards com **chips de ícone pastel coloridos** (`bg-blue-50`/`text-blue-600`, esmeralda, índigo, âmbar) são exatamente o anti-padrão que o `DESIGN.md` proíbe e que removemos do Dashboard. **Detector:** 1 advisory (`#64748b`, cor de eixo).

## What's Working
- Conjunto rico de relatórios (KPIs, volume, TMA por status, 5 Top-10, distribuição por material) + **export CSV** completo.
- Cards planos (on-DESIGN.md), `PeriodoTabs` com `aria-selected`, listas textuais sob os gráficos (bom p/ leitor de tela).
- Subtítulos explicativos em cada card.

## Priority Issues
- **[P2] KPI cards com chips pastel coloridos** (azul/esmeralda/índigo/âmbar) — o anti-padrão removido no Dashboard. Neutralizar p/ monocromático (caixa neutra + ícone grafite), como o Dashboard. → `/impeccable colorize`/`polish`
- **[P2] Cores de gráfico off-brand.** Linha "Volume diário" em azul `#3b82f6`; no Dashboard a MESMA é laranja `#FF5100`. TMA usa azul. Alinhar ao acento da marca (laranja primário, neutro/emerald secundário). → `/impeccable colorize`
- **[P2] Sem estado de erro.** `ds.isError` não tratado → falha de fetch vira "Sem dados no período" (mente). → `/impeccable harden`
- **[P3] a11y dos gráficos** — sem `aria-label`/sr-only nos containers (o Dashboard já tem). → `/impeccable harden`

## Persona Red Flags
**Gestor (PRODUCT.md, usuário-foco daqui):** lê KPIs e tendências; o visual destoar do resto do sistema enfraquece a credibilidade institucional (PRODUCT.md valoriza sobriedade).
**Sam (a11y):** listas textuais ajudam; faltam aria-labels nos gráficos (Dashboard já resolveu).

## Questions to Consider
- O "Volume diário" deve ficar idêntico ao do Dashboard (mesma cor/forma)?
- A distribuição por material (categórica) mantém o multi-hue ou alinha ao acento?
