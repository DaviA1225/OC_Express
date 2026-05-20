# SisLog LHG — Patch do SPEC: Pamcard e Origem da Solicitação

Este documento é um **patch** ao SPEC.md original. Adiciona campos e
comportamentos que faltavam para tratar:

1. Pagamento via Pamcard (cartão de frete)
2. Origem da solicitação (interna, parceiro, e-mail)

Aplicar antes da Fase 4 (Solicitações) ou imediatamente depois, como uma
sub-fase 4.5. Não altera nenhuma estrutura existente — apenas adiciona.

Em caso de conflito com SPEC.md, este patch prevalece para as áreas que ele
cobre. Para tudo mais, SPEC.md continua válido.

---

## 1. Justificativa

Toda solicitação de carregamento envolve um cartão Pamcard usado pelo motorista
para pagamento do frete/combustível. Existem duas situações possíveis:

- O motorista já possui cartão e informa o número no momento da solicitação
- O motorista não possui cartão, e a equipe interna precisa providenciar antes
  do carregamento

Adicionalmente, com a expansão futura para um portal externo de parceiros
(documentada em SPEC-PORTAL.md), o sistema precisa distinguir a origem de cada
solicitação para roteamento, métricas e auditoria.

**Importante:** o número do Pamcard NÃO aparece no PDF da OC. É um dado de
controle interno apenas — usado pela equipe LHG para acompanhar quais
solicitações ainda precisam de cartão providenciado e quais já estão prontas.

---

## 2. Mudanças no modelo de dados

### 2.1 Tabela `solicitacoes` — colunas novas

Adicionar as seguintes colunas via migration nova em `supabase/migrations/`:

```sql
ALTER TABLE solicitacoes
  ADD COLUMN pamcard_status text NOT NULL DEFAULT 'tem_cartao'
    CHECK (pamcard_status IN ('tem_cartao', 'nao_tem_cartao')),
  ADD COLUMN pamcard_numero text,
  ADD COLUMN pamcard_providenciado_em timestamptz,
  ADD COLUMN pamcard_providenciado_por uuid REFERENCES auth.users(id),
  ADD COLUMN origem text NOT NULL DEFAULT 'interno'
    CHECK (origem IN ('interno', 'parceiro', 'email'));
```

### 2.2 Constraints de integridade

Garantir que, quando o status indicar que tem cartão, o número está preenchido
e contém apenas dígitos no formato aceitável:

```sql
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_numero_quando_tem
  CHECK (
    (pamcard_status = 'tem_cartao'
      AND pamcard_numero IS NOT NULL
      AND pamcard_numero ~ '^[0-9]{10,16}$')
    OR
    (pamcard_status = 'nao_tem_cartao' AND pamcard_numero IS NULL)
  );
```

Notas sobre a constraint:
- `^[0-9]{10,16}$` — somente dígitos, entre 10 e 16 caracteres
- Exemplo válido: `441781209999` (12 dígitos)
- Exemplos inválidos: `4417 8120 9999` (tem espaços), `441-781-209` (tem
  separadores), `441781209A` (tem letra)
- Se descobrir que o Pamcard tem comprimento fixo (ex: sempre 12), apertar
  a regex para `^[0-9]{12}$`

### 2.3 Índices para performance

```sql
CREATE INDEX idx_solicitacoes_pamcard_pendente
  ON solicitacoes(pamcard_status, pamcard_providenciado_em)
  WHERE pamcard_status = 'nao_tem_cartao' AND pamcard_providenciado_em IS NULL;

CREATE INDEX idx_solicitacoes_origem ON solicitacoes(origem);
```

O primeiro índice é parcial e otimizado para a consulta mais frequente:
"todas as solicitações com cartão ainda pendente de providência".

### 2.4 Trigger de auditoria

A trigger de auditoria existente deve incluir as novas colunas automaticamente
se já capturar a tabela inteira via `row_to_json(NEW)`. Verificar antes de
aplicar. Se a trigger for por coluna explícita, adicionar `pamcard_status`,
`pamcard_numero`, `pamcard_providenciado_em`, `pamcard_providenciado_por` e
`origem` à lista de colunas auditadas.

---

## 3. Mudanças no front-end

### 3.1 Validação no Zod schema

No schema de validação da solicitação (arquivo
`src/features/solicitacoes/schema.ts` ou equivalente):

```typescript
import { z } from 'zod';

const pamcardSchema = z.discriminatedUnion('pamcard_status', [
  z.object({
    pamcard_status: z.literal('tem_cartao'),
    pamcard_numero: z
      .string()
      .regex(/^[0-9]+$/, 'O Pamcard deve conter apenas números')
      .min(10, 'O Pamcard deve ter no mínimo 10 dígitos')
      .max(16, 'O Pamcard deve ter no máximo 16 dígitos'),
  }),
  z.object({
    pamcard_status: z.literal('nao_tem_cartao'),
    pamcard_numero: z.string().optional(),
  }),
]);
```

Mensagens de erro em português, claras, sem jargão.

### 3.2 Formulário "Nova Solicitação"

Adicionar uma seção nova ao modal de Nova Solicitação, entre as seções atuais
"DESTINO E MATERIAL" e "OBSERVAÇÕES":

**Seção: PAGAMENTO (PAMCARD)**

Layout em duas colunas (50/50):

- Coluna esquerda: radio buttons em pilha vertical
  - ( ) Tem cartão
  - ( ) Não tem cartão (solicitar)
- Coluna direita: campo de texto "Número do cartão"
  - Tipo: input numérico (`inputMode="numeric"` + `pattern="[0-9]*"`)
  - Aceita apenas dígitos — usar handler `onChange` que filtra qualquer
    caractere não-numérico antes de chamar o setter do formulário
  - Comprimento máximo: 16 caracteres (atributo `maxLength`)
  - Habilitado apenas quando "Tem cartão" está selecionado
  - Desabilitado e cinza quando "Não tem cartão" está selecionado
  - Placeholder: "Ex: 441781209999"
  - Sem máscara visual (não inserir espaços, hífens ou qualquer separador)
  - Validação inline: ao perder foco (`onBlur`), valida e mostra erro abaixo
    do campo se não estiver entre 10 e 16 dígitos

Comportamento:
- Padrão inicial: "Tem cartão" selecionado, campo número vazio focado
- Ao trocar para "Não tem cartão", limpar o campo número
- Ao trocar de volta para "Tem cartão", focar automaticamente no campo número
- Tab a partir do campo número deve levar à seção OBSERVAÇÕES

### 3.3 Card de solicitação na lista

Adicionar elementos visuais ao card descrito no SPEC.md seção 6.3:

**Quando `pamcard_status = 'nao_tem_cartao'` E `pamcard_providenciado_em IS NULL`:**
- Mostrar badge âmbar pequeno no canto superior esquerdo do card, à esquerda
  do número da solicitação: "Cartão pendente"
- Cor de fundo: var(--accent) #F59E0B com 20% de opacidade
- Cor do texto: #92400E
- Fonte 10px, peso 500, padding 2px 8px, border-radius 4px

**Quando `origem = 'parceiro'`:**
- Mostrar badge azul claro ao lado do badge de Pamcard (se houver) ou no mesmo
  espaço: "via [Razão Social do Parceiro]"
- Cor de fundo: var(--primary) com 10% de opacidade
- Cor do texto: var(--primary)
- Esse badge clicável: ao clicar, filtra a lista pra mostrar só desse parceiro

**Quando `origem = 'email'`:**
- Mostrar badge cinza: "via e-mail"
- Sem clique especial

### 3.4 Filtros novos na barra superior

Adicionar dois filtros novos à barra de filtros da tela de Solicitações:

**Filtro "Origem"** (select):
- Todas (padrão)
- Internas
- Parceiros
- E-mail

**Filtro "Pamcard"** (select):
- Todos (padrão)
- Com cartão
- Pendentes (mostra só solicitações com `pamcard_status = 'nao_tem_cartao'`
  ainda com `pamcard_providenciado_em IS NULL`)

### 3.5 Indicador na sidebar

Quando houver solicitações com `pamcard_status = 'nao_tem_cartao'` E
`pamcard_providenciado_em IS NULL`, mostrar um pequeno círculo âmbar (badge
contador) à direita do item "Solicitações" na sidebar, com o número de
pendências. Atualizar via react-query com refetch a cada 30 segundos.

### 3.6 Tela de detalhe da solicitação

Adicionar um card novo na coluna principal, entre "Destino e Material" e
"Instrução e PDF":

**Card "Pamcard"**

Header: título "Pamcard" + ícone "CreditCard" do Lucide.

Conteúdo varia por status:

**Se `pamcard_status = 'tem_cartao'` E `pamcard_providenciado_em IS NULL`:**
(cartão informado pelo solicitante na criação)
- Linha 1: Label "STATUS" + valor "Informado pelo solicitante" (em verde)
- Linha 2: Label "NÚMERO" + valor do número formatado para exibição (ver 3.7)
- Botão pequeno "Editar" no canto superior direito do card (apenas se status
  da solicitação não for finalizada/cancelada)

**Se `pamcard_status = 'nao_tem_cartao'` E `pamcard_providenciado_em IS NULL`:**
- Banner âmbar no topo do card: "Aguardando providência da equipe interna"
- Botão grande, primary, ocupando largura total: "Cartão providenciado"
  - Ao clicar, abre dialog de confirmação
  - Dialog tem campo obrigatório "Número do cartão" com mesmas validações da
    seção 3.2 (apenas dígitos, 10-16 caracteres)
  - Ao confirmar:
    - Atualiza `pamcard_status = 'tem_cartao'`
    - Preenche `pamcard_numero`
    - Preenche `pamcard_providenciado_por = auth.uid()`
    - Preenche `pamcard_providenciado_em = now()`
    - Toast "Cartão registrado com sucesso"

**Se `pamcard_status = 'tem_cartao'` E `pamcard_providenciado_em IS NOT NULL`:**
(cartão foi providenciado pela equipe depois)
- Linha 1: Label "STATUS" + valor "Providenciado pela equipe" (em azul)
- Linha 2: Label "NÚMERO" + valor formatado
- Linha 3: Label "PROVIDENCIADO POR" + nome do usuário + data/hora
- Sem botão de editar (rastreabilidade preservada)

### 3.7 Helper de formatação visual

Criar utility em `src/lib/formatters.ts`:

```typescript
/**
 * Formata um número de Pamcard para exibição visual, agrupando de 4 em 4
 * dígitos. NÃO altera o dado armazenado — apenas a apresentação.
 *
 * Exemplo: '441781209999' -> '4417 8120 9999'
 *
 * Esse formatter é usado APENAS na visualização (cards, telas de detalhe).
 * No input do formulário e no banco de dados, o valor permanece somente
 * dígitos sem separadores.
 */
export function formatarPamcardParaExibicao(numero: string | null): string {
  if (!numero) return '';
  return numero.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
```

---

## 4. PDF da OC

**O Pamcard NÃO aparece no PDF da OC.** É um dado de controle interno apenas.

A geração de PDF descrita no SPEC.md seção 6.4 permanece inalterada. Não
incluir nenhum campo de Pamcard no template visual do PDF.

Justificativa: o cartão é um dado operacional interno (controle de
providência, conferência com financeiro), não um dado que precisa estar no
documento que o motorista leva para a mina.

---

## 5. Mudanças nas validações de negócio

### 5.1 Geração de PDF com cartão pendente

Permitida, sem alerta especial. Como o Pamcard não aparece no PDF, não há
risco de o documento sair com informação incompleta.

A equipe interna pode emitir o PDF normalmente e providenciar o cartão em
paralelo. O sistema continua mostrando "Cartão pendente" no card da
solicitação até que a equipe registre o cartão via botão "Cartão
providenciado".

### 5.2 Histórico ao providenciar cartão

Quando um cartão é providenciado, registrar no `log_auditoria` com:
- `acao = 'pamcard_providenciado'`
- `dados_antes = { pamcard_status: 'nao_tem_cartao', pamcard_numero: null }`
- `dados_depois = { pamcard_status: 'tem_cartao', pamcard_numero: '...', providenciado_por: '...', providenciado_em: '...' }`

---

## 6. Resumo das mudanças

Para o Claude Code executar esse patch, são necessárias as seguintes alterações:

1. Migration SQL nova (`supabase/migrations/XXXX_add_pamcard_and_origem.sql`)
   com as colunas, constraints (incluindo regex de validação) e índices da seção 2
2. Regenerar types TypeScript: `supabase gen types typescript`
3. Atualizar schema Zod da solicitação para incluir `pamcard_status` e
   `pamcard_numero` com discriminated union (seção 3.1)
4. Criar helper `formatarPamcardParaExibicao` (seção 3.7)
5. Atualizar componente do formulário de nova solicitação (seção 3.2) com
   input numérico filtrado
6. Atualizar componente de card de solicitação (seção 3.3)
7. Atualizar componente de filtros (seção 3.4)
8. Atualizar componente da sidebar (seção 3.5)
9. Atualizar tela de detalhe da solicitação (seção 3.6)
10. Implementar dialog de providência de cartão (seção 3.6)
11. Verificar trigger de auditoria (seção 2.4)
12. **NÃO** alterar o template do PDF da OC (seção 4) — Pamcard não vai pro PDF

Todos com commits separados e descritivos.
