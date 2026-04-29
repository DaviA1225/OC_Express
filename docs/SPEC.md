# SisLog LHG — Especificação Técnica do MVP

## 1. Visão geral

Sistema web multiusuário para uma equipe de 15 atendentes de uma transportadora
oficial de mineradora de ferro e manganês. O sistema organiza solicitações de
ordens de carregamento (OC) recebidas via WhatsApp, mantém cadastros compartilhados
de motoristas/veículos/clientes/materiais, gera PDFs de OC a partir de template
configurável e mantém histórico auditável. Este sistema NÃO integra com o ERP
corporativo (Protheus/Corporate via Citrix) — é um sistema paralelo de apoio.
O elo entre os dois é o número da instrução, digitado manualmente pelo atendente
após cadastrar a OC no ERP externo.

## 2. Stack técnica obrigatória

- Frontend: React 18 + TypeScript + Vite
- Estilização: Tailwind CSS + shadcn/ui (componentes via `npx shadcn@latest add`)
- Backend: Supabase (PostgreSQL 15, Auth, Storage, Row Level Security)
- Biblioteca Supabase: @supabase/supabase-js v2
- Formulários: react-hook-form + zod
- Rotas: react-router-dom v6
- Gerenciamento de estado servidor: @tanstack/react-query
- PDF: @react-pdf/renderer
- Gráficos: recharts
- Ícones: lucide-react
- Notificações: sonner
- Datas: date-fns com locale pt-BR
- Idioma da UI: 100% português do Brasil
- Formatação numérica: vírgula decimal, ponto como separador de milhar
- Formatação de data: DD/MM/AAAA

## 3. Identidade visual

- Cor primária: #1E40AF (azul corporativo)
- Cor secundária: #334155 (cinza escuro)
- Cor de destaque: #F59E0B (âmbar)
- Sucesso: #10B981
- Erro: #EF4444
- Fundo principal: #FFFFFF
- Fundo secundário: #F8FAFC
- Tipografia: Inter
- Layout padrão: sidebar à esquerda (colapsável), header no topo (nome do sistema,
  usuário logado, botão sair), conteúdo à direita

## 4. Estrutura de pastas esperada

```
sislog-lhg/
├── docs/
│   └── template-oc.png
├── public/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn components
│   │   ├── layout/          # Sidebar, Header, AppLayout
│   │   ├── forms/           # formulários reutilizáveis
│   │   └── shared/          # componentes compartilhados
│   ├── pages/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── solicitacoes/
│   │   ├── cargas-retorno/
│   │   ├── cadastros/
│   │   └── auditoria/
│   ├── features/            # lógica de domínio por módulo
│   │   ├── solicitacoes/
│   │   ├── motoristas/
│   │   ├── pdf-generator/
│   │   └── ...
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── utils.ts
│   │   └── validators.ts    # validação CPF, CNPJ, placa
│   ├── hooks/
│   ├── types/
│   │   └── database.types.ts  # gerado pela Supabase CLI
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   └── migrations/
├── .env.local
├── package.json
└── README.md
```

## 5. Modelo de dados (Supabase)

Todas as tabelas devem ter colunas padrão:
- id: uuid, primary key, default gen_random_uuid()
- created_at: timestamptz, default now()
- updated_at: timestamptz, default now()
- created_by: uuid, references auth.users

Trigger obrigatório: atualizar updated_at automaticamente em UPDATE.

### 5.1 perfis_usuarios
- user_id: uuid, FK auth.users, unique, not null
- nome_completo: text, not null
- perfil: text, check in ('admin', 'supervisor', 'atendente', 'documentacao')
- ativo: boolean, default true

### 5.2 subcontratadas
- razao_social: text, not null
- cnpj: text, unique
- contato_nome: text
- contato_telefone: text
- ativo: boolean, default true

### 5.3 motoristas
- nome_completo: text, not null
- cpf: text, unique, not null
- rg: text
- antt: text
- telefone: text
- subcontratada_id: uuid, FK subcontratadas
- observacoes: text
- ativo: boolean, default true

### 5.4 veiculos
- placa: text, unique, not null
- tipo: text  -- "Cavalo 6x2" | "Cavalo 6x4" | "Truck" | "Toco" | "Outro"
- subcontratada_id: uuid, FK subcontratadas
- observacoes: text
- ativo: boolean, default true

### 5.5 carretas
- placa: text, unique, not null
- tipo: text  -- "Basculante" | "Graneleira" | "Caçamba" | "Prancha" | "Outro"
- capacidade_ton: numeric
- observacoes: text
- ativo: boolean, default true

### 5.6 clientes
- razao_social: text, not null
- cnpj: text
- endereco: text
- cidade: text
- uf: text
- latitude: numeric
- longitude: numeric
- observacoes: text
- ativo: boolean, default true

### 5.7 materiais
- nome: text, not null, unique
- cnpj_filial: text, not null
- filial: text, not null
- origem_padrao: text
- destino_padrao: text
- observacoes_padrao: text
- ativo: boolean, default true

### 5.8 solicitacoes
- numero_interno: serial, auto-incrementado
- tipo: text, check in ('carregamento', 'retorno')
- status: text, check in ('recebida', 'em_cadastro', 'instrucao_emitida',
  'oc_gerada', 'oc_enviada', 'finalizada', 'cancelada')
- solicitante_nome: text
- solicitante_telefone: text
- motorista_id: uuid, FK motoristas
- veiculo_id: uuid, FK veiculos
- carreta_id: uuid, FK carretas  -- última carreta se houver mais de uma
- cliente_id: uuid, FK clientes
- material_id: uuid, FK materiais
- numero_instrucao: text
- observacoes: text
- atendente_id: uuid, FK auth.users
- pdf_url: text
- enviada_em: timestamptz
- finalizada_em: timestamptz
- cte_emitido: boolean, default false
- mdfe_emitido: boolean, default false
- vale_pedagio: boolean, default false
- pamcard: boolean, default false
- documentado_por: uuid, FK auth.users
- documentado_em: timestamptz

### 5.9 log_auditoria
- usuario_id: uuid, FK auth.users
- acao: text
- tabela: text
- registro_id: uuid
- dados_antes: jsonb
- dados_depois: jsonb

### 5.10 Regras adicionais do banco

- Habilitar RLS em todas as tabelas
- Política inicial: usuários autenticados podem ler e escrever tudo
- Trigger de auditoria em INSERT/UPDATE/DELETE para: solicitacoes, motoristas,
  veiculos, clientes, materiais, carretas, subcontratadas
- Bucket no Storage chamado "ocs-pdf" para PDFs das OCs
- Seed inicial de dados de teste: 3 subcontratadas, 5 motoristas, 4 veículos,
  4 carretas, 5 clientes, e os 9 materiais abaixo (exatos)

### 5.11 Seed de materiais (obrigatório e exato)

| Nome | CNPJ Filial | Filial | Origem Padrão | Destino Padrão |
|------|-------------|--------|---------------|----------------|
| MINÉRIO | 50.438.766/0003-92 | MIRANDA - MS | (vazio) | (vazio) |
| PEDRA | 50.438.766/0003-92 | MIRANDA - MS | TERENOS - MS | CORUMBÁ - MS |
| AREIA | 50.438.766/0003-92 | MIRANDA - MS | TRÊS LAGOAS - MS | CAMPO GRANDE - MS |
| SORGO | 50.438.766/0003-92 | MIRANDA - MS | BONITO - MS | CORUMBÁ - MS |
| CASCA DE SOJA | 50.438.766/0003-92 | MIRANDA - MS | DOURADOS - MS | CORUMBÁ - MS |
| CALCÁRIO | 50.438.766/0003-92 | MIRANDA - MS | MIRANDA - MS | (vazio) |
| COQUE | 50.438.766/0004-73 | BELO HORIZONTE - MG | UBERABA - MG | JATEI - MS |
| GESSO | 50.438.766/0004-73 | BELO HORIZONTE - MG | UBERABA - MG | JATEI - MS |
| SUCATA | 50.438.766/0004-73 | BELO HORIZONTE - MG | (vazio) | (vazio) |

Observação padrão para todos: "1° Obrigatório: Uso de EPIs (capacete, calça, colete
e botina). Caçambas limpas."

## 6. Módulos funcionais

### 6.1 Autenticação
- Login com email + senha via Supabase Auth
- Logout com confirmação
- Proteção de rotas: não autenticado → /login
- Após login, usuário sem perfil_usuarios não acessa nada (mostra mensagem
  "Aguardando liberação pelo administrador")

### 6.2 Cadastros (CRUD)
Entidades: subcontratadas, motoristas, veículos, carretas, clientes, materiais, usuários.

Padrão de cada tela:
- Título + botão "Novo"
- Busca em tempo real (debounce 300ms)
- Tabela com paginação de 20 itens
- Ações por linha: editar (abre Dialog), desativar/reativar (toggle ativo)
- Filtro "Mostrar inativos"
- Formulário com react-hook-form + zod
- Toast de sucesso/erro (sonner)

Validações obrigatórias:
- CPF: validar dígitos verificadores reais
- CNPJ: validar dígitos verificadores reais
- Placa: aceitar formato antigo (ABC1234) e Mercosul (ABC1D23)
- Telefone: máscara (XX) XXXXX-XXXX

Tela de usuários visível apenas para perfil 'admin'. Criar usuário envia convite
por email via Supabase Auth.

### 6.3 Solicitações (módulo principal)

Layout: cards em grid responsivo (1 col mobile, 2 tablet, 3 desktop).

Filtros no topo: busca livre, status (multi-select), período, atendente, material,
botão limpar.

Card mostra:
- Número interno (#0001) em destaque
- Badge de status colorido
- Motorista + placa cavalo / placa carreta
- Cliente + material
- Atendente + data/hora + número da instrução
- Ações: Abrir, Gerar OC (condicional), Enviar WhatsApp (condicional)

Status e cores dos badges:
- recebida: cinza
- em_cadastro: azul claro
- instrucao_emitida: âmbar
- oc_gerada: azul primário
- oc_enviada: verde claro
- finalizada: verde escuro
- cancelada: vermelho

Formulário "Nova Solicitação" (Dialog grande, em seções):
1. Solicitante: nome, telefone, tipo (radio: Carregamento ou Retorno)
2. Motorista e Veículo: combobox com autocomplete + botão "+ Cadastrar novo"
   que abre sub-dialog sem sair da tela
3. Destino e Material: cliente (combobox + cadastro rápido), material (select)
4. Observações (textarea)

Ao salvar: status = 'recebida', atendente_id = usuário logado.

Tela de detalhe da solicitação:
- Todos os dados visíveis e editáveis (se não finalizada)
- Botão "Adicionar número de instrução" (status recebida/em_cadastro) →
  muda status para 'instrucao_emitida'
- Botão "Gerar OC" (status instrucao_emitida) → abre preview e fluxo de PDF
- Botão "Cancelar solicitação" (com confirmação)
- Histórico de alterações no rodapé (consulta log_auditoria)

Transições de status válidas (não deixe pular):
- recebida → em_cadastro → instrucao_emitida → oc_gerada → oc_enviada → finalizada
- qualquer → cancelada

### 6.4 Geração de PDF da OC

Referência visual obrigatória: `docs/template-oc.png`. Reproduza fielmente o
layout, fontes, cores e disposição dos campos.

Dados do PDF:
- Cabeçalho: nome da empresa, CNPJ da filial (vindo do material), logo se
  extraível da imagem
- Corpo: número interno, filial, subcontratada, motorista, cavalo, carreta,
  carregamento (origem), destino, instrução, material
- Observações: campo observacoes_padrao do material
- Validade: data de emissão + 1 dia
- Autorizado: nome_completo do atendente logado

Fluxo:
1. Clica "Gerar OC" na tela de detalhe
2. Sistema monta PDF em memória
3. Abre Dialog com PDFViewer (preview)
4. Botões: "Baixar PDF" e "Confirmar e salvar"
5. Ao confirmar: upload ao bucket ocs-pdf com nome
   `OC_{numero_interno}_{YYYYMMDD}.pdf`, salva url no pdf_url, status → oc_gerada

Regeneração: se já existe PDF, confirmar "Deseja substituir?" antes de sobrescrever.

### 6.5 Envio WhatsApp

Botão "Enviar WhatsApp" (status oc_gerada):
- Abre nova aba com `https://wa.me/55{telefone}?text={mensagem}`
- Mensagem template:
  ```
  Olá! Segue sua Ordem de Carregamento nº {numero_interno}.
  Motorista: {nome}
  Cavalo: {placa_cavalo}
  Carregamento: {origem}
  Destino: {cliente}
  Material: {material}
  Instrução: {numero_instrucao}

  Baixe o PDF: {pdf_url}
  ```
- Após abrir, dialog: "Você enviou a OC?" → sim muda status para 'oc_enviada'

### 6.6 Cargas de Retorno

Tela igual Solicitações mas filtrada por tipo='retorno'. Cada card mostra 4
checkboxes editáveis por usuários de perfil 'documentacao': Ct-e, MDF-e, Vale
Pedágio, Pamcard. Quando todos marcados, aparece botão "Marcar documentada" que
preenche documentado_por/em e status vira 'finalizada'.

### 6.7 Dashboard

Cards no topo (4 colunas):
- OCs emitidas hoje
- Solicitações pendentes
- Cargas de retorno aguardando documentação
- Minha produtividade hoje (solicitações do usuário logado)

Gráficos (recharts):
- Barras: solicitações por material últimos 30 dias
- Linha: solicitações por dia últimos 14 dias

Tabela: últimas 10 solicitações com link pra detalhe.

### 6.8 Auditoria (admin e supervisor)

Tabela do log_auditoria com filtros (usuário, tabela, período), paginação 50.
Clicar em linha abre Dialog com JSON de dados_antes e dados_depois lado a lado
formatados.

## 7. Qualidade e robustez

- TypeScript estrito (strict: true no tsconfig)
- Zero uso de `any` (usar unknown + narrowing)
- Tipagem do banco gerada via `supabase gen types typescript`
- Todas as chamadas de rede via react-query (cache, retry, invalidação)
- Skeleton (não spinner) em carregamentos de lista/detalhe
- Estados vazios ilustrados em todas as listas
- Erros de rede com toast "Não foi possível conectar ao servidor. Tente novamente."
- Mensagens de erro em português, sem jargão técnico
- Atalhos: Ctrl+K (busca global), Ctrl+N (nova solicitação), Esc (fecha dialog)
- Responsivo: funciona em tablet e mobile (sidebar vira hamburguer < 768px)
- Commits pequenos e descritivos ao fim de cada fase

## 8. Fases de execução (ordem obrigatória)

O Claude Code deve executar em fases sequenciais, parando ao fim de cada uma
pra confirmação do usuário antes de prosseguir. Use TodoWrite para rastrear.

**Fase 0 — Setup do projeto**
- Inicializar Vite + React + TS
- Instalar dependências
- Configurar Tailwind + shadcn/ui
- Criar estrutura de pastas
- Configurar .env.local com variáveis Supabase (pedir ao usuário)
- Commit inicial

**Fase 1 — Banco de dados**
- Criar migrations SQL em supabase/migrations/
- Aplicar via supabase db push
- Gerar types TypeScript
- Inserir seed data
- Commit

**Fase 2 — Autenticação e layout base**
- Página de login
- AppLayout com sidebar + header
- Proteção de rotas
- Hook useAuth + contexto
- Dashboard placeholder
- Commit

**Fase 3 — Cadastros (todas as 7 telas)**
- Subcontratadas, Motoristas, Veículos, Carretas, Clientes, Materiais, Usuários
- Validadores CPF/CNPJ/placa em lib/validators.ts
- Commit ao fim de cada tela

**Fase 4 — Solicitações**
- Lista com filtros e cards
- Formulário de nova solicitação com cadastro rápido inline
- Tela de detalhe
- Transições de status
- Commit

**Fase 5 — Geração de PDF**
- Componente PDF em features/pdf-generator/
- Preview em Dialog
- Upload ao Storage
- Commit

**Fase 6 — WhatsApp + Cargas de Retorno + Dashboard**
- Botão e fluxo WhatsApp
- Tela de cargas de retorno com checkboxes
- Dashboard real com métricas e gráficos
- Commit

**Fase 7 — Auditoria + Polimento**
- Tela de auditoria
- Atalhos de teclado
- Revisão de responsividade
- Estados vazios e loading
- README.md completo
- Commit final

## 9. Fora do escopo deste MVP

Explicitamente NÃO implementar:
- Integração com Protheus/Corporate/Citrix
- API oficial WhatsApp Business
- Leitura automática de e-mail (IMAP/Graph)
- Assinatura digital de PDF
- Emissão de Ct-e/MDF-e
- App mobile nativo
- BI avançado além dos gráficos descritos
