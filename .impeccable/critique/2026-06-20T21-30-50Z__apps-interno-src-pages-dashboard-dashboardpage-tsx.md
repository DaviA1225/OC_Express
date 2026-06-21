---
target: Dashboard
total_score: 31
p0_count: 0
p1_count: 0
timestamp: 2026-06-20T21-30-50Z
slug: apps-interno-src-pages-dashboard-dashboardpage-tsx
---
# Re-critique — Dashboard (`apps/interno/src/pages/dashboard/DashboardPage.tsx`)

## Design Health Score

| # | Heuristic | Antes | Agora | Nota |
|---|-----------|:---:|:---:|------|
| 1 | Visibility of System Status | 3 | **4** | Estado operacional sempre visível + estados de erro com retry |
| 2 | Match System / Real World | 3 | 3 | — |
| 3 | User Control and Freedom | 3 | 3 | Ainda sem range custom |
| 4 | Consistency and Standards | 3 | **4** | Afordância padronizada nos 3 cards "Top"; KPIs coesos |
| 5 | Error Prevention | 3 | 3 | Read-only |
| 6 | Recognition Rather Than Recall | 3 | 3 | Drill aumentou descoberta |
| 7 | Flexibility and Efficiency | 2 | **3** | KPIs clicáveis (drill p/ fila filtrada) |
| 8 | Aesthetic and Minimalist | 3 | 3 | Grade 4-up idêntica eliminada (herói × volume) |
| 9 | Error Recovery | 2 | **3** | Falha de fetch deixou de virar "Sem dados" |
| 10 | Help and Documentation | 2 | 2 | Sem tooltip de definição de métrica |
| **Total** | | **27** | **31/40** | **Bom — base sólida** |

## Anti-Patterns Verdict
**LLM:** o resíduo de cliché (fileira de 4 KPIs idênticos) foi eliminado — agora há hierarquia: herói operacional (Pendentes/Atrasadas) × faixa de volume. Não parece template.
**Detector:** 0 hits no markup do Dashboard.

## Resolvido nesta passada
- [P1] Herói operacional + KPIs clicáveis (drill p/ a fila real).
- [P1] Estados de erro com "tentar de novo" em KPIs e gráficos.
- [P2] Grade 4-up idêntica → herói × volume.
- [P2] Afordância consistente nos cards "Top".

## Ainda em aberto (menor prioridade)
- [P2] Acessibilidade dos gráficos recharts (SVG sem fallback de teclado/leitor) — persona Sam. → `/impeccable harden` ou `/impeccable audit`.
- [P3] Sem range de data custom (só presets). → futuro.
- [P3] Sem tooltip de definição ("Tempo médio", "Pendentes vs atrasadas"). → `/impeccable clarify`.

## Questions to Consider
- O donut + legenda ainda repetem informação; condensar numa leitura só?
- Vale um atalho de teclado para alternar período (já há Ctrl+K/N globais)?
