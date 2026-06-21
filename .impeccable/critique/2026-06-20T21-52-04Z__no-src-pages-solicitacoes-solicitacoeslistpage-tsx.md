---
target: Solicitações
total_score: 32
p0_count: 0
p1_count: 0
timestamp: 2026-06-20T21-52-04Z
slug: no-src-pages-solicitacoes-solicitacoeslistpage-tsx
---
# Re-critique — Solicitações (`apps/interno/src/pages/solicitacoes/SolicitacoesListPage.tsx`)

## Design Health Score

| # | Heuristic | Antes | Agora | Nota |
|---|-----------|:---:|:---:|------|
| 1 | Visibility of System Status | 4 | 4 | — |
| 2 | Match System / Real World | 3 | 3 | — |
| 3 | User Control and Freedom | 3 | 3 | — |
| 4 | Consistency and Standards | 2 | **3** | Card sem hover-shadow (Plano por padrão); afordância = comportamento |
| 5 | Error Prevention | 4 | 4 | — |
| 6 | Recognition Rather Than Recall | 3 | 3 | Card clicável melhora descoberta |
| 7 | Flexibility and Efficiency | 4 | 4 | Corpo do card abre (mais rápido) |
| 8 | Aesthetic and Minimalist | 3 | 3 | Mais plano/limpo |
| 9 | Error Recovery | 2 | **3** | Estado de erro com "tentar de novo" |
| 10 | Help and Documentation | 2 | 2 | — |
| **Total** | | **30** | **32/40** | **Bom** |

## Resolvido nesta passada
- [P2] Cards no design system: removido `hover:shadow-md` (regra Plano por padrão); corpo do card agora abre a solicitação (role=button + teclado Enter/Espaço + focus ring), checkbox isolado com stopPropagation, "Abrir" virou indicação visual (chevron).
- [P1] Estado de erro da lista: falha de fetch mostra "Não foi possível carregar · Tentar de novo" em vez de "lista vazia".
- [P2] a11y: `aria-pressed` nos chips de status e Atrasadas; `motion-reduce:animate-none` no ping "Parceiro respondeu".

## Ainda em aberto (por escolha / menor prioridade)
- [P2] Dois paradigmas de filtro (dropdowns + chips) — mantido por decisão; repensar fica como item separado. É o que segura #4 em 3.
- [P3] Header do card com muitos badges (condensar) — `/impeccable distill`.
- [P3] Chip de status ativo em laranja (não na cor semântica) — `/impeccable polish`.
- [P3] Ajuda/definições (tooltips) — `/impeccable clarify`.
