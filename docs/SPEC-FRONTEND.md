# SisLog LHG — Especificação de Front-End

Este documento complementa SPEC.md. Onde SPEC.md descreve modelo de dados, fluxos
de negócio e fases de execução, este documento descreve padrões visuais, layout
de telas, comportamento de componentes e princípios de UX.

Em caso de conflito entre os dois documentos, este prevalece para questões visuais
e de interação. Para questões de domínio, SPEC.md prevalece.

---

## 1. Princípios de UX (não negociáveis)

Estes três princípios devem guiar toda decisão visual. Quando estiver em dúvida
entre duas alternativas, escolha a que respeita mais estes princípios.

### 1.1 Densidade de informação alta
Os atendentes processam até 30 atendimentos por dia. Cada clique e cada rolagem
custa tempo real. Evite espaçamento excessivo, fontes grandes demais e cards com
muito padding interno. A referência mental é "painel de controle de operação",
não "landing page de startup".

Limites concretos:
- Padding interno de cards: 12-16px (nunca 24px ou mais)
- Espaçamento entre seções: 16-24px (nunca 32px ou mais)
- Tamanho base de fonte do conteúdo: 13-14px (não 16px)
- Tamanho de fonte de labels secundárias: 10-11px com letter-spacing 0.5px

### 1.2 Atalhos de teclado em todas as ações principais
Todo botão de ação primária deve ter atalho de teclado, e o atalho deve aparecer
visível no botão ou na dica do tooltip.

Atalhos globais obrigatórios:
- Ctrl+K: abre busca global
- Ctrl+N: abre modal de Nova Solicitação (de qualquer tela)
- Esc: fecha o modal atualmente aberto
- Tab: navega entre campos do formulário
- Enter: submete o formulário do modal aberto
- /: foca o campo de busca da tela atual

### 1.3 Feedback imediato e óbvio
Toda ação do usuário gera resposta visual em menos de 200ms. Um sistema "mudo"
faz o usuário clicar de novo achando que não funcionou.

Padrões obrigatórios:
- Botões em loading mostram spinner inline e ficam disabled
- Salvamentos disparam toast (sonner) imediatamente após sucesso/erro
- Mudança de status de uma solicitação anima o badge (transição de cor 200ms)
- Listas atualizam otimisticamente — atualiza UI antes da resposta do servidor,
  reverte se falhar

---

## 2. Sistema de design

### 2.1 Cores

Definir como variáveis CSS no arquivo de tema do Tailwind ou em `globals.css`.

```
--primary: #1E40AF        (azul corporativo, ações primárias e elementos ativos)
--primary-hover: #1E3A8A  (estado hover de botões primários)
--secondary: #334155      (cinza escuro, texto principal)
--accent: #F59E0B         (âmbar, destaques e alertas brandos)
--success: #10B981        (verde, confirmações e estados positivos)
--danger: #EF4444         (vermelho, erros e ações destrutivas)
--bg-base: #FFFFFF        (fundo principal)
--bg-muted: #F8FAFC       (fundo de áreas de descanso, headers de tabela)
--border: #E2E8F0         (bordas finas, divisórias)
--text-primary: #0F172A   (texto principal)
--text-secondary: #64748B (texto secundário, labels)
--text-tertiary: #94A3B8  (texto terciário, hints, placeholders)
```

Cores de status (badges) — cada status tem fundo claro e texto escuro do mesmo
tom para garantir contraste WCAG AA:
- recebida:           bg #F1F5F9 / text #475569
- em_cadastro:        bg #DBEAFE / text #1E40AF
- instrucao_emitida:  bg #FEF3C7 / text #92400E
- oc_gerada:          bg #DBEAFE / text #1E3A8A
- oc_enviada:         bg #D1FAE5 / text #065F46
- finalizada:         bg #A7F3D0 / text #064E3B
- cancelada:          bg #FEE2E2 / text #991B1B

### 2.2 Tipografia
- Família: Inter (peso 400, 500, 600 — não usar 700 ou superior)
- Tamanhos:
  - 22px: títulos de página (h1)
  - 18px: títulos de seção (h2)
  - 14px: corpo de texto e labels de formulário
  - 13px: conteúdo de cards e tabelas
  - 11px: labels secundárias (UPPERCASE com letter-spacing 0.5px)
  - 10px: meta-informação (data/hora, contadores)
- Sentence case sempre. Nunca Title Case, nunca ALL CAPS — exceto labels
  secundárias minúsculas em maiúsculas espaçadas (descrito acima).

### 2.3 Espaçamento e raio
- Border radius padrão: 6px (botões, inputs)
- Border radius de cards: 8px
- Border radius de modais: 12px
- Espessura padrão de bordas: 1px sólido (#E2E8F0)
- Sombras: usar com extrema parcimônia. Apenas em modais e dropdowns. Padrão:
  `box-shadow: 0 4px 12px rgba(0,0,0,0.08)`

### 2.4 Componentes (usar shadcn/ui)
Sempre usar componentes do shadcn quando existirem. Não recriar do zero.

Componentes obrigatórios a instalar:
- button, input, label, textarea, select, checkbox, radio-group, switch
- dialog (para modais), sheet (para painéis laterais), drawer (para mobile)
- table, badge, separator, skeleton, scroll-area
- form (com react-hook-form), toast (com sonner)
- popover, command (para combobox de autocomplete), tooltip
- dropdown-menu, avatar, calendar, date-picker

---

## 3. Layout estrutural do app

### 3.1 Esqueleto principal
Toda página autenticada compartilha o mesmo layout base:

- Sidebar à esquerda: largura 220px (expandida) ou 64px (colapsada)
- Header no topo: altura 56px, fixo
- Área de conteúdo à direita: padding 24px, scroll vertical próprio

### 3.2 Sidebar
Conteúdo da sidebar, em ordem:

1. Logo/nome do sistema no topo (altura 56px, alinhado ao header)
2. Bloco operacional (sem label, no topo da lista):
   - Dashboard
   - Solicitações
   - Cargas de Retorno
3. Label "CADASTROS" (10px, uppercase, letter-spacing 0.5px, cor secondary)
4. Bloco de cadastros:
   - Motoristas
   - Veículos
   - Carretas
   - Clientes
   - Materiais
   - Subcontratadas
5. Label "SISTEMA" (mesmo estilo da label anterior)
6. Bloco de sistema (visível apenas para admin/supervisor):
   - Usuários (apenas admin)
   - Auditoria

Cada item tem ícone do Lucide à esquerda + rótulo. Item ativo: fundo primary
preenchido + texto branco. Item em hover: fundo muted. Botão de colapsar a
sidebar fica no rodapé da sidebar.

No mobile (< 768px), a sidebar vira um menu hambúrguer que abre como Sheet
sobreposto.

### 3.3 Header
Conteúdo do header, em ordem horizontal:

- Esquerda: botão hambúrguer (apenas mobile) + título da tela atual
- Centro: campo de busca global com placeholder "Buscar (Ctrl+K)" — abre um
  Command Palette ao clicar ou usar atalho
- Direita: avatar circular do usuário com inicial + nome + dropdown ▾
  - Dropdown contém: "Meu perfil", separador, "Sair"

### 3.4 Breadcrumb
Em telas de detalhe (não em listas), abaixo do header e acima do título da
página, mostrar breadcrumb no formato:
`Solicitações › #0287`
Cada segmento clicável volta para o nível correspondente.

---

## 4. Padrões visuais por tipo de tela

### 4.1 Padrão "Tela de lista com cards" (Solicitações, Cargas de Retorno)

Estrutura vertical:
1. Linha de cabeçalho: título à esquerda + botão primário grande à direita
2. Linha de filtros: input de busca, selects de filtros, link "Limpar"
3. Grid de cards: responsivo (1 col mobile, 2 col tablet, 3 col desktop largo)
4. Paginação no rodapé (apenas se houver mais de 30 itens)

Anatomia obrigatória do card:
- Linha 1: número (#0287, fonte 14px peso 500, cor primary) à esquerda +
  badge de status à direita
- Divisória horizontal de 1px
- Bloco em duas colunas com pares label/valor:
  - Label: 10px, uppercase, letter-spacing 0.5px, cor secondary
  - Valor: 13px, peso 400, cor primary
  - Espaçamento label-valor: 4px
  - Espaçamento entre pares: 16px
- Divisória horizontal de 1px
- Rodapé: meta (atendente · hora · instrução) em 11px cor secondary
- Linha de ações: botão "Abrir" (sempre) + 1 botão de ação contextual

Botão de ação contextual depende do status:
- recebida → "Marcar em cadastro" (outline)
- em_cadastro → "＋ Adicionar instrução" (primary azul)
- instrucao_emitida → "Gerar OC" (primary azul)
- oc_gerada → "Enviar WhatsApp" (success verde)
- oc_enviada → "Finalizar" (outline)
- finalizada/cancelada → nenhum botão extra

### 4.2 Padrão "Tela de detalhe" (detalhe da solicitação)

Estrutura vertical:
1. Breadcrumb
2. Linha de cabeçalho: título + badge de status à esquerda; ações principais à
   direita (botões grandes de status + menu ⋮ para ações secundárias)
3. Corpo em duas colunas: principal (2/3) + lateral (1/3)

Coluna principal contém cards verticais empilhados, na ordem:
- Solicitante
- Motorista e Veículo
- Destino e Material
- Instrução e PDF

Cada card tem header com título + ícone "Editar" (canto superior direito).
Editar transforma campos em inputs e revela botões "Salvar"/"Cancelar" no
rodapé do card. Edição bloqueada se status = finalizada/cancelada.

Coluna lateral contém:
- Card "Linha do tempo" — lista vertical de eventos (ícone + texto + hora)
- Card "Observações" — textarea editável inline
- Card "Anexos" — link do PDF gerado (se existir)

### 4.3 Padrão "Tela de cadastro CRUD" (Motoristas, Veículos, etc.)

Estrutura vertical:
1. Linha de cabeçalho: "Motoristas · 47 ativos" à esquerda + "＋ Novo motorista"
   à direita (botão primário azul)
2. Linha de filtros: busca + filtros específicos + toggle "Mostrar inativos"
3. Tabela densa
4. Paginação no rodapé

Tabela:
- Header com fundo bg-muted, texto 11px uppercase letter-spacing 0.5px
- Linhas com altura 44px, separador 1px entre linhas
- Hover: fundo bg-muted
- Linhas inativas: opacity 0.5, ícone de cadeado antes do nome
- Última coluna: ações inline (ícone lápis, ícone toggle ativo/inativo)
- Sem botão "deletar" — apenas desativar (preserva integridade referencial)

### 4.4 Padrão "Modal de formulário"

Largura padrão: 560px (480px em formulários simples, 720px em complexos).

Estrutura vertical interna:
1. Header do modal (16px 20px de padding):
   - Título (15px peso 500) + descrição (12px secondary)
   - Botão × no canto direito
2. Corpo (16px 20px de padding, max-height 460px com scroll se exceder):
   - Seções com label uppercase 10px letter-spacing 0.5px
   - Campos com altura 36px, padding 8px 12px, fonte 13px
   - Espaçamento entre seções: 16px
3. Rodapé (12px 20px, fundo bg-muted, separador top):
   - Esquerda: dica de atalhos em 11px tertiary ("Enter para salvar · Esc para cancelar")
   - Direita: botão "Cancelar" (outline) + botão primário azul

### 4.5 Padrão "Combobox com autocomplete + cadastro rápido"

Usado para: Motorista, Veículo, Carreta, Cliente nos formulários.

Componente: shadcn `Command` dentro de `Popover`.

Comportamento:
1. Input mostra placeholder "Buscar [entidade] por nome ou identificador…"
2. Ao focar, abre dropdown com lista dos 10 mais recentes
3. Ao digitar (debounce 200ms), filtra a lista em tempo real
4. Cada item da lista mostra: nome principal + identificador secundário em cinza
5. Se nada corresponde à busca, mostra ao final da lista:
   "Não encontrado. ＋ Cadastrar novo [entidade]" — clicável
6. Clicar em "Cadastrar novo" abre sub-modal sobreposto ao modal pai
7. Sub-modal tem o formulário simplificado da entidade
8. Ao salvar o sub-modal: fecha o sub-modal, novo item já aparece selecionado
   no combobox do modal pai, foco volta para o próximo campo

---

## 5. Comportamentos obrigatórios

### 5.1 Loading states
- Listas/tabelas em carregamento: usar Skeleton do shadcn, NUNCA spinner genérico
- Botões em loading: spinner inline + texto "Salvando…", botão fica disabled
- Página inteira em carregamento (mudança de rota): Skeleton do layout esperado,
  não tela em branco

### 5.2 Estados vazios
Toda lista vazia mostra centralizado:
- Ilustração simples (ícone Lucide grande, 48px, cor tertiary)
- Texto principal (14px primary): explica o estado
- Texto secundário (12px secondary): orientação amigável
- Botão de ação primária (CTA), se aplicável

Exemplos:
- Lista de solicitações vazia: "Nenhuma solicitação ainda" + "Que tal criar a
  primeira?" + botão "＋ Nova solicitação"
- Filtro sem resultado: "Nada encontrado com esses filtros" + "Tente limpar
  alguns filtros" + botão "Limpar filtros"

### 5.3 Mensagens de erro
- Sempre em português, sem jargão técnico
- Erros de validação: aparecem abaixo do campo errado, em vermelho 11px
- Erros de rede: toast vermelho "Não foi possível conectar ao servidor. Tente
  novamente."
- Erros de regra de negócio: toast com mensagem específica e amigável. Ex:
  "Esse CPF já está cadastrado para o motorista João Pereira"
- Erros 500 inesperados: toast "Algo deu errado. Tente novamente em instantes"
  + log no console com detalhes

### 5.4 Confirmações destrutivas
Ações destrutivas (cancelar solicitação, desativar motorista, deletar template)
exigem confirmação via Dialog:
- Título: "Tem certeza?"
- Descrição: explica o impacto da ação
- Botão primário: vermelho ("Sim, cancelar solicitação")
- Botão secundário: outline ("Voltar")

NÃO confirmar ações reversíveis (salvar formulário, mudar filtro, etc.).

### 5.5 Notificações (toasts)
- Posição: canto inferior direito
- Duração padrão: 4 segundos
- Sucesso: verde com ícone de check
- Erro: vermelho com ícone de alerta
- Informativo: azul com ícone de info
- NUNCA usar alert() do navegador

### 5.6 Acessibilidade
- Todos os botões e links com texto descritivo (aria-label se for só ícone)
- Foco visível em todos os elementos interativos: ring 2px na cor primary
- Contraste mínimo WCAG AA em todos os textos
- Navegação por teclado funcional em modais (Tab cicla, Esc fecha, Enter submete)
- Modais com foco preso (focus trap) e foco automático no primeiro campo
- Labels de formulário associadas aos inputs via htmlFor/id

### 5.7 Responsividade
Breakpoints (alinhar com Tailwind):
- Mobile: < 768px
- Tablet: 768-1024px
- Desktop: 1024-1280px
- Desktop largo: > 1280px

Comportamento por breakpoint:
- Mobile: sidebar vira hambúrguer; cards em 1 coluna; tabelas em modo card
  (cada linha vira um pequeno card empilhado)
- Tablet: sidebar colapsada por padrão; cards em 2 colunas
- Desktop: sidebar expandida; cards em 2-3 colunas conforme largura
- Desktop largo: cards em 3 colunas; modais com 720px se forem complexos

---

## 6. Telas específicas — diretrizes complementares

### 6.1 Login (/login)
- Página fullscreen, fundo bg-muted
- Card centralizado, 400px de largura, sombra sutil
- Topo do card: nome "SisLog LHG" em 22px peso 500
- Subtítulo: "Sistema de Gestão de Carregamentos" em 13px secondary
- Campos: email + senha (com botão olho para mostrar/ocultar)
- Link "Esqueci minha senha" alinhado à direita, 12px primary
- Botão "Entrar" 100% de largura, primary azul
- Rodapé do card: "v1.0.0 · LHG Logística" em 11px tertiary

### 6.2 Dashboard (/dashboard)
Conforme descrito na seção 4 (padrão de tela), com layout específico:
1. Saudação personalizada: "Boa tarde, [Nome]. Aqui está o resumo do dia."
2. Grid de 4 cards de métrica (responsivo: 4 col desktop, 2 col tablet, 1 col mobile)
   - Cada card: label uppercase 11px + número 22px peso 500 + delta 11px tertiary
3. Grid de 2 gráficos lado a lado (1 col em mobile)
   - Recharts. Sem legenda excessiva. Tooltip ao hover.
4. Tabela "Últimas 10 solicitações" largura total
5. Link "Ver todas →" no rodapé da tabela

### 6.3 Solicitações (/solicitacoes)
Conforme padrão 4.1. Botão primário "＋ Nova (Ctrl+N)".

Filtros específicos: status (multi-select), período (Hoje/7 dias/Mês/Customizado),
material (select), atendente (select, apenas para supervisor/admin).

### 6.4 Detalhe da Solicitação (/solicitacoes/:id)
Conforme padrão 4.2.

Ações no header (lado direito) variam conforme status:
- recebida: botão "Marcar em cadastro" (outline) + botão "Cancelar" (ghost vermelho)
- em_cadastro: botão "＋ Adicionar instrução" (primary)
- instrucao_emitida: botão "Gerar OC" (primary azul)
- oc_gerada: botão "Enviar WhatsApp" (success verde) + botão "Regerar OC" (outline)
- oc_enviada: botão "Finalizar" (outline)
- finalizada/cancelada: apenas botão "Duplicar" (ghost)

Menu ⋮ contém: Duplicar, Imprimir, Cancelar (se aplicável).

### 6.5 Modal Nova Solicitação
Conforme padrão 4.4 (largura 560px) e 4.5 (comboboxes).

Estrutura de seções:
1. SOLICITANTE: nome, telefone (máscara), tipo (radio: Carregamento/Retorno)
2. MOTORISTA E VEÍCULO: motorista (combobox+cadastro), cavalo (combobox+cadastro),
   carreta (combobox+cadastro)
3. DESTINO E MATERIAL: cliente (combobox+cadastro), material (select simples)
4. OBSERVAÇÕES: textarea opcional, 2 linhas

Validação: motorista, cavalo, cliente, material são obrigatórios. Carreta opcional
(pode haver caminhão sem carreta). Telefone obrigatório se for tipo Carregamento
(pra envio WhatsApp depois).

### 6.6 Modal Geração de PDF (subir referência visual)
Quando a Fase 5 chegar, este modal precisa de tratamento visual especial.
Documentado em separado quando o template for fornecido.

### 6.7 Cadastros (Motoristas, Veículos, Carretas, Clientes, Materiais, Subcontratadas)
Conforme padrão 4.3.

Colunas específicas por entidade:

**Motoristas:** Nome, CPF, ANTT, Telefone, Subcontratada, Ativo
**Veículos:** Placa, Tipo, Subcontratada, Ativo
**Carretas:** Placa, Tipo, Capacidade (ton), Ativo
**Clientes:** Razão Social, CNPJ, Cidade/UF, Mapa, Ativo
**Materiais:** Nome, Filial, Origem padrão, Destino padrão, Ativo
**Subcontratadas:** Razão Social, CNPJ, Contato, Ativo

Tela de Clientes: coluna "Mapa" mostra link "Ver no mapa" (12px primary) que abre
Google Maps em nova aba se latitude/longitude estiverem preenchidas.

Tela de Materiais: ao editar, mostrar preview do bloco de observações como
ficaria no PDF (texto formatado em fonte mono 11px).

### 6.8 Cargas de Retorno (/cargas-retorno)
Idêntica a Solicitações com filtro fixo tipo='retorno'. Diferenças nos cards:
- Após o bloco de informações, antes da divisória de rodapé, adicionar linha
  com 4 checkboxes inline: Ct-e | MDF-e | Vale Pedágio | Pamcard
- Checkboxes editáveis se usuário tem perfil 'documentacao' ou superior
- Quando os 4 estão marcados, esconder checkboxes e mostrar botão
  "Marcar como documentada" (success verde) ocupando a mesma linha

### 6.9 Auditoria (/auditoria)
Layout puramente tabular, denso.

Tabela com colunas: Data/Hora · Usuário · Ação · Tabela · Registro · Ver

Filtros no topo: usuário (select), tabela (select), ação (select), período.

Coluna "Ver" tem botão "Ver detalhes" que abre Dialog grande (720px) com:
- Header: descrição da ação
- Corpo em duas colunas: "ANTES" (json formatado, fundo vermelho claro pra
  campos removidos) + "DEPOIS" (json formatado, fundo verde claro pra campos
  adicionados)
- Rodapé: botão "Fechar"

---

## 7. Iconografia

Biblioteca: lucide-react (já listada na stack do SPEC.md).

Mapeamento obrigatório de ícones para itens da sidebar:
- Dashboard: LayoutDashboard
- Solicitações: Inbox
- Cargas de Retorno: RotateCcw
- Motoristas: User
- Veículos: Truck
- Carretas: Container
- Clientes: Building2
- Materiais: Package
- Subcontratadas: Handshake
- Usuários: Users
- Auditoria: Search

Tamanhos:
- Ícones de sidebar: 18px
- Ícones em botões: 16px
- Ícones em badges: 12px
- Ícones de estado vazio: 48px

NÃO usar emojis em produção. Usar componentes Lucide.

---

## 8. Anti-padrões — o que NÃO fazer

Quando a IA gerar interfaces, ela tende a cair nestes vícios. Revisar e corrigir
sempre:

- **Padding excessivo em cards** (24px ou mais) — reduzir para 12-16px
- **Fontes grandes demais para corpo de conteúdo** (16px+) — reduzir para 13-14px
- **Headings exagerados** (32px+) — máximo 22px para h1
- **Espaço em branco "respirando" demais** entre seções — reduzir para 16-24px
- **Spinners genéricos no meio da tela** — usar Skeleton com shape do conteúdo
- **alert() ou confirm() do navegador** — usar Dialog/Toast do shadcn
- **Confirmação para ações reversíveis** (salvamentos rotineiros) — não confirmar
- **Botões "Deletar" em CRUD** — apenas "Desativar"
- **Cores fora da paleta definida** — sempre usar variáveis CSS
- **Sombras pesadas em cards** — apenas borda 1px sólida
- **Gradientes** — não usar em nenhum lugar (UI corporativa, flat design)
- **Sentence case errado** — botões em "Salvar solicitação", não "Salvar Solicitação"
- **Ícones inconsistentes** — sempre lucide-react, nunca mix com outras libs
- **Ações primárias não distintas das secundárias** — primária sempre azul preenchido,
  secundária outline
- **Modais sobrepondo-se demais (3+ níveis)** — máximo 2 níveis (modal pai + sub-modal
  de cadastro rápido)
- **Tabelas com horizontal scroll em desktop** — repensar colunas ou modo card

---

## 9. Checklist de revisão por tela

Quando o Claude Code entregar uma tela, verificar nesta ordem:

1. **Estrutura:** segue o padrão da seção 4 correspondente?
2. **Cores:** todas vindas das variáveis CSS da seção 2.1?
3. **Tipografia:** tamanhos da seção 2.2 respeitados?
4. **Espaçamentos:** dentro dos limites da seção 1.1?
5. **Componentes:** usando shadcn (não recriações)?
6. **Estados:** loading (Skeleton), vazio (com CTA), erro (toast amigável)?
7. **Acessibilidade:** foco visível, navegação por teclado, aria-labels?
8. **Responsividade:** funciona em mobile (testar < 768px)?
9. **Atalhos:** os relevantes da seção 1.2 estão funcionando?
10. **Sem anti-padrões:** nenhum item da seção 8 presente?

Se algum item falhar, dar feedback objetivo ao Claude Code referenciando a seção
deste documento. Exemplo: "A tela de Solicitações viola seção 1.1 — padding dos
cards está em 24px, ajustar para 16px."

---

## 10. Documentos relacionados

- `SPEC.md` — especificação principal (modelo de dados, fluxos, fases)
- `SPEC-FRONTEND.md` — este documento (padrões visuais e de UX)
- `docs/template-oc.png` — referência visual do PDF gerado (Fase 5)
- `README.md` — instruções de instalação e operação (gerado na Fase 7)
