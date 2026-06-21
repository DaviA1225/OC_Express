---
target: Solicitações
total_score: 30
p0_count: 0
p1_count: 1
timestamp: 2026-06-20T21-42-48Z
slug: no-src-pages-solicitacoes-solicitacoeslistpage-tsx
---
# Critique — Solicitações (`apps/interno/src/pages/solicitacoes/SolicitacoesListPage.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:---:|------|
| 1 | Visibility of System Status | 4 | Skeletons, contagem, SLA/pendência, toasts, disabled states |
| 2 | Match System / Real World | 3 | Domínio pt-BR; algum jargão (Pamcard) ok p/ a equipe |
| 3 | User Control and Freedom | 3 | Limpar filtros, cancelar em diálogos, paginação |
| 4 | Consistency and Standards | **2** | Dois paradigmas de filtro; card hover-shadow contraria DESIGN.md |
| 5 | Error Prevention | 4 | ConfirmDialog em cancelar/excluir; disabled states |
| 6 | Recognition Rather Than Recall | 3 | Filtros visíveis, chips rotulados |
| 7 | Flexibility and Efficiency | 4 | Busca, lote, Ctrl+N, view toggle, CSV, chips |
| 8 | Aesthetic and Minimalist | 3 | Barra de filtros + chips densa; header do card com muitos badges |
| 9 | Error Recovery | **2** | Falha de carregamento vira "lista vazia" |
| 10 | Help and Documentation | 2 | Só title em botões |
| **Total** | | **30/40** | **Bom — tool poderoso, com arestas de consistência** |

## Anti-Patterns Verdict
**LLM:** não é slop — é uma ferramenta operacional real e densa (adequado ao registro product). **Detector:** 0 hits no markup.

## What's Working
- Poder real: busca debounced, multi-filtro, **ações em lote** com barra sticky + confirmação destrutiva, grade/lista, export CSV, sinais de **SLA** e **pendência de parceiro**.
- Empty state ciente de filtro ("Nada encontrado" vs "Nenhuma ainda").
- Boa prevenção de erro (confirma antes de cancelar/excluir).

## Priority Issues
- **[P1] Falha de carregamento = "lista vazia".** Se `useSolicitacoesList` falha, `isLoading` vira false e `count` 0 → mostra "Nenhuma solicitação ainda / Que tal criar a primeira?". Mesmo problema do dashboard. Fix: branch `list.isError` com "tentar de novo". → `/impeccable harden`
- **[P2] Dois paradigmas de filtro competindo.** 5 dropdowns (tipo/período/material/origem/pamcard) + 8 chips (Atrasadas + 7 status) visíveis ao mesmo tempo = alta carga cognitiva e inconsistência (por que status é chip e tipo é dropdown?). Unificar o tratamento. → `/impeccable layout` / `distill`
- **[P2] Cards fora do design system.** `hover:shadow-md` contraria a regra "Plano por padrão" do DESIGN.md; e o hover sugere card clicável, mas só o botão "Abrir" abre (afordância ≠ comportamento). Fix: trocar shadow por borda/realce e tornar o corpo do card abrível (mantendo checkbox/badges como exceções). → `/impeccable polish`
- **[P2] a11y dos chips de status/atrasadas.** São `<button>` toggles sem `aria-pressed` (só o view-toggle tem). Leitor de tela não anuncia ativo/inativo. O ping "Parceiro respondeu" (`animate-ping`) não tem alternativa de reduced-motion. → `/impeccable harden`
- **[P3] Sobrecarga de badges no header do card** (pendência + cartão + origem + número + solicitante + SLA + status = até 7). Condensar/hierarquizar. → `/impeccable distill`
- **[P3] Chip de status ativo usa laranja (primary)** em vez da cor semântica do próprio status. → `/impeccable polish`

## Persona Red Flags
**Alex (power user):** forte (Ctrl+N, lote, filtros, export). Red flags: select-all só da página; não dá pra clicar o corpo do card pra abrir (só "Abrir"); sem navegação por teclado na lista.
**Sam (a11y):** checkboxes e view-toggle com ARIA ok; **chips de status sem `aria-pressed`**; ping sem reduced-motion.
**Operador (PRODUCT.md):** é o workspace principal — densidade é boa; o atrito está na sobrecarga de filtros e no "clicar Abrir".

## Questions to Consider
- Os filtros precisam de dois formatos, ou um só (tudo chip, ou tudo numa barra coerente)?
- O corpo do card deveria abrir a solicitação (como a linha já faz)?
