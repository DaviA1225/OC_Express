---
target: Nova Solicitação
total_score: 39
p0_count: 0
p1_count: 0
timestamp: 2026-06-21T05-43-04Z
slug: o-src-pages-solicitacoes-novasolicitacaodialog-tsx
---
# Critique — Nova Solicitação (`apps/interno/src/pages/solicitacoes/NovaSolicitacaoDialog.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:---:|------|
| 1 | Visibility of System Status | 4 | Spinner no submit, loading dos comboboxes, erros inline, aviso de duplicata |
| 2 | Match System / Real World | 4 | Domínio pt-BR, hints (CPF/placa) |
| 3 | User Control and Freedom | 4 | Cancelar, Esc, quick-create sem sair, "voltar para revisar" na duplicata |
| 4 | Consistency and Standards | **3** | Labels visíveis não associados (`htmlFor`/`id`) aos comboboxes/selects |
| 5 | Error Prevention | 4 | zod condicional, detecção de duplicata, validação de telefone, autofocus |
| 6 | Recognition Rather Than Recall | 4 | Comboboxes com busca+hints, defaults inteligentes |
| 7 | Flexibility and Efficiency | 4 | Ctrl+N, autofocus, Enter p/ salvar, quick-create inline, autofill |
| 8 | Aesthetic and Minimalist | 4 | Seccionado e limpo; bons textos de ajuda |
| 9 | Error Recovery | 4 | Erros inline com mensagem; material ausente via toast; duplicata tratada |
| 10 | Help and Documentation | 4 | Textos de ajuda exemplares (1ª carreta/dolly, autofill, atalhos) |
| **Total** | | **39/40** | **Excelente — fluxo de criação exemplar** |

## Anti-Patterns Verdict
**LLM:** longe de slop — formul√°rio denso e muito bem pensado. **Detector:** 0 hits.

## What's Working (exemplar)
- **Comboboxes com busca + hint + quick-create inline** (motorista por CPF, veículo/carreta por placa) — cria o cadastro sem sair do modal.
- **Autofill inteligente:** subcontratada vem do cavalo, material=minério automático, carga de retorno preenche cliente+local.
- **Detecção de duplicata** (mesmo motorista+veículo+cliente) com confirmação antes de criar.
- **Validação condicional por tipo** (Minério exige telefone/subtipo/local; Retorno exige a carga).
- **Atalhos e ajuda:** Ctrl+N abre, autofocus no nome, Enter salva, Esc cancela; textos explicam 1ª carreta/dolly e o autofill.

## Priority Issues
- **[P2] a11y: rótulos não associados aos controles.** ~10 campos usam `<Label>Motorista *</Label>` seguido de `<Combobox>`/`<Select>` sem `htmlFor`/`id` (ou `aria-labelledby`). O leitor de tela lê o placeholder, mas não vincula o rótulo "Motorista *" ao controle (WCAG 1.3.1/4.1.2). Fix: dar `id`/`aria-label` a cada combobox/select e `htmlFor` aos labels. → `/impeccable harden`
- **[P3] Hint "Enter para salvar"** é simplificação (não vale em textarea/combobox). Cosmético. → opcional

## Persona Red Flags
**Sam (a11y):** inputs de texto (nome/telefone) têm `htmlFor`/`id` corretos e o RadioGroup usa `<label>` envolvente — bom; o gap são os ~10 comboboxes/selects sem associação programática de rótulo.
**Alex / Operador:** fluxo rápido e completo — quick-create, autofill e duplicata economizam muito tempo. Sem red flags relevantes.

## Questions to Consider
- Vale padronizar a associação rótulo↔controle no próprio `Combobox` (aria-labelledby) p/ herdar em todo o app?
