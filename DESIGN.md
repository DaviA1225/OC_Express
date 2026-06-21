---
name: SisLog LHG
description: Sistema de Ordens de Carregamento — painel de operação industrial, grafite com laranja LHG como acento.
colors:
  ink: "#1A1F28"
  graphite-bar: "#1D1E1B"
  orange: "#FF5100"
  orange-deep: "#D3641A"
  surface: "#FFFFFF"
  canvas: "#F5F7F9"
  slate-500: "#6B7280"
  accent-gray: "#EDEFF2"
  border: "#E1E4EA"
  portal-blue: "#1E40AF"
  portal-blue-deep: "#1E3A8A"
  status-recebida-bg: "#F1F5F9"
  status-recebida-fg: "#475569"
  status-em-emissao-bg: "#FFE8D6"
  status-em-emissao-fg: "#C44612"
  status-instrucao-bg: "#FEF3C7"
  status-instrucao-fg: "#92400E"
  status-oc-gerada-bg: "#F4D4BD"
  status-oc-gerada-fg: "#8F3700"
  status-oc-enviada-bg: "#D1FAE5"
  status-oc-enviada-fg: "#065F46"
  status-finalizada-bg: "#A7F3D0"
  status-finalizada-fg: "#064E3B"
  status-cancelada-bg: "#FEE2E2"
  status-cancelada-fg: "#991B1B"
  status-dark-recebida-fg: "#cbd5e1"
  status-dark-oc-gerada-fg: "#FFB37A"
  status-dark-instrucao-fg: "#fcd34d"
  status-dark-oc-enviada-fg: "#6ee7b7"
  status-dark-finalizada-fg: "#a7f3d0"
  status-dark-cancelada-fg: "#fca5a5"
typography:
  display:
    fontFamily: "Kanit, 'Wanted Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Wanted Sans', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Wanted Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.5px"
rounded:
  control: "2px"
  surface: "4px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-primary-hover:
    backgroundColor: "{colors.orange-deep}"
    textColor: "{colors.surface}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: SisLog LHG

## 1. Overview

**Creative North Star: "A Sala de Controle"**

O SisLog não é um produto de vitrine — é o painel onde uma operação de transporte
roda. A estética é a de uma sala de controle industrial: estrutura grafite neutra,
densidade alta, informação legível à distância de um relance, e um único sinal
quente — o laranja LHG #FF5100 — usado com parcimônia para dizer "aqui, agora, esta
é a ação". Tudo o que não é dado ou ação primária recua para tons de grafite e
ardósia. A interface trabalha para o atendente que processa até 30 OCs por dia; cada
pixel de espaço morto removido é tempo devolvido à operação.

O sistema rejeita explicitamente o "look de IA / template SaaS": nada de gradientes
diagonais chamativos, nada de chips pastel coloridos competindo entre si, nada de
cards aninhados, nada de saudação consumer ("Boa tarde, fulano") numa tela de
trabalho. A fonte não é Inter-para-tudo; o ícone não vive num quadradinho
arredondado acima de cada título; não há eyebrow uppercase sobre cada seção. O
extremo oposto também é proibido: a "planilha disfarçada" (grades de células sem
fluxo) é justamente o que este sistema veio substituir.

**Key Characteristics:**
- Estrutura grafite neutra; laranja como acento único (≤10% da tela).
- Densidade alta a serviço da velocidade: padding 12–16px, corpo 13–14px.
- Plano por padrão; separação por hairline, não por sombra.
- Cantos retos (2–4px); institucional, não "fofo".
- Tipografia industrial (Kanit display + Wanted Sans corpo).
- Status nunca só por cor; sempre rótulo + tom.

## 2. Colors

Uma escala grafite fria carrega toda a estrutura; o laranja LHG é o único calor, e
sua raridade é o ponto.

### Primary
- **Laranja LHG** (#FF5100): a única cor quente do sistema. Reservada a ação
  primária (botão primário), estado ativo de navegação, foco/ring e ao acento de
  destaque pontual. Nunca preenche superfícies grandes.
- **Laranja Queimado** (#D3641A): estado hover do laranja primário; também o tom de
  status "em emissão".

### Neutral
- **Grafite Tinta** (#1A1F28): texto principal e títulos. Não é preto puro — tem um
  leve toque frio (H220) para parecer intencional, não default.
- **Grafite Barra** (#1D1E1B): a barra superior sólida do sistema interno (o preto
  LHG, chapado — sem gradiente).
- **Ardósia 500** (#6B7280): texto secundário, labels, ícones em repouso.
- **Cinza Acento** (#EDEFF2): fundo de hover e realce neutro.
- **Canvas** (#F5F7F9): fundo de descanso, headers de tabela, áreas atrás dos cards.
- **Borda** (#E1E4EA): hairline de 1px que separa quase tudo. É o principal recurso
  de separação, no lugar de sombra.
- **Superfície** (#FFFFFF): fundo de cards, inputs e da área de conteúdo.

### Portal (acento alternativo)
- **Azul Portal** (#1E40AF / hover #1E3A8A): no portal de parceiros, o azul ocupa o
  papel do laranja. Mesma estrutura grafite, acento diferente — sinaliza ao parceiro
  que ele é fornecedor, não funcionário. Os dois apps nunca misturam os acentos.

### Status (progressão semântica, não decorativa)
Cada status é um par fundo-claro / texto-escuro do mesmo tom, formando uma
progressão cinza → laranja → verde: **recebida** (#475569 sobre #F1F5F9) →
**em emissão** (#C44612 sobre #FFE8D6) → **instrução emitida** (#92400E sobre
#FEF3C7) → **OC gerada** (#8F3700 sobre #F4D4BD) → **OC enviada** (#065F46 sobre
#D1FAE5) → **finalizada** (#064E3B sobre #A7F3D0). **cancelada** sai da escala
(#991B1B sobre #FEE2E2).

### Named Rules
**A Regra da Voz Única.** O laranja (e, no portal, o azul) aparece em no máximo ~10%
de qualquer tela. Sua raridade é o que o torna um sinal de ação. Se o acento está em
toda parte, ele não significa mais nada.

**A Regra do Tinte Frio.** Neutros levam um leve toque na direção H220 (frio), nunca
para o quente "porque a marca é laranja". O calor vem do acento, da tipografia e do
conteúdo — nunca do fundo.

## 3. Typography

**Display Font:** Kanit (com fallback Wanted Sans → system-ui)
**Body / UI Font:** Wanted Sans (com fallback Inter → system-ui)

**Character:** Kanit é uma geométrica condensada com peso industrial — boa para
títulos e números grandes; ecoa sinalização de pátio/logística. Wanted Sans é uma
humanista limpa e neutra para corpo e UI. O par contrasta no eixo geométrico ×
humanista, não duas sans quase iguais. Servidas via jsdelivr (Wanted Sans) e Google
Fonts (Kanit) — Wanted Sans não está no Google Fonts.

### Hierarchy
- **Display / Título de página** (Kanit ou Wanted Sans 600, 22px, tracking -0.01em):
  títulos de tela (h1). Sentence case.
- **Título de seção** (Wanted Sans 600, 18px): h2 dentro da página.
- **Título de card** (Wanted Sans 500–600, 14px): cabeçalho de card/seção.
- **Corpo** (Wanted Sans 400, 13–14px, line-height 1.5): conteúdo, formulários,
  células de tabela. Em texto longo, limitar a 65–75ch.
- **Label secundária** (Wanted Sans 500, 11px, letter-spacing 0.5px, UPPERCASE):
  rótulos de KPI e seções de cadastro. É a ÚNICA situação de maiúsculas.
- **Meta** (Wanted Sans 400, 10px): data/hora, contadores.

### Named Rules
**A Regra do Peso-Teto.** Nada acima de 600. O peso institucional vem do tracking
apertado e da estrutura, não de 700/800. Números em tabela usam `tabular-nums` para
alinhar coluna a coluna.

## 4. Elevation

O sistema é **plano por padrão**. A separação entre superfícies vem de hairlines de
1px (#E1E4EA) e do contraste entre canvas (#F5F7F9) e superfície (#FFFFFF), não de
sombra. Cards não têm sombra em repouso nem no hover (o `hover:shadow` foi removido
no reskin). Sombra existe apenas para elementos que flutuam de verdade sobre o
conteúdo — modais e dropdowns.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 4px 12px rgba(0,0,0,0.08)`): exclusivo de diálogos,
  popovers e dropdowns. É a única sombra do sistema.

### Named Rules
**A Regra do Plano-Por-Padrão.** Superfícies são planas em repouso. Se algo tem
sombra, é porque está literalmente sobreposto ao conteúdo (modal/dropdown). Sombra
para "dar profundidade decorativa" a um card é proibida.

## 5. Components

### Buttons
- **Shape:** cantos retos (2px, `rounded-control`); altura 36px (h-9), padding
  8×12px, corpo 13px peso 500.
- **Primary:** fundo Laranja LHG (#FF5100), texto branco; hover → Laranja Queimado
  (#D3641A). É a única ação que usa o acento cheio.
- **Outline / Ghost / Secondary:** outline = borda #E1E4EA sobre branco, hover fundo
  cinza; ghost = sem borda, hover fundo cinza; secondary = grafite. Destructive
  (vermelho) e success (verde) existem para ações específicas.
- **Hover / Focus:** transição só de cor (200ms); foco = ring 2px laranja
  (`ring-ring`) com offset 1px. Sem deslocamento/elevação.

### Status Badge (componente assinatura)
- **Style:** pílula com par fundo-claro/texto-escuro do mesmo tom (ver Colors →
  Status). Sempre acompanha rótulo textual; cor nunca é o único sinal.
- **State:** a transição de status anima a cor do badge (200ms).

### Cards / Containers
- **Corner Style:** 4px (`rounded-surface`).
- **Background:** branco (#FFFFFF) sobre canvas (#F5F7F9).
- **Shadow Strategy:** nenhuma (ver Elevation — plano por padrão).
- **Border:** hairline 1px #E1E4EA.
- **Internal Padding:** 12–16px. Nunca 24px+ (densidade é prioridade).

### KPI Card (dashboard)
- Label UPPERCASE 11px + número grande 28px `tabular-nums` + ícone **monocromático**
  numa caixa neutra (fundo cinza-claro + borda). Variação vs. período via seta
  verde/vermelha — esse é o único uso de verde/vermelho semântico no card. Proibido
  chip de ícone pastel colorido.

### Inputs / Fields
- **Style:** borda #E1E4EA sobre branco, cantos 2px, altura 36px.
- **Focus:** ring 2px laranja (`ring-ring`), offset 1px.

### Navigation
- **Sidebar (interno):** 220px, recolhível a 64px. Item ativo = fundo `primary/10` +
  texto laranja + barra vertical laranja à esquerda (indicador de nav, pseudo-
  elemento — não é stripe decorativo de card). Labels de seção UPPERCASE 10px.
- **Top nav (portal):** horizontal, item ativo = texto azul + sublinhado azul de 2px.

## 6. Do's and Don'ts

### Do:
- **Do** reservar o laranja #FF5100 (azul #1E40AF no portal) para ação primária,
  estado ativo e foco — ≤10% da tela (A Regra da Voz Única).
- **Do** separar superfícies com hairline 1px (#E1E4EA) e o contraste canvas×branco.
- **Do** manter densidade alta: padding 12–16px, corpo 13–14px, sem espaço morto.
- **Do** usar cantos retos (2px controles, 4px superfícies) e `tabular-nums` em
  números de tabela/KPI.
- **Do** acompanhar todo status de rótulo + ícone, nunca só de cor (WCAG AA, AA é o
  piso; corpo ≥ 4.5:1).
- **Do** dar alternativa `prefers-reduced-motion` a toda animação (crossfade/instantâneo).

### Don't:
- **Don't** usar gradientes diagonais chamativos em headers ou superfícies — a barra
  superior é grafite sólido #1D1E1B, chapado.
- **Don't** usar chips de ícone pastel coloridos (esmeralda/âmbar/roxo) competindo —
  ícones de KPI são monocromáticos.
- **Don't** aninhar card dentro de card, nem repetir grades de cards idênticos sem fim.
- **Don't** colocar saudação consumer ("Boa tarde, fulano") em tela de operação.
- **Don't** usar Inter (ou system default) para tudo, ícone em quadradinho
  arredondado acima de cada título, ou eyebrow UPPERCASE sobre cada seção.
- **Don't** usar `border-left`/`border-right` > 1px como stripe colorido em cards,
  itens de lista ou callouts.
- **Don't** dar sombra decorativa a cards (plano por padrão; sombra só em modal/dropdown).
- **Don't** virar "planilha disfarçada": toda tela tem fluxo e foco, não só grade de células.
