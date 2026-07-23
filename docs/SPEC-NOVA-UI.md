# SisLog — Especificação de Nova UI/UX (referência: TransporteApp)

Este documento descreve, em detalhe, os padrões de UI/UX de **transporteapp.com.br**
e como adaptá-los às telas **já existentes** do SisLog (sistema interno e portal
de parceiros): agora incluindo o **tema visual escuro, com gradiente e glow**,
recolorido com a identidade do SisLog. É um guia de *restyling* sobre o que já
está implementado — **não** cria telas, rotas, campos ou funções novas.

**Este documento propõe uma mudança de direção visual em relação ao `DESIGN.md`
atual.** `DESIGN.md`/`PRODUCT.md` hoje descrevem um sistema plano, claro por
padrão, sem gradiente, sem sombra decorativa ("Sala de Controle"). Este spec
define a versão **escura, com gradiente e glow** do produto — uma extensão do
modo escuro que já existe (via `ThemeToggle`), não a substituição do modo
claro. Para que isso vire a fonte de verdade oficial, as seções de elevação e
os "Don'ts" de gradiente/sombra em `DESIGN.md` precisam ser emendadas quando
a implementação for feita; até lá, este documento é a especificação da versão
escura, e `DESIGN.md` continua valendo para o modo claro e para as regras que
não mudam (Regra da Voz Única, densidade, tipografia, status sempre com
rótulo). Ver §2 para o histórico dessa decisão.

**Escopo explícito:**
- ✅ Tema escuro como versão **completa e polida** do produto (fundo em
  camadas escuras, gradiente em pontos específicos, glow em pontos
  específicos) — aplicado às telas que já existem.
- ✅ Cores do SisLog mantidas como os únicos acentos: laranja LHG `#FF5100`
  no interno, azul `#1E40AF` no portal, mais as cores semânticas de status já
  definidas em `DESIGN.md`. Nenhuma cor do TransporteApp (esmeralda, âmbar,
  céu) é usada.
- ❌ Nenhuma tela nova, nenhum campo novo, nenhuma função nova (sem
  rastreamento em tempo real/mapa, sem app de motorista, sem kanban
  drag-and-drop, sem dashboard novo no portal, sem tour de produto, sem
  telas de venda/preço/depoimento).
- ❌ Gradiente/glow não são "à vontade em tudo" — são recursos escassos e
  posicionados (ver §4), do mesmo jeito que o laranja hoje é usado com
  parcimônia em `DESIGN.md`. Aplicar em tudo apagaria justamente o que os
  torna um sinal.

---

## 1. Levantamento detalhado do TransporteApp

`transporteapp.com.br` é o site público (marketing) de um SaaS de gestão de
transporte executivo. A área logada ("demo") fica atrás de um desafio
anti-robô da Cloudflare que não foi contornado (não se tenta burlar
verificação anti-bot). Tentativas de capturar screenshot real do navegador
nesta sessão expiraram por timeout (inclusive em `example.com`, confirmando
limitação do ambiente, não do site) — então este levantamento foi feito por
leitura completa do DOM renderizado: texto, hierarquia de elementos,
**classes Tailwind literais** (não apenas estilo computado) e variáveis CSS.
Isso é mais preciso que uma inspeção visual superficial, porque expõe a
intenção de cada elemento (raio, espaçamento, estado ativo) diretamente no
código-fonte da página, embora não substitua ver o produto logado em ação.

### 1.1 Paleta e tokens globais (do TransporteApp — referência, não o que entra no SisLog)

```
--background: hsl(222 47% 8%)   → #0B0F14 na prática (fundo raiz de toda a página)
--foreground: hsl(210 40% 98%)  → branco quase puro (texto)
--primary:    hsl(217 91% 60%)  → azul (usado em botões/links do site institucional)
--secondary:  hsl(262 70% 65%)  → roxo
--card:       hsl(222 47% 11%)
--border:     hsl(217 33% 20%)
--radius:     .75rem (12px)     → raio base; cards reais chegam a 16-24px
```

Camadas de fundo empilhadas (do mais claro ao mais escuro, todas variações de
grafite-azulado quase preto): `#0B0F14` (raiz) → `#0A0E13` (faixas de seção
"produto"/"como funciona", com `border-y border-white/5` marcando a costura)
→ `#0E131A` / `#0F141B` / `#121A22` (cards individuais). Não há branco em
nenhum lugar da UI — é escuro em todas as camadas, do fundo da página ao
fundo do menor card. **É essa estratificação em camadas escuras (não os
tokens de cor em si) que o SisLog vai adotar — ver §3.**

**Cor de destaque real do produto: verde-esmeralda** (`emerald-400/500`,
aprox. `#34D399`/`#10B981`), não o azul/roxo dos tokens de framework — âmbar
(`amber-400/500`) aparece como segunda cor de apoio (badge "Financeiro",
glow decorativo). Um terceiro tom, céu/sky, aparece só nos ícones da seção
"Como funciona". Ou seja, **na prática o site usa 2-3 acentos simultâneos**
(esmeralda dominante + âmbar + toques de céu). O SisLog **não** replica isso
— continua com um único acento por app (laranja no interno, azul no portal),
substituindo cada uso de esmeralda/âmbar/céu do TransporteApp pelo acento do
app correspondente. Onde o TransporteApp usa uma segunda cor por variedade
puramente decorativa, o SisLog usa a mesma cor de acento em intensidades
diferentes (mais clara/mais escura), não uma segunda cor.

### 1.2 Escala de raio e sombra (do TransporteApp)

| Elemento | Raio | Sombra/borda |
|---|---|---|
| Botão | `rounded-md` (~6px) | nenhuma, só cor de fundo |
| Badge/pílula (eyebrow, status, degrau numerado) | `rounded-full` | borda 1px em `cor/25`, fundo `cor/10` |
| Botão circular flutuante (setas do carrossel) | `rounded-full`, 36-40px | `bg-black/55` + `backdrop-blur-sm` + borda `white/15` — efeito "vidro" |
| Ícone-tile de processo (seção "Como funciona") | `rounded-2xl`, 84-90px | gradiente de fundo (`from-sky-500/20 to-sky-600/5`) + borda de cor + selo `circle-check` sobreposto no canto |
| Card padrão (passo, testemunho, contato) | `rounded-2xl` | borda `white/[0.06]`, fundo sólido escuro ou gradiente sutil `white/[0.04]→transparent` |
| Card de destaque (plano recomendado) | `rounded-3xl` | anel externo com gradiente `emerald/40→amber/20→emerald/40` borrado (`blur-[1px]`) + `shadow-2xl shadow-emerald-950/40` |
| Imagem de produto (showcase) | container `overflow-hidden`, proporção `aspect-[16/9]` | fundo `#0E131A` atrás da imagem enquanto carrega |

**Decisão de escopo sobre o raio:** o pedido do usuário foi especificamente
"escuro/gradiente/glow" — não "cantos grandes". O SisLog mantém sua escala de
raio atual (2-4px em controles/superfícies). Adotar 12-24px seria um passo a
mais que não foi pedido; se quiser esse efeito também, é uma decisão
separada.

### 1.3 Anatomia dos componentes-chave (do TransporteApp)

**Cabeçalho (header):** fixo (`sticky top-0`), fundo semitransparente
`bg-[#0B0F14]/80` com `backdrop-blur-xl`, borda inferior `white/5`. Logo =
caixa `rounded-lg` com gradiente esmeralda + ícone (`car`, branco) + nome em
branco com uma palavra final colorida (`text-emerald-400`). Nav horizontal
(zinc-400, vira branco no hover).

**Hero:** fundo escuro com 2 "orbs" de brilho desfocado (`blur-[120px]` e
`blur-[90px]`) atrás do conteúdo — um verde grande centralizado, um âmbar
pequeno no canto. Badge "eyebrow" em pílula (borda+fundo translúcidos, ponto
pulsante `animate-pulse`) acima do título. H1 grande com um trecho do texto
em **gradiente** (`from-emerald-300 via-emerald-400 to-teal-300`,
`bg-clip-text text-transparent`).

**Showcase de produto, "Como funciona", preços, depoimentos, contato:**
detalhados na versão anterior deste documento (histórico de composição —
ver §5.A). Continuam sem equivalente direto numa ferramenta operacional
interna, **independentemente da paleta usada** — isso não muda com a adoção
do tema escuro, porque é uma questão de função (site de vendas × app
operacional), não de cor.

**Botões:** primário = preenchido, texto branco, `rounded-md`; secundário =
outline ou ghost; botões circulares (setas do carrossel) usam efeito "glass"
(`bg-black/55 backdrop-blur-sm`) — variante que só existe sobre imagem.

**Ícones:** biblioteca **lucide-react** — a mesma que o SisLog já usa.
Nenhum ícone novo precisa ser instalado.

**Movimento:** transições simples de cor/opacidade, `hover:scale-[1.02]` na
imagem do showcase, `animate-pulse` no ponto do badge "ao vivo". Nenhuma
biblioteca de animação de scroll detectada.

### 1.4 Ritmo de página

A página pública alterna entre fundo "raiz" (`#0B0F14`) e uma faixa
ligeiramente mais escura com costura (`#0A0E13` + `border-y`) para quebrar
visualmente o scroll longo entre as 9 seções da landing.

---

## 2. Histórico da decisão de escopo

Esta é a terceira versão deste documento, e a decisão sobre o tema mudou
entre as versões — registrado aqui para quem for implementar entender o
porquê:

1. **V1** (pedido inicial: "replicar a UI/UX... mantendo as cores do
   SisLog"): interpretei "cores do SisLog" como toda a identidade visual de
   `DESIGN.md` (plano, sem gradiente). Repliquei só a arquitetura de
   informação.
2. **V2** (pedido: análise "minuciosa"): antes de reescrever, perguntei
   explicitamente se o usuário quería o tema completo (escuro/gradiente/
   glow) ou só os componentes. Resposta: só os componentes — confirmando
   que `DESIGN.md` deveria continuar soberano naquele momento.
3. **V3 — esta versão** (pedido atual: "reescreva... com o tema visual
   escuro/gradiente/glow, mantendo as cores do sislog"): decisão revertida
   explicitamente pelo usuário. Agora o tema (fundo escuro em camadas,
   gradiente, glow) entra de fato, mas recolorido com os acentos do SisLog
   (laranja/azul) em vez dos do TransporteApp (esmeralda/âmbar). As regras
   que **não** foram mencionadas no pedido continuam valendo por padrão:
   raio de canto (§1.2), densidade de informação, Regra da Voz Única (um
   acento por app), status sempre com rótulo (nunca só cor).

O modo escuro **não vira o padrão de abertura do app** — o SisLog já tem
claro/escuro como opções via `ThemeToggle` (`PRODUCT.md`: "Modo escuro... já
existente — manter"). Este documento define como o produto fica **quando o
tema escuro está ativo**; qual tema abre por padrão é uma decisão de produto
separada, não alterada aqui.

---

## 3. Sistema de cores do tema escuro

Todo token abaixo deriva de cores que **já existem** em `DESIGN.md` sempre
que possível — a maioria dos tokens de status escuro já está definida lá
(`status-dark-*-fg`), só faltava um sistema de superfícies e uma regra de
badge para usá-los de forma consistente.

### 3.1 Superfícies (novo — a propor em `DESIGN.md`)

| Token | Valor | Papel | Origem |
|---|---|---|---|
| `bg-canvas-dark` | `#14171D` | Fundo raiz da aplicação (equivalente ao `canvas` `#F5F7F9` do claro) | Novo |
| `bg-surface-dark` | `#1A1F28` | Fundo de cards, inputs, painel de conteúdo | **Reaproveita o hex de `ink`** (hoje é a cor do texto no claro — no escuro vira superfície, uma inversão elegante) |
| `bg-elevated-dark` | `#232833` | Popover, dropdown, tooltip, linha de tabela em hover | Novo |
| `border-dark` | `rgba(255,255,255,0.08)` | Hairline no escuro (papel do `#E1E4EA` no claro) | Novo |
| `text-primary-dark` | `#F5F7F9` | Texto principal no escuro | **Reaproveita o hex de `canvas`** (mesma simetria invertida) |
| `text-secondary-dark` | `#94A3B8` | Texto secundário, labels | Novo |
| `text-tertiary-dark` | `#64748B` | Hints, placeholders | Novo |

A barra superior do interno (`#1D1E1B`, hoje já sólida em ambos os temas) e o
fundo azul do login do portal (`#1E3A8A`) não mudam — já são escuros.

### 3.2 Acento — interno (laranja) e portal (azul)

| Papel | Interno | Portal |
|---|---|---|
| Acento sólido (botão primário, ícone ativo) | `#FF5100` (`orange`, já existe) | `#1E40AF` (`portal-blue`, já existe) |
| Tom claro do acento (fim de gradiente, texto sobre fundo escuro) | `#FFB37A` (**já existe** como `status-dark-oc-gerada-fg`, reaproveitado aqui como "laranja claro") | `#93B4FF` (novo — propor `portal-blue-tint-dark`) |
| Glow (sombra difusa atrás de elemento em destaque) | `rgba(255,81,0,0.18)` | `rgba(30,64,175,0.18)` |

Continua valendo a **Regra da Voz Única** de `DESIGN.md`: um único acento por
app. O gradiente é sempre *tom claro → tom sólido do mesmo acento* (ex.:
`#FFB37A → #FF5100`), nunca duas cores diferentes como o
esmeralda→teal do TransporteApp.

### 3.3 Badges de status no escuro (fórmula, não uma cor nova por status)

`DESIGN.md` já define o texto de cada status no escuro
(`status-dark-recebida-fg`, `status-dark-oc-gerada-fg`,
`status-dark-instrucao-fg`, `status-dark-oc-enviada-fg`,
`status-dark-finalizada-fg`, `status-dark-cancelada-fg`). Falta só uma
regra de fundo/borda — a mesma fórmula do badge "eyebrow" do TransporteApp
(`bg-cor/10`, `border-cor/25`), aplicada à cor que já existe:

```
fundo  = cor-do-texto-do-status a 12% de opacidade
borda  = cor-do-texto-do-status a 30% de opacidade
texto  = status-dark-*-fg (já existe)
```

Exemplo concreto (finalizada): texto `#a7f3d0` sólido, fundo
`rgba(167,243,208,0.12)`, borda `rgba(167,243,208,0.3)`. Único token
realmente faltante: `status-dark-em_cadastro-fg` (o status "em emissão" não
tem par escuro hoje) — propor `#FFA366`, entre o cinza de `recebida` e o
laranja-claro de `oc_gerada`.

O badge de origem parceiro (`.cat-partner`) **já tem** variante escura
pronta (`cat-partner-dark-bg` `#2949C4` / `cat-partner-dark-border`
`#3A5AD6`) — só aplicar, nenhum token novo.

### 3.4 Gráficos (recharts)

Fundo do plot = transparente sobre `bg-surface-dark`; linhas de grade e eixo
= `border-dark`; texto de eixo/legenda = `text-secondary-dark`. As cores de
série continuam as mesmas (`#FF5100` primária + `chart-series-2..8`) — mas
precisam de checagem de contraste sobre fundo escuro antes de ir pra
produção (algumas são tons foscos pensados pra fundo claro; podem precisar
de ~10-15% mais claridade no escuro). Isso é verificação de implementação,
não uma decisão deste spec.

---

## 4. Onde gradiente e glow entram (e onde não entram)

Gradiente e glow são, no TransporteApp, usados em **toda parte** — é uma
página de vendas, quer impressionar em cada seção. O SisLog é uma ferramenta
de uso diário; gradiente/glow em todo canto vira ruído e cansa quem processa
30 OCs por dia. Por isso este spec trata os dois como recursos **escassos e
posicionados**, na mesma lógica da "Regra da Voz Única" já aplicada ao
laranja: se está em tudo, para de significar algo.

**Onde entram:**
- **Orb de glow atrás do card de login** — um único orb desfocado
  (`blur-[110px]`, ~15-18% opacidade), cor do acento do app, posicionado
  atrás do card centralizado. É a "primeira impressão" de cada sessão — o
  lugar mais parecido com um "hero" que o SisLog tem.
- **Gradiente no wordmark do login** ("SisLog" / "Portal Parceiros LHG") —
  tom claro → sólido do acento do app, substituindo o texto branco sólido
  atual. Ponto único de destaque tipográfico por tela.
- **Glow de estado/alerta** — quando um KPI ou card já muda de tom por
  regra de negócio (ex.: card "Atrasadas" do Dashboard fica vermelho quando
  há solicitação atrasada; nó "mais recente" do `TimelineCard`), reforçar
  com uma sombra difusa da mesma cor. É glow **funcional** (chama atenção
  pro que importa agora), não decorativo.
- **Ícone de KPI Card** — a caixa hoje neutra (`DESIGN.md`) ganha um
  gradiente sutil de fundo (`acento/20 → acento/5`) em vez de cinza sólido,
  mantendo o ícone monocromático dentro dela.
- **Números "hero" do Dashboard** (os 2 KPIs de "Estado operacional":
  Pendentes em aberto, Atrasadas — os primeiros que o atendente olha) —
  texto em gradiente tom-claro→sólido. Os outros KPIs (Volume no período,
  Relatórios) permanecem em texto sólido — nem todo número vira "showpiece".
- **Barra de progresso do ranking Top N** — preenchimento em gradiente
  sólido→70% do mesmo acento, único uso decorativo permitido porque é
  discreto (uma barra fina, não uma superfície inteira).

**Onde não entram (mantido plano/sólido, propositalmente):**
- Fundo de cards de dado (tabelas, `SolicitacaoCard`, cadastros) — ficam
  `bg-surface-dark` sólido. Um card de dado que muda de tom a cada scroll é
  fadiga visual, não hierarquia.
- Botões — continuam sólidos (acento cheio) ou outline; nenhum
  `bg-gradient-to-r` em botão.
- Badges de status — continuam a fórmula fundo-translúcido/texto-sólido de
  §3.3, sem gradiente.
- `backdrop-blur`/efeito "glass" — reservado só para overlays que já
  flutuam sobre conteúdo (modal, dropdown, popover), que é exatamente onde
  `DESIGN.md` já permite sombra. Não aplicar em cards de superfície normal.

---

## 5. Classificação de componentes do TransporteApp

### 5.A — Sem equivalente numa ferramenta interna (independe da paleta)

Esta classificação **não muda** com a adoção do tema escuro — é uma questão
de função, não de cor. Nenhum destes ganha tela no SisLog:

| Componente do TransporteApp | Por que não se aplica |
|---|---|
| Hero de vendas, showcase de produto (carrossel imagem+abas), "Como funciona" em grade de marketing | Tour/demonstração pra visitante do site; construir isso no SisLog seria função nova (modo demonstração) |
| Cards de preço, depoimentos/social proof | SisLog não vende plano nem coleciona prova social — sem tela equivalente |
| CTA de trial + registro self-service | SisLog não tem auto-cadastro (`SPEC-PORTAL.md` §6.1) |
| Rodapé de contato de vendas | Suporte do portal já existe (`PortalLayout`) |

### 5.B — Ganha o tratamento escuro/gradiente/glow (ação real)

| Onde | Tratamento (ver §3-4) |
|---|---|
| Login (interno + portal) | Orb de glow atrás do card + wordmark em gradiente |
| Dashboard — KPI Cards "Estado operacional" | Número em gradiente; ícone em caixa com gradiente sutil; glow vermelho quando "Atrasadas" está ativo |
| Dashboard/Relatórios — demais KPIs, gráficos, Top N | Superfícies recoloridas para escuro; barra de ranking com gradiente sutil; gráficos com paleta ajustada (§3.4) |
| Solicitações (lista/detalhe), Cargas de Retorno, Atividade da Equipe, Cadastros | Superfícies recoloridas para `bg-surface-dark`/`bg-elevated-dark`; badges na fórmula translúcida de §3.3; badge "via Parceiro" usa `cat-partner-dark-*` (já existe) |
| `TimelineCard`/"Linha do tempo" (ambos os apps) | Nó mais recente ganha glow do acento; nós concluídos ficam sólidos; nós futuros ficam em `text-tertiary-dark` |
| Header/nav do portal | Hoje é branco — passa a escuro (`bg-surface-dark`), sublinhado ativo do azul ganha um leve glow em vez de linha 2px chapada |
| `RealtimeIndicator` | Já tem o padrão "pílula + ponto pulsante" certo — só recolorir pro escuro, sem mudar comportamento |

### 5.C — Avaliado e descartado (razão não é mais "sem tema", é densidade/função)

| Ideia considerada | Por que foi descartada |
|---|---|
| Cartões-aba do showcase (título+descrição) como o toggle Cards/Lista de Solicitações | O toggle atual é dois ícones compactos — trocar por cards com descrição adicionaria padding e reduziria densidade (`SPEC-FRONTEND.md` §1.1), independente da paleta |
| Ícone-tile de 84-90px nos nós do `TimelineCard` | Um marco de linha do tempo numa tela de detalhe compacta não deve competir em tamanho com uma seção de marketing; o nó de 24px com glow (§4) já comunica destaque sem gastar espaço |
| Zebra de fundo entre seções do Dashboard/Relatórios (como as faixas `#0A0E13` do site) | O contraste `bg-canvas-dark` × `bg-surface-dark` no nível de card já cumpre esse papel |
| Kanban por colunas (mudar status arrastando) | Função nova (muda como o dado é editado, não só a cor) — segue fora de escopo |

---

## 6. Correção de premissa sobre o estado atual

**Cargas de Retorno (`/cargas-retorno`) não é uma lista de solicitações com
checkboxes de Ct-e/MDF-e/Pamcard.** É um cadastro CRUD simples (mesmo padrão
de Motoristas/Veículos/Clientes), com 3 campos: Cliente, Local de
carregamento, Observações — tabela densa via `CrudListPage`, sem toggle de
visualização, sem Pamcard/Ct-e/MDF-e (esses campos não existem no código;
Pamcard só existe em `solicitacoes`, ligado à origem parceiro). O tema
escuro se aplica à mesma tabela `CrudListPage` que todo cadastro usa — não
transforma Cargas de Retorno num tipo de tela diferente do que já é.

---

## 7. Plano de ajuste — sistema interno (`apps/interno`)

| Tela | Estado atual | Ajuste (tema escuro/gradiente/glow, cores SisLog) |
|---|---|---|
| Login | 2 etapas, fundo grafite `#1D1E1B` | + orb de glow laranja atrás do card + wordmark "SisLog" em gradiente `#FFB37A→#FF5100` |
| Dashboard | KPIs + gráficos + Top N sobre canvas claro | Superfícies → `bg-canvas-dark`/`bg-surface-dark`; 2 KPIs "Estado operacional" com número em gradiente + ícone em caixa gradiente; glow vermelho no card "Atrasadas" quando ativo; gráficos recoloridos (§3.4) |
| Solicitações (lista/detalhe) | Cards/linhas claros, badges sólidos | Superfícies escuras; badges na fórmula translúcida (§3.3); badge "via Parceiro" com `cat-partner-dark-*` |
| Solicitação (detalhe) — `TimelineCard` | Stepper conectado (feito em versão anterior) | + glow no nó mais recente concluído |
| Cargas de Retorno | Cadastro CRUD (tabela clara) | Tabela recolorida para escuro (mesmo padrão de qualquer cadastro) |
| Atividade da Equipe | Tabela + 3 tiles, dot verde/âmbar | Superfícies escuras; dot ganha `animate-pulse` como o `RealtimeIndicator` |
| Relatórios / Relatórios Internos | KPIs + gráficos + rankings + tabela | Mesmo tratamento do Dashboard; barra de ranking com gradiente sutil |
| Cadastros (Motoristas, Veículos, etc.) | Tabela densa clara | Recolorida para escuro, sem gradiente/glow (tabela pura) |

## 8. Plano de ajuste — portal de parceiros (`apps/portal`)

| Tela | Estado atual | Ajuste |
|---|---|---|
| Login | 2 etapas, fundo azul `#1E3A8A` | + orb de glow azul atrás do card + wordmark "Portal Parceiros LHG" em gradiente `#93B4FF→#1E40AF` |
| Header/nav (`PortalLayout`) | Fundo branco, sublinhado azul 2px | Fundo passa a `bg-surface-dark`; sublinhado ativo ganha leve glow azul |
| Solicitações (lista) | Só cards, sem toggle | Superfícies escuras; badges na mesma fórmula (com status amigáveis do portal) |
| Solicitação (detalhe) | Stepper já conectado na "Linha do tempo" | + glow no nó mais recente, igual ao interno |
| Nova solicitação | Formulário em seções + quick-create | Superfícies escuras; sem gradiente/glow em formulário (foco em preenchimento, não em destaque visual) |
| Cadastros do parceiro | CRUD idêntico ao interno | Mesmo tratamento de tabela do interno |

---

## 9. Riscos e pendências de implementação

- **`DESIGN.md` precisa ser emendado** para registrar os tokens novos de §3.1
  (`bg-canvas-dark`, `bg-elevated-dark`, `border-dark`, `text-secondary-dark`,
  `text-tertiary-dark`, `portal-blue-tint-dark`, `status-dark-em_cadastro-fg`)
  e a regra de badge translúcido de §3.3 — hoje o frontmatter só documenta
  parte do modo escuro.
- **Contraste WCAG AA precisa ser validado** para cada combinação nova
  (texto sobre badge translúcido, texto secundário sobre `bg-elevated-dark`,
  séries de gráfico sobre `bg-surface-dark`) — os valores propostos aqui são
  ponto de partida, não números testados em produção.
- **Paleta de gráfico** (`chart-series-2..8`) foi pensada pra fundo claro;
  pode precisar de ajuste de luminosidade para continuar legível no escuro
  (§3.4) — verificar visualmente antes de finalizar.
- **Captura visual do TransporteApp** não foi possível nesta sessão
  (Cloudflare bloqueia download direto das imagens de produto; o
  screenshot do navegador travou até em sites neutros) — o levantamento do
  §1 vem de leitura de DOM/classes, que é preciso para estrutura mas não
  substitui conferir a aparência final lado a lado depois de implementado.

## 10. Checklist de aceite

1. Nenhuma rota, campo ou tela nova foi criada em `apps/interno` ou
   `apps/portal`.
2. Nenhum tour de produto, tela de preços ou depoimento foi criado (§5.A).
3. O único acento por app continua sendo laranja (interno) ou azul
   (portal) — nenhum esmeralda/âmbar/céu do TransporteApp foi copiado
   (§3.2).
4. Gradiente e glow aparecem só nos pontos listados em §4 — não em botões,
   não em badges, não em cards de dado, não em todo canto.
5. Nenhum raio de 12px+ foi introduzido — cantos continuam 2-4px (§1.2).
6. Todo badge de status ainda tem rótulo textual, nunca só cor/glow.
7. Cargas de Retorno continua como cadastro CRUD — nenhum checkbox de
   Ct-e/MDF-e/Pamcard foi adicionado (§6).
8. Portal continua sem dashboard, sem relatórios, sem auto-cadastro.
9. Contraste AA conferido nas combinações novas (§9) antes de ir ao ar.
10. Rodar `/impeccable audit` nas telas tocadas.
