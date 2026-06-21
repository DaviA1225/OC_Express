---
target: CrudListPage (Cadastros)
total_score: 36
p0_count: 0
p1_count: 1
timestamp: 2026-06-21T05-30-44Z
slug: pps-interno-src-components-shared-crudlistpage-tsx
---
# Critique — CrudListPage (`apps/interno/src/components/shared/CrudListPage.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:---:|------|
| 1 | Visibility of System Status | 3 | Skeletons + contagem; sem visibilidade de erro |
| 2 | Match System / Real World | 4 | "ativos", "Mostrar inativos", claro |
| 3 | User Control and Freedom | 4 | Bulk, paginação, busca, toggle inativos, confirm |
| 4 | Consistency and Standards | 4 | É o primitivo de consistência dos 7 cadastros |
| 5 | Error Prevention | 4 | ConfirmDialog no bulk; avisa "em uso bloqueia exclusão" |
| 6 | Recognition Rather Than Recall | 4 | Colunas rotuladas, cadeado p/ inativo, titles |
| 7 | Flexibility and Efficiency | 4 | Busca, bulk, paginação, rowActions/headerActions custom |
| 8 | Aesthetic and Minimalist | 4 | Tabela limpa |
| 9 | Error Recovery | **2** | Falha de fetch → corpo da tabela silenciosamente vazio |
| 10 | Help and Documentation | 3 | Titles nas ações, placeholders |
| **Total** | | **36/40** | **Excelente — limpo, com 1 falha de alavancagem alta** |

## Anti-Patterns Verdict
**LLM:** não é slop — é uma tabela de produto sólida e o primitivo de consistência. **Detector:** 0 hits.

## What's Working (forte)
- **Primitivo de consistência:** os 7 cadastros (motoristas, veículos, carretas, clientes, materiais, subcontratadas, parceiros) herdam esta UI — coesão garantida.
- **a11y forte:** aria-label em checkboxes e ações, `title` nos ícones, Switch + Label, semântica de tabela correta.
- **Bulk com confirmação** + aviso de "registros em uso terão exclusão bloqueada".
- **Estado URL-sincronizado** (`useCrudListState`: search/inactive/page).

## Priority Issues
- **[P1] Sem estado de erro — tabela silenciosamente vazia.** Em falha de fetch, `rows` fica `undefined`: não cai no skeleton, nem no empty state (que exige `rows.length === 0`), nem renderiza linhas → o corpo da tabela fica **vazio sem nenhuma mensagem**. Pior que "lista vazia": é o nada. Fix: prop `isError`/`onRetry` + linha de erro com "tentar de novo". **Alavancagem: corrige os 7 cadastros de uma vez** (mas exige passar `isError` da query em cada um). → `/impeccable harden`
- **[P3] `opacity-60` nas linhas inativas** reduz o contraste de TODO o texto (pode falhar AA). Considerar tint de fundo + o cadeado, em vez de opacity global. → `/impeccable polish`
- **[P3] Sem contagem filtrada.** O header mostra "N ativos", não "X resultados" ao buscar. → `/impeccable clarify`

## Persona Red Flags
**Sam (a11y):** a11y geralmente forte; gaps = `opacity-60` (contraste) e a tabela vazia silenciosa em erro (sem anúncio).
**Operador:** gestão de cadastro limpa e rápida; o risco é o erro silencioso parecer "nada cadastrado".

## Questions to Consider
- O estado de erro deve ser ligado nos 7 cadastros agora (entrega o ganho) ou só preparar o componente?
- Linha inativa: opacity global ou tint + cadeado?
