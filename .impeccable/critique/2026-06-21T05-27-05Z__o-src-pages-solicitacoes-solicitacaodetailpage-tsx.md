---
target: Detalhe da Solicitação
total_score: 38
p0_count: 0
p1_count: 0
timestamp: 2026-06-21T05-27-05Z
slug: o-src-pages-solicitacoes-solicitacaodetailpage-tsx
---
# Re-critique — Detalhe da Solicitação (`apps/interno/src/pages/solicitacoes/SolicitacaoDetailPage.tsx`)

## Design Health Score

| # | Heuristic | Antes | Agora | Nota |
|---|-----------|:---:|:---:|------|
| 1 | Visibility of System Status | 4 | 4 | — |
| 2 | Match System / Real World | 4 | 4 | — |
| 3 | User Control and Freedom | 4 | 4 | — |
| 4 | Consistency and Standards | 3 | **4** | Header com hierarquia (próximo passo + Cancelar/Voltar; utilitários no menu); chip neutro |
| 5 | Error Prevention | 4 | 4 | — |
| 6 | Recognition Rather Than Recall | 4 | 4 | — |
| 7 | Flexibility and Efficiency | 3 | 3 | Utilitários a 1 clique no menu (trade-off) |
| 8 | Aesthetic and Minimalist | 3 | **4** | Header de ~7 botões → fluxo + Cancelar/Voltar + "Mais" |
| 9 | Error Recovery | 3 | **4** | Estado de erro distinto de "não encontrada", com "tentar de novo" |
| 10 | Help and Documentation | 3 | 3 | — |
| **Total** | | **35** | **38/40** | **Excelente** |

## Resolvido nesta passada
- [P2] Header organizado: visíveis = StatusActions (próximo passo do fluxo) + Cancelar + Voltar; menu "Mais" (kebab) = Duplicar, Reabrir, Reativar, Devolver ao parceiro (mostrados conforme o estado).
- [P2] Estado de erro: `detail.isError` agora mostra "Não foi possível carregar · Tentar de novo", separado de "não encontrada" (404).
- [P3] Chip "Salvando…" azul → neutro (`bg-muted`/`text-muted-foreground`), on-brand no interno.

## Em aberto (menor)
- [P3] Sem atalho de teclado p/ transições de status (power user). Opcional.
