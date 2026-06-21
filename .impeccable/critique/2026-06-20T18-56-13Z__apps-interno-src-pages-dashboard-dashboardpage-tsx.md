---
target: Dashboard
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-06-20T18-56-13Z
slug: apps-interno-src-pages-dashboard-dashboardpage-tsx
---
# Critique — Dashboard (`apps/interno/src/pages/dashboard/DashboardPage.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons + delta vs período + indicador realtime; falta estado de erro |
| 2 | Match System / Real World | 3 | pt-BR e domínio corretos ("Criada → finalizada") |
| 3 | User Control and Freedom | 3 | Presets de período + drill via banner; sem range custom |
| 4 | Consistency and Standards | 3 | Card reutilizado; ação "Ver relatórios" só num card |
| 5 | Error Prevention | 3 | Tela read-only, baixo risco |
| 6 | Recognition Rather Than Recall | 3 | Ícone + rótulo, período rotulado |
| 7 | Flexibility and Efficiency | 2 | KPIs não são clicáveis (sem drill p/ a fila) |
| 8 | Aesthetic and Minimalist | 3 | Limpo pós-reskin; grade 4-up ainda é padrão SaaS |
| 9 | Error Recovery | 2 | Falha de fetch vira "Sem dados" (mente p/ o operador) |
| 10 | Help and Documentation | 2 | Sem tooltip p/ definição das métricas |
| **Total** | | **27/40** | **Aceitável — base sólida, lacunas específicas** |

## Anti-Patterns Verdict

**LLM assessment:** pós-reskin NÃO grita "IA fez isso". Ícones de KPI monocromáticos, cards planos, grafite neutro, laranja contido. O único resíduo de cliché é estrutural: **4 KPIs idênticos em linha** (ícone+rótulo+número) = a "identical card grid / hero-metric" que o próprio DESIGN.md proíbe. Aceitável no registro product, mas é o que mais lembra template.

**Deterministic scan:** detector sobre `DashboardPage.tsx` (markup) = **0 hits**. Limpo. (O drift de `index.css` é da paleta de status/print, fora do escopo desta tela.)

**Visual overlays:** não injetado — critique por código (sem overlay no browser nesta passagem).

## Overall Impression
Sólido, limpo e on-brand. Maior oportunidade: virar um dashboard **operacional** (liderar e linkar o estado da fila) em vez de **analítico** que abre com um total de vaidade ("Total de OCs"). E tratar o estado de erro para o "silêncio" não mentir.

## What's Working
- O reskin pegou: KPIs monocromáticos, cards planos, acento contido — não parece dashboard de IA.
- Delta com ícone+texto+cor (não cor sozinha) — bom p/ status e daltonismo.
- Empty states específicos ("Sem clientes no período."), não genéricos.

## Priority Issues
- **[P1] KPIs não acionáveis e herói errado p/ o operador.** Abre com "Total de OCs" (vaidade); os 4 KPIs não linkam. O sinal real do atendente — "Pendentes em aberto" e "atrasadas" — fica no 4º card / num banner condicional. Fix: tornar KPIs clicáveis (Total→/solicitações, Pendentes→fila filtrada) e liderar pelo estado operacional. Cmd: `/impeccable layout`.
- **[P1] Falha de carregamento é indistinguível de "sem dados".** Em erro de query, KPI mostra "—" e gráficos "Sem dados no período" — diz que não há trabalho quando o fetch falhou. Fix: estado de erro com retry. Cmd: `/impeccable harden`.
- **[P2] Grade 4-up idêntica é o resíduo de cliché.** Diferenciar visualmente os KPIs operacionais (pendentes/atrasadas) dos de volume, ou condensar numa faixa mais densa. Cmd: `/impeccable layout` / `/impeccable distill`.
- **[P2] Afordância de card inconsistente.** Só "Top clientes" tem ação "Ver relatórios"; motoristas/subcontratadas equivalentes não têm; donut/volume sem drill. Padronizar. Cmd: `/impeccable polish`.
- **[P3] Sem range de data custom e definição de métrica.** Presets só; "Tempo médio"/"Pendentes vs atrasadas" sem tooltip. Cmd: `/impeccable clarify`.

## Persona Red Flags
**Alex (power user):** "Pendentes: 12" não é clicável — não pula pra fila. Sem range custom. (Ctrl+K/Ctrl+N existem — bom.)
**Sam (acessibilidade):** delta usa ícone+texto (bom); gráficos recharts (SVG) provavelmente sem fallback de teclado/leitor de tela. Contraste do muted #6B7280 ~4.6:1 (AA ok).
**Operador (PRODUCT.md):** p/ quem processa 30 OCs/dia, o herói deveria ser "o que precisa de mim agora", não "total de OCs". A ordem atual enterra isso.

## Minor Observations
- "Mês" como preset é ambíguo (mês corrente vs últimos 30d coexistem).
- Donut + legenda repetem informação; poderia ser uma só leitura.

## Questions to Consider
- E se a fila (pendentes/atrasadas) fosse o herói, e o volume histórico viesse depois?
- Os KPIs precisam ter todos o mesmo peso, ou 1-2 são "ação" e o resto é "contexto"?
- O que um operador faria nos primeiros 5 segundos nesta tela?
