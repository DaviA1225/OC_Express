# SisLog LHG — Especificação do Portal Externo de Parceiros

Este documento descreve a Fase 8 do projeto: um portal web isolado para
transportadoras parceiras cadastrarem suas próprias bases de motoristas/
veículos/carretas/subcontratadas e enviarem solicitações de carregamento
diretamente para a inbox da equipe interna do SisLog LHG.

**Pré-requisito:** O sistema interno (Fases 0-7 + Patch Pamcard) deve estar
funcionando em produção por pelo menos 3-4 semanas antes de iniciar esta fase.

**Pré-requisito adicional:** Aprovação formal do TI/Segurança da J&F para
acesso externo, e confirmação com a(s) transportadora(s) parceira(s) de que
aceitarão usar o portal.

Em caso de conflito com SPEC.md, SPEC-FRONTEND.md ou SPEC-PATCH-PAMCARD.md,
este documento prevalece para tudo relacionado ao portal externo. Para o
sistema interno, os documentos originais continuam válidos.

---

## 1. Visão geral

O Portal Externo é uma aplicação web isolada, com URL própria, que permite a
transportadoras parceiras:

- Manter sua própria base de motoristas, veículos, carretas e subcontratadas
- Criar solicitações de carregamento que caem diretamente na inbox da equipe
  interna do SisLog LHG
- Ver a lista das solicitações que já enviaram, com status básico

**O portal NÃO permite:**
- Ver dados de outros parceiros (isolamento total via RLS)
- Ver a base interna de motoristas/clientes/materiais da LHG
- Ver outras solicitações que não as do próprio parceiro
- Acessar a inbox da equipe interna
- Baixar o PDF da OC (a equipe interna encaminha o PDF por WhatsApp ou e-mail,
  igual ao fluxo atual com motoristas avulsos)
- Escolher o material da carga (a equipe interna define no momento do
  processamento)

**Filosofia do portal:** ele é uma porta de entrada para solicitações
estruturadas. Não é um sistema de acompanhamento, não é um repositório de
documentos, não é um dashboard de gestão. É **uma porta**, simples e enxuta.

---

## 2. Arquitetura

### 2.1 Decisão arquitetural: mesma base de dados, aplicações separadas

O portal e o sistema interno compartilham a **mesma instância Supabase** (mesmo
banco PostgreSQL, mesmo Auth). Mas são **duas aplicações React separadas**,
cada uma com sua URL.

Justificativa:
- Compartilhar o banco permite que solicitações do portal apareçam
  instantaneamente na inbox interna (mesma tabela `solicitacoes`)
- Aplicações separadas evitam que código do portal acidentalmente exponha
  dados internos, e vice-versa
- Custo operacional menor (um único Supabase, não dois)
- A segurança vem da camada RLS, não de separação física

### 2.2 Estrutura de pastas (monorepo simples)

Reorganizar o projeto da seguinte forma:

```
sislog-lhg/
├── apps/
│   ├── interno/        # aplicação React do sistema interno (atual)
│   └── portal/         # nova aplicação React do portal externo
├── packages/
│   └── shared/         # tipos, validadores, lib supabase compartilhados
├── supabase/
│   └── migrations/
├── docs/
└── ...
```

Cada `apps/*` é um projeto Vite independente, com seu próprio `package.json`,
mas ambos consomem os pacotes em `packages/shared`. Use npm workspaces ou
pnpm workspaces para gerenciar.

### 2.3 URLs

- Sistema interno: `sislog.lhg.com.br` (ou subdomínio interno)
- Portal externo: `parceiros.lhg.com.br`

Ambas apontam para a mesma instância Supabase, mas com aplicações React
diferentes hospedadas em ambientes diferentes (ex: Vercel, Netlify, ou
servidor interno).

### 2.4 Identidade visual do portal

O portal precisa parecer um sistema **diferente** do interno, para deixar
claro ao parceiro que ele é fornecedor, não funcionário. Manter o mesmo
sistema de design (shadcn, Inter, etc.), mas com:

- Logo no canto superior esquerdo: "Portal Parceiros LHG"
- Cor primária: mesma (#1E40AF), para manter coesão de marca
- Cor de acento: trocar para azul mais escuro (#1E3A8A) em vez de âmbar, para
  diferenciar sutilmente
- Sem sidebar (interface mais simples) — usar navegação horizontal no topo
- Footer com link "Suporte" abrindo email ou WhatsApp da equipe LHG

---

## 3. Modelo de dados

Todas as tabelas novas seguem o padrão de colunas obrigatórias do SPEC.md
(id, created_at, updated_at, created_by).

### 3.1 parceiros

Representa uma transportadora parceira (uma empresa).

- `razao_social`: text, not null
- `cnpj`: text, unique, not null
- `contato_principal_nome`: text
- `contato_principal_telefone`: text
- `contato_principal_email`: text
- `codigo_interno`: text, unique  -- código curto pra exibição: "TRANSX", "BHTRANSP"
- `ativo`: boolean, default true
- `observacoes_internas`: text  -- visível só pra equipe interna

### 3.2 parceiro_usuarios

Cada pessoa da transportadora parceira que tem acesso ao portal.

- `user_id`: uuid, FK auth.users, unique, not null
- `parceiro_id`: uuid, FK parceiros, not null
- `nome_completo`: text, not null
- `email`: text, not null  -- redundante com auth.users.email para queries
- `perfil`: text, check in ('admin_parceiro', 'operador_parceiro')
- `ativo`: boolean, default true

Perfis:
- `admin_parceiro`: pode gerenciar usuários do próprio parceiro e tem acesso
  a tudo do portal
- `operador_parceiro`: cria solicitações e gerencia cadastros, mas não
  gerencia usuários

### 3.3 parceiro_motoristas

Base de motoristas isolada do parceiro. Estrutura idêntica à tabela
`motoristas` do sistema interno, mas com FK obrigatória para `parceiros`.

- `parceiro_id`: uuid, FK parceiros, not null
- `nome_completo`: text, not null
- `cpf`: text, not null
- `rg`: text
- `antt`: text
- `telefone`: text
- `subcontratada_parceiro_id`: uuid, FK parceiro_subcontratadas (nullable)
- `observacoes`: text
- `ativo`: boolean, default true

**Constraint:** `UNIQUE (parceiro_id, cpf)` — mesmo CPF pode existir em
parceiros diferentes (motorista que trabalha pra dois), mas único dentro de
um parceiro.

### 3.4 parceiro_veiculos (cavalos)

- `parceiro_id`: uuid, FK parceiros, not null
- `placa`: text, not null
- `tipo`: text  -- mesmas opções do sistema interno
- `subcontratada_parceiro_id`: uuid, FK parceiro_subcontratadas (nullable)
- `observacoes`: text
- `ativo`: boolean, default true

**Constraint:** `UNIQUE (parceiro_id, placa)`.

### 3.5 parceiro_carretas

- `parceiro_id`: uuid, FK parceiros, not null
- `placa`: text, not null
- `tipo`: text
- `capacidade_ton`: numeric
- `observacoes`: text
- `ativo`: boolean, default true

**Constraint:** `UNIQUE (parceiro_id, placa)`.

### 3.6 parceiro_subcontratadas

- `parceiro_id`: uuid, FK parceiros, not null
- `razao_social`: text, not null
- `cnpj`: text
- `contato_nome`: text
- `contato_telefone`: text
- `ativo`: boolean, default true

**Constraint:** `UNIQUE (parceiro_id, cnpj)` quando CNPJ não nulo.

### 3.7 Alterações na tabela `solicitacoes` existente

Adicionar colunas para vincular a solicitação ao parceiro de origem:

- `parceiro_id`: uuid, FK parceiros, nullable
- `parceiro_usuario_id`: uuid, FK parceiro_usuarios, nullable
- `parceiro_motorista_id`: uuid, FK parceiro_motoristas, nullable
- `parceiro_veiculo_id`: uuid, FK parceiro_veiculos, nullable
- `parceiro_carreta_id`: uuid, FK parceiro_carretas, nullable
- `parceiro_subcontratada_id`: uuid, FK parceiro_subcontratadas, nullable

**Mudança no campo `material_id`:**

A coluna `material_id` em `solicitacoes` precisa virar nullable, porque
solicitações vindas de parceiros NÃO trazem material preenchido — a equipe
interna define depois.

```sql
ALTER TABLE solicitacoes
  ALTER COLUMN material_id DROP NOT NULL;
```

Mas adicionar uma constraint que garante que material está preenchido a
partir do momento que a solicitação avança no fluxo:

```sql
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_material_obrigatorio_apos_cadastro
  CHECK (
    status IN ('recebida', 'cancelada')
    OR material_id IS NOT NULL
  );
```

Em linguagem simples: solicitação pode estar sem material apenas se ainda
está em `recebida` ou se foi `cancelada`. Em qualquer outro status, o
material precisa estar preenchido.

**Regra de integridade adicional (via CHECK constraint):**

Quando `origem = 'parceiro'`:
- `parceiro_id`, `parceiro_usuario_id`, `parceiro_motorista_id` são
  obrigatórios
- `motorista_id`, `veiculo_id`, `carreta_id` (referências internas) devem
  ser NULL
- `parceiro_veiculo_id` é obrigatório
- `parceiro_carreta_id` é opcional (mesma lógica do interno)
- `material_id` pode ser NULL inicialmente (a equipe interna preenche depois)

Quando `origem != 'parceiro'`:
- Campos `parceiro_*` devem ser NULL
- Campos internos seguem regra original

---

## 4. Segurança — RLS (Row Level Security)

Esta seção é **crítica**. Erros aqui vazam dados entre parceiros.

### 4.1 Funções auxiliares

Criar function no Postgres que retorna o `parceiro_id` do usuário atual,
ou NULL se não for usuário de parceiro:

```sql
CREATE OR REPLACE FUNCTION get_current_parceiro_id()
RETURNS uuid AS $$
  SELECT parceiro_id FROM parceiro_usuarios
  WHERE user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

E outra que retorna se o usuário é da equipe interna:

```sql
CREATE OR REPLACE FUNCTION is_interno()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE user_id = auth.uid() AND ativo = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 4.2 Políticas por tabela `parceiro_*`

Para cada tabela `parceiro_motoristas`, `parceiro_veiculos`,
`parceiro_carretas`, `parceiro_subcontratadas`:

```sql
ALTER TABLE parceiro_motoristas ENABLE ROW LEVEL SECURITY;

-- Parceiro só vê os seus
CREATE POLICY "parceiro_ve_proprios_motoristas"
  ON parceiro_motoristas FOR SELECT
  USING (parceiro_id = get_current_parceiro_id());

-- Parceiro só cria pra si
CREATE POLICY "parceiro_cria_proprios_motoristas"
  ON parceiro_motoristas FOR INSERT
  WITH CHECK (parceiro_id = get_current_parceiro_id());

-- Parceiro só edita os seus
CREATE POLICY "parceiro_edita_proprios_motoristas"
  ON parceiro_motoristas FOR UPDATE
  USING (parceiro_id = get_current_parceiro_id())
  WITH CHECK (parceiro_id = get_current_parceiro_id());

-- Equipe interna vê todos (somente leitura via aplicação)
CREATE POLICY "interno_le_todos_motoristas"
  ON parceiro_motoristas FOR SELECT
  USING (is_interno());
```

Replicar padrão para `parceiro_veiculos`, `parceiro_carretas`,
`parceiro_subcontratadas`.

### 4.3 Política para tabela `solicitacoes`

```sql
-- Parceiro vê só suas solicitações
CREATE POLICY "parceiro_ve_proprias_solicitacoes"
  ON solicitacoes FOR SELECT
  USING (
    (origem = 'parceiro' AND parceiro_id = get_current_parceiro_id())
    OR is_interno()
  );

-- Parceiro só cria com origem=parceiro
CREATE POLICY "parceiro_cria_solicitacoes_proprias"
  ON solicitacoes FOR INSERT
  WITH CHECK (
    (origem = 'parceiro' AND parceiro_id = get_current_parceiro_id())
    OR is_interno()
  );

-- Parceiro pode cancelar a própria enquanto status = recebida
CREATE POLICY "parceiro_cancela_propria_solicitacao"
  ON solicitacoes FOR UPDATE
  USING (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'recebida'
  )
  WITH CHECK (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
  );

-- Equipe interna atualiza qualquer solicitação
CREATE POLICY "interno_atualiza_solicitacoes"
  ON solicitacoes FOR UPDATE
  USING (is_interno())
  WITH CHECK (is_interno());
```

### 4.4 Política para tabela `parceiros` e `parceiro_usuarios`

```sql
CREATE POLICY "parceiro_ve_propria_empresa"
  ON parceiros FOR SELECT
  USING (id = get_current_parceiro_id() OR is_interno());

CREATE POLICY "admin_parceiro_ve_proprios_usuarios"
  ON parceiro_usuarios FOR SELECT
  USING (
    parceiro_id = get_current_parceiro_id()
    OR is_interno()
  );

-- Apenas admin_parceiro pode criar/editar usuários do próprio parceiro
CREATE POLICY "admin_parceiro_gerencia_usuarios"
  ON parceiro_usuarios FOR ALL
  USING (
    parceiro_id = get_current_parceiro_id()
    AND EXISTS (
      SELECT 1 FROM parceiro_usuarios pu
      WHERE pu.user_id = auth.uid()
        AND pu.perfil = 'admin_parceiro'
        AND pu.ativo = true
    )
  );
```

### 4.5 Bloqueio explícito de acesso a tabelas internas

Para garantir que parceiro NUNCA acesse `motoristas`, `veiculos`, `carretas`,
`clientes`, `materiais`, `subcontratadas` ou `perfis_usuarios` do sistema
interno, as políticas dessas tabelas devem ser restritivas:

```sql
-- Exemplo para motoristas (sistema interno)
CREATE POLICY "apenas_interno_ve_motoristas"
  ON motoristas FOR SELECT
  USING (is_interno());

-- Bloqueia INSERT/UPDATE/DELETE também para não-internos
CREATE POLICY "apenas_interno_modifica_motoristas"
  ON motoristas FOR ALL
  USING (is_interno())
  WITH CHECK (is_interno());
```

Aplicar padrão similar a todas as tabelas internas.

---

## 5. Telas do Portal

Toda tela do portal segue os padrões de UX do SPEC-FRONTEND.md (densidade
alta, atalhos, feedback imediato, cores, tipografia), com adaptações
descritas aqui.

### 5.1 Layout estrutural

Diferente do sistema interno (sidebar), o portal usa **navegação horizontal**
no topo:

- Linha 1 (header, 56px): logo "Portal Parceiros LHG" + nome do parceiro
  logado à direita + avatar do usuário + dropdown
- Linha 2 (nav, 44px): navegação horizontal com itens:
  - Solicitações
  - Motoristas
  - Veículos
  - Carretas
  - Subcontratadas
  - (apenas admin_parceiro) Usuários
- Conteúdo abaixo, com padding 24px

Sem dashboard inicial. Após login, o usuário cai direto na lista de
solicitações.

### 5.2 Login (`/`)

Mesmo padrão visual do login interno, mas com:
- Título: "Portal Parceiros LHG"
- Subtítulo: "Acesso para transportadoras parceiras"
- Sem link "Esqueci senha" no MVP do portal — orientação para procurar admin
  do parceiro ou suporte LHG

### 5.3 Solicitações (`/solicitacoes`)

**Tela inicial após login.**

Estrutura similar à tela de Solicitações do sistema interno (cards em grid),
mas mais enxuta:

- Cabeçalho: "Minhas solicitações" + botão grande "＋ Nova solicitação"
- Filtros: busca (motorista, placa) + status + período
- Cards mostrando:
  - Número da solicitação (gerado pelo sistema, igual ao interno)
  - Status (label amigável, não técnico — ver mapeamento abaixo)
  - Data de envio
  - Motorista (nome) + placa cavalo / placa carreta
  - Cliente

**Mapeamento de status para labels amigáveis no portal:**

- `recebida` → "Enviada"
- `em_cadastro` → "Em processamento"
- `instrucao_emitida` → "Em processamento"
- `oc_gerada` → "OC pronta (verifique seu WhatsApp/e-mail)"
- `oc_enviada` → "OC pronta (verifique seu WhatsApp/e-mail)"
- `finalizada` → "Concluída"
- `cancelada` → "Cancelada"

O parceiro **não vê** distinções internas de status que não significam nada
para ele. A UX é "enviei → estão processando → tá pronta → acabou".

Sem detalhes profundos sobre o PDF. Sem botão de download.

### 5.4 Detalhe da solicitação (`/solicitacoes/:id`)

Tela simples, sem coluna lateral. Mostra:

- Header: "Solicitação #0287" + status amigável (badge)
- Card "Dados da solicitação":
  - Solicitante (nome do usuário do parceiro)
  - Motorista (nome + CPF)
  - Cavalo (placa + tipo)
  - Carreta (placa + tipo, se houver)
  - Subcontratada (razão social, se houver)
  - Cliente
  - Pamcard: "Tem cartão (número: XXXX XXXX XXXX)" ou "Não tem cartão"
  - Observações
- Card "Linha do tempo" simples (lista vertical):
  - Data/hora — "Solicitação enviada por [usuário]"
  - Data/hora — "Em processamento pela LHG" (quando status muda)
  - Data/hora — "OC pronta — enviada por WhatsApp/e-mail" (quando status muda)
  - Data/hora — "Concluída" (quando finalizada)

Botão único no header: "✕ Cancelar solicitação" (visível **apenas** quando
status = 'recebida'). Ao clicar, dialog de confirmação.

### 5.5 Nova solicitação (`/solicitacoes/nova`)

**Tela cheia** (não modal), porque é a função principal do portal e faz
sentido aproveitar o espaço.

Layout em uma coluna central de 720px, com seções empilhadas:

**Seção 1: Motorista e Veículo**

Comboboxes com autocomplete (mesmo padrão 4.5 do SPEC-FRONTEND.md):
- Motorista: lista da base do parceiro (`parceiro_motoristas` onde
  `parceiro_id` = logado)
- Cavalo: lista da base do parceiro
- Carreta: lista da base do parceiro (opcional — alguns caminhões não têm)
- Subcontratada: lista da base do parceiro (opcional)

Cada combobox tem link "＋ Cadastrar novo" que abre sub-modal.

**Seção 2: Destino**

- Cliente: **select** (não combobox com cadastro). O parceiro escolhe entre
  os clientes da LHG (sua base interna de clientes ativos, somente leitura).
  O parceiro **não cadastra clientes** — escolhe entre os que a LHG já atende.

**A escolha de material é feita pela equipe interna, não pelo parceiro.**

**Seção 3: Pagamento (Pamcard)**

Igual ao sistema interno (conforme SPEC-PATCH-PAMCARD.md seção 3.2). Mesma
validação de input numérico, mesmos comportamentos.

**Seção 4: Observações**

Textarea livre, opcional. Espaço para o parceiro deixar instruções específicas
("motorista chega na mina às 14h", "carreta nova, primeira viagem", etc.).

Botão grande "Enviar solicitação" no rodapé (primary). Ao clicar:
- Cria registro em `solicitacoes` com:
  - `origem = 'parceiro'`
  - `parceiro_id`, `parceiro_usuario_id` preenchidos automaticamente
  - Os IDs de `parceiro_motorista_id`, `parceiro_veiculo_id`, etc.
  - `cliente_id` preenchido
  - `material_id = NULL` (equipe interna define depois)
  - `pamcard_status` e `pamcard_numero` conforme escolha
  - `status = 'recebida'`
- Toast: "Solicitação enviada com sucesso. A equipe LHG processará em breve.
  Você receberá a OC pelo WhatsApp/e-mail."
- Redireciona para `/solicitacoes/:id` (detalhe)

### 5.6 Cadastros do parceiro

Telas idênticas às telas de cadastro do sistema interno (seção 4.3 do
SPEC-FRONTEND.md), mas operando nas tabelas `parceiro_*`:

- Motoristas
- Veículos
- Carretas
- Subcontratadas

Mesmo padrão: lista com busca, modal de criar/editar, validações
(CPF, CNPJ, placa). Mesma estética dos cadastros internos.

### 5.7 Usuários do parceiro (apenas admin_parceiro)

Tela acessível apenas para usuários com `perfil = 'admin_parceiro'`.

Permite:
- Listar usuários do próprio parceiro
- Convidar novo usuário (cria conta no Supabase Auth via signup com email)
- Editar perfil de usuário existente
- Desativar usuário

---

## 6. Comportamentos especiais

### 6.1 Onboarding do parceiro

Não é auto-cadastro. Fluxo:

1. Equipe interna LHG cadastra o parceiro (`parceiros`) via tela
   interna no SisLog
2. Equipe interna cria o **primeiro usuário admin_parceiro** via convite
   Supabase Auth (envia email com link de set de senha)
3. Esse admin_parceiro entra no portal, define senha, e a partir daí
   gerencia os usuários da própria empresa

Telas internas adicionais necessárias (que serão criadas como parte da Fase 8):
- `/cadastros/parceiros` no SisLog interno: CRUD de parceiros
- `/cadastros/parceiros/:id/usuarios`: gerenciar usuários iniciais de um parceiro

### 6.2 Solicitações do parceiro na inbox interna

Quando o parceiro cria uma solicitação, ela aparece **automaticamente** na
tela de Solicitações do SisLog interno (via mesma tabela `solicitacoes`),
com:

- Badge "via [Parceiro]" no card (conforme SPEC-PATCH-PAMCARD.md seção 3.3)
- Filtro "Origem = Parceiros" disponível para isolar
- **Material vazio** — o card destaca isso visualmente (badge cinza
  "Material a definir" no lugar onde normalmente apareceria o material)

### 6.3 Fluxo interno ao receber solicitação de parceiro

Quando uma solicitação vem de parceiro, a equipe interna processa **igual a
qualquer outra**, com duas diferenças mínimas:

1. **Definir material:** antes de poder avançar para `instrucao_emitida`, a
   equipe precisa selecionar o material da carga. Na tela de detalhe interna,
   se `material_id IS NULL`, mostrar campo de seleção de material em
   destaque no card "Destino e Material", com banner "⚠ Material ainda não
   definido — selecione antes de prosseguir".

2. **Conferir os dados:** os dados vieram do parceiro, então é boa prática
   conferir antes de gerar a OC. Não é um status separado — é só uma
   recomendação operacional. Toda a tela de detalhe permite edição enquanto
   status não for `finalizada`, então a equipe pode corrigir o que precisar.

A partir daí, fluxo idêntico: cadastro no Corporate → instrução → geração
de PDF → envio.

### 6.4 Envio do PDF para o parceiro

A equipe interna gera o PDF da OC normalmente e o envia para o parceiro pelo
**WhatsApp ou e-mail** — usando o contato do parceiro cadastrado em
`parceiros.contato_principal_telefone` ou `parceiros.contato_principal_email`.

Sugestão: na tela de detalhe interna, quando status = `oc_gerada` E
`origem = 'parceiro'`, mostrar dois botões:
- "📱 Enviar WhatsApp ao parceiro" (abre wa.me com telefone do parceiro)
- "✉ Enviar e-mail ao parceiro" (abre mailto com email do parceiro)

Ambos pré-preenchidos com mensagem template e link/anexo do PDF. Não é
automático — a equipe ainda dispara manualmente, igual ao fluxo atual.

### 6.5 Cancelamento pelo parceiro

Parceiro pode cancelar a própria solicitação enquanto status é `recebida`.
Depois disso, só a equipe interna pode cancelar.

A política RLS já garante essa regra no banco. Na UI, o botão de cancelar
desaparece automaticamente do portal quando status muda.

Ao cancelar:
- Atualiza `status = 'cancelada'`
- Registra no log de auditoria
- Toast no portal: "Solicitação cancelada"
- Card desaparece da lista de "ativas" do parceiro (mas continua visível com
  filtro "Canceladas")

---

## 7. Considerações de segurança adicionais

### 7.1 Auditoria expandida — **implementado (migration 0021)**

A SPEC original previa logar eventos do portal em `log_auditoria`. Na
implementação isso foi para uma **tabela dedicada `eventos_portal`** porque
`log_auditoria` captura DML automático via trigger e não cobre eventos de
aplicação (login, logout, login_falha).

- Tabela `eventos_portal` (RLS: SELECT só `is_interno()`, nenhum INSERT/
  UPDATE/DELETE direto). Tipos válidos:
  - `portal_login`
  - `portal_login_falha` (único disparado por anon — guarda `email_tentado`)
  - `portal_logout`
  - `portal_solicitacao_criada`
  - `portal_solicitacao_cancelada`
  - `portal_senha_alterada`
- **Única porta de escrita:** função `registrar_evento_portal(tipo, payload)`
  `SECURITY DEFINER`. Deriva `parceiro_id` e `parceiro_usuario_id` do
  `auth.uid()` — o cliente não consegue forjar identidade.
- Eventos de DML em `parceiro_*` continuam sendo gravados em `log_auditoria`
  pelo trigger genérico (não precisam de tipo dedicado).
- IP fica `null` no MVP (front não obtém de forma confiável). Quando houver
  Edge Function ou proxy próprio, capturar do `X-Forwarded-For`.

### 7.2 Rate limiting — **parcial (migration 0022)**

- ✅ **50 solicitações/dia/usuário** — trigger `BEFORE INSERT` em
  `solicitacoes` (`check_portal_rate_limit_diario`, `SECURITY DEFINER`).
  Janela = dia de calendário em `America/Sao_Paulo`. Conta TUDO no dia
  (ativas e canceladas) — criar+cancelar não burla. SQLSTATE custom `PT429`;
  o portal detecta em `traduzirErroBanco` e mostra toast amigável. Internos
  e e-mail (`origem != 'parceiro'`) passam direto.
- ⏳ **100 req/min global** — adiado. Exige Edge Function ou Cloudflare;
  reavaliar pós-MVP se houver sinal de abuso.

### 7.3 Captcha no login — **parqueado**

Decisão de projeto: parqueado até existir sinal de abuso. Provedor a decidir
(candidatos: Cloudflare Turnstile, hCaptcha). A tela de login deve aceitar
o encaixe futuro sem refactor grande.

### 7.4 Senha forte — **implementado parcial (Bloco 6.1)**

A SPEC original pedia complexidade (maiúsculas/minúsculas/números/símbolos)
e rotação de 90 dias. Implementado escopo enxuto:

- ✅ **Mínimo 12 caracteres** — validado no front (zod) e no Supabase
  (passo manual: *Authentication → Sign In / Providers → Email → Minimum
  password length*).
- ❌ **Complexidade não exigida** — não há regra de mistura de caracteres.
- ❌ **Rotação de 90 dias descartada** — política de rotação obrigatória
  costuma piorar a segurança real (senhas previsíveis, anotadas, sufixadas
  com mês). NIST 800-63B desencoraja.
- ❌ **Bloqueio de senha == e-mail** — não implementado; o Supabase já
  rejeita senhas muito comuns pela heurística interna.

### 7.5 Logs de tentativa de acesso — **implementado (Bloco 6.3)**

- `portal_login`, `portal_login_falha` e `portal_logout` registrados na
  `eventos_portal` (campos: `user_id`, `parceiro_id`, `parceiro_usuario_id`,
  `email_tentado`, `ip`, `user_agent`, `metadata`).
- Tela **/seguranca** no sistema interno (admin only, `canViewSeguranca`):
  filtros chip por tipo/parceiro/período (URL compartilhável), tabela
  paginada e card de destaque com nº de falhas de login das últimas 24h
  (fica amarelo se ≥ 5).

---

## 8. Sub-fases de implementação

Esta fase 8 é grande e precisa ser quebrada em entregas menores. O status
operacional vive em `docs/BACKLOG-PORTAL.md` (referência viva); as
sub-fases abaixo correspondem aos "Blocos" 2–6 do backlog.

**Fase 8.1 — Reestruturação para monorepo + Modelo de dados** — ✅ Blocos 2.1–2.3
- Migrar projeto atual para estrutura `apps/interno`
- Criar `apps/portal` vazio (esqueleto)
- Criar `packages/shared` com tipos e utils
- Migration SQL com tabelas `parceiros`, `parceiro_usuarios`, `parceiro_*`
- Funções RLS auxiliares
- Políticas RLS em todas as tabelas (internas e de parceiro)
- Migration de patch na tabela `solicitacoes` (campos `parceiro_*` e
  `material_id` nullable)

**Fase 8.2 — Telas internas de gestão de parceiros** — ✅ Bloco 3
- CRUD de parceiros no sistema interno
- Convite de admin_parceiro
- Filtro "Origem" na tela de solicitações (já preparado no patch Pamcard)
- Badge "via [Parceiro]" nos cards (já preparado no patch Pamcard)
- Indicador "Material a definir" no card e na tela de detalhe interno
- Botões de envio de OC (WhatsApp/Email) para parceiro na tela de detalhe

**Fase 8.3 — Portal externo: autenticação e cadastros** — ✅ Bloco 4
- Setup do app `apps/portal` (Vite + React + TS + Tailwind + shadcn)
- Layout, header, navegação horizontal
- Login
- CRUDs de motoristas, veículos, carretas, subcontratadas (do parceiro)
- Gestão de usuários (admin_parceiro)

**Fase 8.4 — Portal externo: solicitações** — ✅ Bloco 5
- Lista de solicitações (com labels amigáveis de status)
- Nova solicitação (tela cheia)
- Detalhe da solicitação
- Cancelamento

**Fase 8.5 — Segurança e polimento** — ✅ Bloco 6 (ver §7 para escopo final)
- Rate limiting — 50/dia implementado; 100/min adiado
- Captcha no login — parqueado
- Política de senha forte — mínimo 12 chars (sem complexidade nem rotação)
- Auditoria expandida — tabela `eventos_portal` + função `SECURITY DEFINER`
- Logs de tentativa de acesso — login/login_falha/logout em `eventos_portal`
- Tela "Segurança" no sistema interno — `/seguranca` (admin only)
- README e documentação — `apps/portal/README.md`

---

## 9. Fora do escopo desta fase

Mesmo após o portal estar operando, estas coisas seguem fora:
- Integração com Protheus
- App mobile nativo (portal funciona no navegador do celular)
- Notificação por WhatsApp ao parceiro automatizada (equipe envia manual)
- Download de PDF dentro do portal (PDF vai por fora, WhatsApp/email)
- Dashboard de métricas no portal (parceiro não precisa)
- API pública para outros sistemas consumirem o SisLog
- Multi-idioma
- White-label (cada parceiro com sua própria identidade visual)
- Faturamento/financeiro
