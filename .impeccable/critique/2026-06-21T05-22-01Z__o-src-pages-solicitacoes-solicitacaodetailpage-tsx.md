---
target: Detalhe da Solicitação
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-06-21T05-22-01Z
slug: o-src-pages-solicitacoes-solicitacaodetailpage-tsx
---
# Critique — Detalhe da Solicitação (`apps/interno/src/pages/solicitacoes/SolicitacaoDetailPage.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:---:|------|
| 1 | Visibility of System Status | 4 | Skeletons, badge, "Salvando…", toasts, banners de estado |
| 2 | Match System / Real World | 4 | Workflow pt-BR claro |
| 3 | User Control and Freedom | 4 | Breadcrumb, voltar, cancelar, reabrir, reativar, duplicar, edit inline |
| 4 | Consistency and Standards | 3 | Header mistura ação primária e utilitários; chip "Salvando…" azul (off-brand) |
| 5 | Error Prevention | 4 | ConfirmDialog em tudo irreversível; bloqueio sem material; validação |
| 6 | Recognition Rather Than Recall | 4 | Ações cientes do status (só o próximo passo) |
| 7 | Flexibility and Efficiency | 3 | Edit inline + lazy dialogs; header sobrecarregado atrapalha |
| 8 | Aesthetic and Minimalist | 3 | Até 7 botões no header competindo |
| 9 | Error Recovery | 3 | Falha de fetch vira "não encontrada" |
| 10 | Help and Documentation | 3 | Bons `title` por ação + banners explicativos |
| **Total** | | **35/40** | **Bom (quase Excelente) — a melhor tela até agora** |

## Anti-Patterns Verdict
**LLM:** longe de slop — é um hub de processamento maduro e bem pensado. **Detector:** 0 hits.

## What's Working (forte)
- **Painel de ações ciente do status** (`StatusActions`): mostra só o próximo passo relevante (recebida → "Marcar em emissão"; oc_gerada → "Regerar / Marcar enviada / Enviar WhatsApp"…). Excelente progressive disclosure do fluxo.
- **Edição inline consistente** (`CardShell` + lápis) — edita cada card sem sair da página.
- **Prevenção de erro exemplar** — ConfirmDialog em cancelar/reabrir/reativar/duplicar, bloqueio de avanço sem material, validação de telefone.
- **Banners contextuais** que explicam o estado (cancelada / material pendente / devolvida ao parceiro).

## Priority Issues
- **[P2] Sobrecarga de ações no header / hierarquia fraca.** Em estados como `oc_gerada` de parceiro, o header mostra até ~7 botões misturando o fluxo (StatusActions) com utilitários (Duplicar, Reabrir, Reativar, Devolver, Voltar, Cancelar). O próximo passo primário deveria se destacar; os utilitários cabem num menu "mais" (kebab). → `/impeccable layout`
- **[P2] Erro de carregamento = "não encontrada".** `!detail.data` cobre 404 e falha de fetch; em erro de rede diz "não encontrada" (engana). Distinguir `isError` com "tentar de novo". → `/impeccable harden`
- **[P3] Chip "Salvando…" usa azul** (`bg-blue-100`) — off-brand no interno (laranja). Neutralizar. → `/impeccable polish`

## Persona Red Flags
**Alex (power user):** edit inline e workflow rápidos; red flag: ~7 botões pra varrer no header; sem atalho de teclado p/ transição de status.
**Sam (a11y):** lápis com aria-label, badge, titles — bom; a sobrecarga de botões também pesa no leitor de tela.
**Operador:** é o hub de processamento — ações cientes do status são ótimas; a poluição do header é o atrito principal.

## Questions to Consider
- Quais ações são realmente "sempre visíveis" vs. "menu mais" (Duplicar/Reabrir/Reativar são raras)?
- O header poderia separar o "próximo passo" (destaque) do resto?
