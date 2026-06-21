---
target: Relatórios
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-06-21T16-44-48Z
slug: ps-interno-src-pages-relatorios-relatoriospage-tsx
---
# Re-critique — Relatórios (`apps/interno/src/pages/relatorios/RelatoriosPage.tsx`)

## Design Health Score

| # | Heuristic | Antes | Agora | Nota |
|---|-----------|:---:|:---:|------|
| 1 | Visibility of System Status | 3 | **4** | Estado de erro visível + export |
| 2 | Match System / Real World | 4 | 4 | — |
| 3 | User Control and Freedom | 3 | 3 | — |
| 4 | Consistency and Standards | 2 | **4** | KPI monocromático + gráficos no laranja LHG (como Dashboard/DESIGN.md) |
| 5 | Error Prevention | 3 | 3 | — |
| 6 | Recognition Rather Than Recall | 4 | 4 | — |
| 7 | Flexibility and Efficiency | 3 | 3 | — |
| 8 | Aesthetic and Minimalist | 3 | **4** | Resíduo "dashboard de IA" eliminado |
| 9 | Error Recovery | 2 | **4** | Estado de erro com "tentar de novo" |
| 10 | Help and Documentation | 4 | 4 | — |
| **Total** | | **31** | **37/40** | **Excelente** |

## Resolvido nesta passada (alinhar ao reskin)
- [P2] KPI cards: chips pastel (azul/esmeralda/índigo/âmbar) → monocromático (caixa neutra + ícone grafite), como o Dashboard.
- [P2] Cores de gráfico on-brand: linha "Volume diário" e barra "Média" do TMA → laranja LHG `#FF5100` (idênticas ao Dashboard); secundário neutro `#6B7280` (documentado). Distribuição por material mantém multi-hue, liderada por laranja.
- [P2] Estado de erro: `ds.isError` mostra "Não foi possível carregar · Tentar de novo" (antes: "Sem dados").
- [P3] a11y dos gráficos: `role`/`aria-label` + `accessibilityLayer` nos 3 gráficos (como o Dashboard).
- Bônus: cor de eixo `#64748b` → `#6B7280` (paleta documentada) — detector 0 hits.
