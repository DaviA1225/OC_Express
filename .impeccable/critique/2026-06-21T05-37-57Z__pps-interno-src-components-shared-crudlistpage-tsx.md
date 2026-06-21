---
target: CrudListPage (Cadastros)
total_score: 39
p0_count: 0
p1_count: 0
timestamp: 2026-06-21T05-37-57Z
slug: pps-interno-src-components-shared-crudlistpage-tsx
---
# Re-critique — CrudListPage (`apps/interno/src/components/shared/CrudListPage.tsx`)

## Design Health Score

| # | Heuristic | Antes | Agora | Nota |
|---|-----------|:---:|:---:|------|
| 1 | Visibility of System Status | 3 | **4** | Estado de erro visível + contagem de resultados ao buscar |
| 2 | Match System / Real World | 4 | 4 | — |
| 3 | User Control and Freedom | 4 | 4 | — |
| 4 | Consistency and Standards | 4 | 4 | — |
| 5 | Error Prevention | 4 | 4 | — |
| 6 | Recognition Rather Than Recall | 4 | 4 | — |
| 7 | Flexibility and Efficiency | 4 | 4 | — |
| 8 | Aesthetic and Minimalist | 4 | 4 | — |
| 9 | Error Recovery | 2 | **4** | Linha de erro com "tentar de novo" (antes: corpo vazio silencioso) |
| 10 | Help and Documentation | 3 | 3 | — |
| **Total** | | **36** | **39/40** | **Excelente** |

## Resolvido nesta passada (alavancagem: 8 telas)
- [P1] Estado de erro no `CrudListPage` (`isError`/`onRetry`): falha de fetch agora mostra "Não foi possível carregar · Tentar de novo" no corpo da tabela — e foi **ligado nas 8 telas** (7 cadastros + Cargas de Retorno) passando `isError`/`refetch` da query.
- [P3] Linha inativa: `opacity-60` → `bg-muted/40 text-muted-foreground` + o cadeado vermelho — melhor contraste (AA), sinal de "inativo" mantido.
- [P3] Contagem filtrada: o header mostra "X resultados" ao buscar (antes só "N ativos").

## Em aberto (menor)
- [P3] Help/docs contextual mais rico — adequado para o registro (tool de operador treinado).
