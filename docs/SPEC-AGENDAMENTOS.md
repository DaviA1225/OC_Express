# SisLog LHG — Módulo de Agendamentos

Especificação do módulo que digitaliza a solicitação de agendamento de descarga
em terminal, hoje feita por WhatsApp.

**Versão 0.2** — implementada em 26/08/2026 (migration `0061_agendamentos.sql`
e telas nos dois apps). O que mudou em relação à 0.1 está na seção 11; as
decisões que a implementação obrigou a tomar estão registradas lá e na 10.

**Pré-requisito:** MVP interno e Portal de Parceiros em produção.

**Dependência opcional:** módulo de Embarques (`SPEC-EMBARQUES.md`). Se existir,
a nota fiscal é preenchida automaticamente. Se não existir, entrada manual. O
módulo é entregável de forma independente.

---

## 1. O processo hoje

1. Parceiro ou motorista manda mensagem no WhatsApp com a foto da nota fiscal e
   a data desejada
2. Atendente entra no Corporate, localiza a NF, extrai os dados e baixa o PDF
3. Atendente entra no sistema do terminal, insere dados do veículo e da NF,
   escolhe data e hora disponíveis
4. Baixa o comprovante em PDF
5. Devolve o comprovante ao parceiro por WhatsApp

**Rotas que exigem agendamento:**

| Cliente | Terminal / destino |
|---|---|
| A.B Operadora de Terminais / CSN | Pindamonhangaba |
| TCI Soluções Logísticas | Itutinga |
| ArcelorMittal | Juiz de Fora |
| Metalsider | Betim |
| MRS Estação São Bento | Mogi das Cruzes |

**Fora de escopo:** veículos de outras transportadoras que carregam na mina sem
vínculo com a LHG. Elas fazem os próprios agendamentos; nada passa pela equipe.

---

## 2. Decisões estruturantes

### 2.1 Agendamento é filho da solicitação, sempre

Confirmado com a operação: não existe agendamento avulso. `solicitacao_id` é
obrigatório, o que garante que motorista, placa, cliente e subcontratada já vêm
preenchidos — o parceiro não redigita nada.

### 2.2 A nota fiscal só existe depois do carregamento

A NF é emitida na mina, no momento do carregamento. Logo o agendamento é um
evento **posterior** à saída da carga.

**Consequência:** o botão "Solicitar agendamento" não pode aparecer em qualquer
solicitação. Só se habilita quando a carga já saiu (ver questão 1 na seção 10).

### 2.3 Preferência, não exigência

O parceiro informa data desejada e período. A regra operacional já é: **agenda na
data pedida; se não houver vaga, na mais próxima**. Isso é comportamento padrão,
não opção — nenhuma caixa de seleção.

Como a divergência é rotina, **exibi-la é obrigatório**: o card do parceiro
mostra o pedido e o agendado lado a lado, sem precisar abrir.

### 2.4 Reagendamento cria registro novo

Veículo quebra, fila atrasa, terminal cancela janela. O reagendamento não
sobrescreve: cria uma linha nova apontando para a anterior via
`substitui_agendamento_id`, e a anterior passa a `substituido`.

Mesmo padrão do `substituido_por` da tabela `embarques` — vocabulário consistente
no banco.

### 2.5 O que exige agendamento é atributo do cliente, não da rota

Poderia depender da tabela `rotas` do módulo de Embarques, mas isso criaria
acoplamento desnecessário. A solicitação já referencia `cliente_id`, e os quatro
casos são clientes. As colunas entram em `clientes`.

---

## 3. Modelo de dados

### 3.1 Colunas novas em `clientes`

```sql
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS requer_agendamento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal_nome text,
  ADD COLUMN IF NOT EXISTS antecedencia_minima_horas integer,
  ADD COLUMN IF NOT EXISTS observacoes_agendamento text;
```

### 3.1.1 Tabela `terminal_janelas`

**Agendamento é sempre por hora marcada, em slots discretos com capacidade** —
não é horário livre. Cada terminal tem sua própria grade.

| Terminal | Slots | Duração | Capacidade | Total/dia |
|---|---|---|---|---|
| TCI Itutinga | 08, 09, 10, 11, 12, 13, 14, 15, 16 | 1 h | 4 | 36 |
| ArcelorMittal Juiz de Fora | mesmo padrão do TCI | 1 h | 4 | 36 |
| Metalsider Betim | mesmo padrão do TCI | 1 h | 4 | 36 |
| A.B / CSN Pindamonhangaba | 06, 13, 19 | 6 h | 10 | 30 |
| MRS São Bento, Mogi das Cruzes | 07:00 a 17:30, de 30 em 30 min | 30 min | 3 | 66 |

**"Mesmo padrão" quer dizer formato, não números.** A MRS (0066) foi descrita
como "segue o padrão do TCI" e tem duração, capacidade e horário diferentes de
todos os outros — janela de meia hora rende o dobro de slots, e por isso ela
sozinha comporta 66 veículos/dia. Vale como aviso para ArcelorMittal e
Metalsider, ainda não confirmados: o seed assume os números do TCI, e é bem
possível que só o formato coincida (questão 3).

Isso derruba o "teste de sanidade" da 0.1, que dizia esperar todos na mesma
ordem de grandeza (36 × 30). A conferência que sobrevive é por terminal, contra
o que aquele terminal informou — não entre terminais.

O modelo de dados aguenta a variação sem mudança: uma linha por slot já
comportava 9 slots de 1 h e 3 de 6 h; 22 de 30 min entram igual.

**Gerador de grade (Cadastros → Clientes → Agendamento).** Preset fixo não
escalava: cada terminal novo trouxe números próprios e virava uma migration. A
tela agora pede a faixa como o terminal a descreve — *das 7 às 18, janelas de 30
min, 3 vagas* — e cria a grade inteira. Terminal novo não precisa mais de
migration.

`Até` é o horário de **fechamento**, não o início da última janela. Como isso é
ambíguo em português ("das 7 às 18" pode incluir ou não uma janela às 18h), a
tela mostra uma **prévia ao vivo** do que vai criar — quantidade, primeiro e
último horário, total/dia e o fim real da última janela — antes do clique.
Gerar por cima de uma grade existente completa as lacunas e não derruba ajuste
manual (`ON CONFLICT DO NOTHING`).

Grade irregular continua sendo caso de cadastro linha a linha: a A.B (06, 13 e
19) não sai de nenhuma faixa uniforme, e são três horários.

Duas grades muito diferentes (9 slots de 1h contra 3 janelas de 6h) descartam
`janela_inicio`/`janela_fim` como modelo: duas colunas não representam isso.

```sql
CREATE TABLE IF NOT EXISTS terminal_janelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  hora time NOT NULL,
  duracao_minutos integer NOT NULL DEFAULT 60,
  capacidade integer,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (cliente_id, hora)
);

CREATE INDEX IF NOT EXISTS idx_terminal_janelas_cliente
  ON terminal_janelas(cliente_id) WHERE ativo = true;
```

**Seed inicial:**

```sql
-- Grade horária: TCI, ArcelorMittal e Metalsider — 08:00 a 16:00, 1h, 4 vagas
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT c.id, g.h::time, 60, 4
  FROM clientes c
  CROSS JOIN generate_series(
    timestamp '2000-01-01 08:00',
    timestamp '2000-01-01 16:00',
    interval '1 hour'
  ) AS g(h)
 WHERE c.requer_agendamento = true
   AND (upper(c.razao_social) LIKE '%TCI%'
     OR upper(c.razao_social) LIKE '%ARCELOR%'
     OR upper(c.razao_social) LIKE '%METALSIDER%')
ON CONFLICT (cliente_id, hora) DO NOTHING;

-- Janela longa: A.B / CSN — 06:00, 13:00 e 19:00, 6h, 10 vagas
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT c.id, g.h, 360, 10
  FROM clientes c
  CROSS JOIN (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
 WHERE c.requer_agendamento = true
   AND (upper(c.razao_social) LIKE '%A. B.%'
     OR upper(c.razao_social) LIKE '%OPERADORA DE TERMINAIS%')
ON CONFLICT (cliente_id, hora) DO NOTHING;
```

**Atenção:** o casamento por `razao_social` é frágil — a base tem grafias
divergentes para o mesmo cliente (`A. B. OPERADORA DE TERMINAIS L`,
` Estoque-A. B. OPERADORA DE TE`). Antes de rodar, conferir quais linhas cada
`LIKE` alcança:

```sql
SELECT id, razao_social, requer_agendamento FROM clientes
 WHERE requer_agendamento = true ORDER BY razao_social;
```

Se houver ambiguidade, substituir os `LIKE` pelos `id` reais. Idempotente pelo
`ON CONFLICT`: reexecutar não duplica.

### 3.1.2 O SisLog não conhece a disponibilidade real

Limitação a assumir explicitamente: **a vaga vive no sistema do terminal**, e
outras transportadoras — sem vínculo com a LHG — também ocupam slots. O SisLog
nunca saberá se um horário está cheio.

O que ele **pode** fazer, e já é bastante:

- Oferecer apenas horários que **existem** naquele terminal (elimina pedidos
  impossíveis como 07:30 no TCI)
- Exibir quantos agendamentos **da própria LHG** já estão naquele slot, como
  referência — rotulado como parcial, nunca como disponibilidade
- Registrar o slot efetivamente confirmado

A conferência de vaga continua sendo feita no sistema do terminal, pela equipe.

### 3.2 Tabela `agendamentos`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `numero_interno` | serial UNIQUE | Exibido como `#A0412` |
| `solicitacao_id` | uuid NOT NULL FK solicitacoes | Sempre vinculado (2.1) |
| `parceiro_id` | uuid FK parceiros | Denormalizado pelo trigger — chave do RLS |
| `parceiro_usuario_id` | uuid FK parceiro_usuarios | Quem pediu; NULL se interno |
| `status` | text NOT NULL | Ver 3.3 |
| `data_preferida` | date NOT NULL | |
| `hora_preferida` | time | Slot desejado; NULL = qualquer horário |
| `observacoes` | text | Texto livre do solicitante |
| `nota_fiscal` | text | Auto do módulo de Embarques ou manual |
| `nota_fiscal_origem` | text | `automatica` ou `manual` |
| `data_agendada` | date | Preenchido na conclusão |
| `hora_agendada` | time | Obrigatória em `agendado` — sempre hora marcada |
| `comprovante_path` | text | Storage privado |
| `nf_pdf_path` | text | PDF da NF baixado do Corporate (opcional) |
| `contrato_frete_path` | text | Contrato de frete da Pamcard (0064) |
| `hora_fora_da_grade` | boolean NOT NULL | Calculado no servidor ao concluir (ver 11) |
| `substitui_agendamento_id` | uuid FK agendamentos | Preenchido no reagendamento |
| `motivo_reagendamento` | text | |
| `assumido_por` / `assumido_em` | uuid / timestamptz | Trava de concorrência |
| `agendado_por` / `agendado_em` | uuid / timestamptz | |
| `created_at` / `updated_at` / `created_by` | | Padrão do projeto |

**Constraints:**

```sql
ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('solicitado','em_andamento','agendado','substituido','cancelado'));

-- Concluído exige data e comprovante
ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_agendado_completo
  CHECK (
    status <> 'agendado'
    OR (data_agendada IS NOT NULL
        AND hora_agendada IS NOT NULL
        AND comprovante_path IS NOT NULL)
  );
```

**Índices:**

```sql
-- No máximo um agendamento vivo por solicitação
CREATE UNIQUE INDEX uq_agendamento_ativo_por_solicitacao
  ON agendamentos(solicitacao_id)
  WHERE status IN ('solicitado','em_andamento','agendado');

CREATE INDEX idx_agendamentos_status ON agendamentos(status);
CREATE INDEX idx_agendamentos_parceiro ON agendamentos(parceiro_id);
CREATE INDEX idx_agendamentos_solicitacao ON agendamentos(solicitacao_id);
CREATE INDEX idx_agendamentos_fila
  ON agendamentos(created_at) WHERE status IN ('solicitado','em_andamento');
```

O índice único garante que o reagendamento passe pela RPC (5.3), que marca a
anterior como `substituido` e insere a nova na mesma transação.

### 3.3 Máquina de estados

```
solicitado ──assumir──> em_andamento ──concluir──> agendado
     │                        │                        │
     └────────────────────────┴──────cancelar─────> cancelado
                                                       
agendado ──reagendar──> substituido  (+ nova linha em 'solicitado')
```

| Status | Significado | Quem move |
|---|---|---|
| `solicitado` | Na fila | — |
| `em_andamento` | Alguém assumiu | Interno |
| `agendado` | Concluído, com data e comprovante | Interno |
| `substituido` | Foi reagendado | Sistema (RPC) |
| `cancelado` | Cancelado | Interno ou parceiro (só em `solicitado`) |

### 3.4 Trigger de preenchimento

Mesmo padrão de `solicitacao_pendencias` (migration 0035): o cliente não informa
nem consegue forjar `parceiro_id`.

```sql
CREATE OR REPLACE FUNCTION agendamento_preencher_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_requer boolean;
BEGIN
  SELECT s.parceiro_id, c.requer_agendamento
    INTO NEW.parceiro_id, v_cliente_requer
    FROM solicitacoes s
    JOIN clientes c ON c.id = s.cliente_id
   WHERE s.id = NEW.solicitacao_id;

  IF v_cliente_requer IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta rota não exige agendamento.' USING ERRCODE = '23514';
  END IF;

  NEW.created_by  := auth.uid();
  NEW.status      := 'solicitado';
  NEW.assumido_por := NULL;
  NEW.assumido_em  := NULL;
  NEW.agendado_por := NULL;
  NEW.agendado_em  := NULL;
  NEW.data_agendada := NULL;
  NEW.hora_agendada := NULL;
  NEW.comprovante_path := NULL;

  RETURN NEW;
END;
$$;
```

Sanitização no mesmo espírito da 0047: campos de domínio interno zerados em
qualquer INSERT externo.

### 3.5 RLS

```sql
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY agendamentos_interno_all ON agendamentos FOR ALL TO authenticated
  USING ((SELECT is_interno())) WITH CHECK ((SELECT is_interno()));

CREATE POLICY agendamentos_parceiro_select ON agendamentos FOR SELECT TO authenticated
  USING (parceiro_id = (SELECT get_current_parceiro_id()));
```

O parceiro **não** recebe policy de INSERT/UPDATE direto: escreve via RPC (5.3),
seguindo o padrão da 0044 — ele não tem SELECT em `solicitacoes`, então
UPDATE direto afetaria zero linhas silenciosamente.

Os helpers vão encapsulados em `(SELECT ...)` desde a criação, conforme a
migration 0051.

**Atenção:** a migration deste módulo precisa entrar **antes** da seção 0051 no
schema cumulativo, ou a varredura de InitPlan não alcança estas policies.

### 3.6 Storage

Bucket privado `agendamentos-docs`, com três tipos de arquivo: comprovante do
terminal, contrato de frete da Pamcard e PDF da NF.

Diferente do bucket `ocs-pdf`, **o parceiro pode ler os próprios comprovantes** —
o comprovante é justamente o que ele precisa receber de volta.

```sql
CREATE POLICY "agendamentos_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agendamentos-docs' AND (
      (SELECT is_interno())
      OR storage_agendamento_pertence_ao_parceiro_logado(name)
    )
  );
```

Caminho: `{agendamento_id}/{tipo}-{timestamp}.pdf`. A função auxiliar segue o
molde de `storage_anexo_pertence_ao_parceiro_logado` (migration 0020).

Download sempre por signed URL de curta duração.

---

## 4. Preenchimento automático da nota fiscal

Quando o módulo de Embarques existe, o SisLog já importou a NF do Corporate.

```sql
SELECT e.nota_fiscal
FROM embarques e
JOIN solicitacoes s ON s.numero_instrucao = e.instrucao_filial
LEFT JOIN veiculos v ON v.id = s.veiculo_id
WHERE s.id = $1
  AND e.placa_cavalo = v.placa
  AND e.substituido_por IS NULL
ORDER BY e.data_emissao DESC
LIMIT 1;
```

Join por instrução **e** placa, conforme `SPEC-EMBARQUES.md` seção 3.2.

**Comportamento:**

- NF encontrada → preenche, marca `nota_fiscal_origem = 'automatica'`, exibe
  selo verde "NF localizada"
- Não encontrada → campo manual obrigatório para o interno, selo âmbar
  "NF ainda não importada"

A importação é diária, então agendamento pedido logo após o carregamento cai no
segundo caso. É esperado, não é erro.

---

## 5. Telas

### 5.1 Portal — botão na solicitação

Na tela de detalhe da solicitação do portal, botão **"Solicitar agendamento"**,
visível apenas quando:

- `clientes.requer_agendamento = true`, **e**
- a carga já saiu (ver questão 1), **e**
- não existe agendamento ativo para aquela solicitação

**Modal:**

| Campo | Tipo |
|---|---|
| Data desejada | date, mínimo = hoje + `antecedencia_minima_horas` |
| Horário | grade de slots de `terminal_janelas` + opção "qualquer horário" |
| Observações | textarea, opcional |

A grade mostra os slots reais do terminal escolhido — nove botões para o TCI,
três para a A.B. O parceiro toca no horário; não digita.

Nota fixa abaixo dos campos, não uma caixa de seleção:

> Se não houver vaga na data desejada, agendamos para a data disponível mais
> próxima e avisamos aqui.

Se o cliente tem `antecedencia_minima_horas`, o seletor bloqueia datas antes do
limite e exibe: *"Este terminal exige 24h de antecedência."*

Abaixo da grade, contagem própria da LHG por slot, rotulada com honestidade:
*"2 veículos nossos neste horário — a vaga final depende do terminal."*

### 5.2 Portal — acompanhamento

Card do agendamento na solicitação, com status em linguagem do parceiro:

| Status interno | Rótulo no portal |
|---|---|
| `solicitado` | Enviado |
| `em_andamento` | Em andamento |
| `agendado` | Agendado |
| `substituido` | Reagendado |
| `cancelado` | Cancelado |

Quando `agendado`, exibir **pedido e confirmado lado a lado**, com destaque
quando divergem:

```
Pediu:     18/03 · manhã
Agendado:  19/03 · 14:00        [Baixar comprovante]
```

Divergência é rotina (2.3) — mostrar sem alarme, mas sem esconder.

### 5.3 RPCs do portal

```sql
portal_solicitar_agendamento(
  p_solicitacao_id uuid,
  p_data_preferida date,
  p_hora_preferida time,   -- NULL = qualquer horário
  p_observacoes text
) RETURNS uuid
```

Valida posse da solicitação, `requer_agendamento`, **carga já saída**
(`oc_enviada`/`finalizada`), antecedência mínima, horário existente na grade e
ausência de agendamento ativo. `SECURITY DEFINER`, `GRANT EXECUTE TO authenticated`.

```sql
portal_cancelar_agendamento(p_id uuid) RETURNS uuid
portal_reagendar_agendamento(p_id uuid, p_motivo text, p_nova_data date, p_nova_hora time) RETURNS uuid
```

Cancelar vale em **qualquer estado vivo** — `solicitado`, `em_andamento` e
`agendado` (0065). Reagendar só em `agendado`.

A 0.1 travava o cancelamento em `solicitado`, argumentando que depois disso a
equipe já podia ter agendado no terminal e o SisLog passaria a mentir. O
argumento estava invertido: quem desiste da carga é o parceiro, e o que faz o
sistema mentir é **manter o pedido de pé** — a equipe seguiria tocando uma
janela que ninguém vai usar e o terminal ficaria com uma vaga ocupada à toa.

O que o cancelamento tardio exige é aviso, não bloqueio: o portal explica que a
equipe terá de desmarcar no sistema do terminal (e sugere Reagendar quando o
veículo só vai atrasar), e o painel interno, se estiver aberto, troca para um
alerta e esconde o botão de concluir.

**Não existe exclusão.** A linha vira `cancelado` e permanece — a decisão 2.4
vale para o módulo inteiro: nada é sobrescrito nem apagado.

Uma RPC de apoio, usada pelos dois lados:

```sql
agendamentos_ocupacao_slot(p_cliente_id uuid, p_data date)
  -- (hora, duracao_minutos, capacidade, ocupados) — a contagem da própria LHG
```

A `terminal_aplicar_grade_padrao(p_cliente_id, p_modelo)` continua no banco
documentando os dois presets usados nos seeds, mas **não é mais chamada pela
tela**: o cadastro gera a grade a partir da faixa informada pelo terminal (ver
3.1.1).

### 5.4 Interno — lista agrupada por terminal

A equipe não agenda um de cada vez: entra no sistema do TCI e resolve **todos os
TCI de uma vez**. A lista é agrupada por terminal.

**Ordem de chegada, igual à fila das ordens de carregamento: o primeiro a
enviar é o primeiro a ser agendado.** O agrupamento por terminal é só para a
equipe resolver tudo numa entrada só no sistema do terminal — ele não muda quem
vem antes. Vale nos dois níveis: os pedidos dentro de um grupo e os grupos
entre si (primeiro o terminal com o pedido mais antigo esperando).

Ordenar os grupos por volume de pendentes fura a fila — cinco pedidos de uma
hora atrás passariam na frente de um que espera desde a manhã — e foi
justamente o erro da primeira implementação.

**Cabeçalho do grupo:** nome do terminal, contagem de pendentes, regra de
antecedência e grade do terminal (`08:00–16:00 · 4 por hora`).

**Cada card:**

- `#A0412` em mono + nome do parceiro
- Selo de **tempo de espera** (`há 9h`) — âmbar acima de 4h, vermelho acima de 8h
- Grade: motorista · cavalo · nota fiscal · preferência
- Status da NF: verde "localizada" ou âmbar "buscar no Corporate"
- Botão **"Assumir"**

**Trava de concorrência:** ao assumir, o card mostra "Maria está agendando" para
os demais. Numa equipe de 15 pessoas, sem isso duas pessoas agendam a mesma nota.

Se `assumido_em` passa de 2 horas sem conclusão, o card volta para a fila com
aviso — evita item travado por alguém que saiu.

**Filtros:** terminal, status, parceiro, período de espera.

### 5.5 Interno — painel de trabalho

Aberto ao assumir. O SisLog não conversa com o sistema do terminal, mas prepara
os dados para colar — mesma lógica do fluxo da OC.

**Bloco "Dados para o terminal"** — cada campo com botão de copiar:

```
Placa cavalo    SIK6H90            [copiar]
Placa carreta   XYZ9W87            [copiar]
Nota fiscal     6/254215           [copiar]
Motorista       João Pereira       [copiar]
Telefone        (31) 99999-9999    [copiar]
CPF             •••.•••.789-••     [copiar]
Peso            36,78 t            [copiar]
```

Isso elimina a transcrição manual, que é onde nascem erro de placa e de nota.

O **telefone** entrou porque o TCI Itutinga o exige no agendamento. Fica visível
para todos os terminais: é um campo a mais numa paleta de cópia, e quem não
precisa apenas não copia. Requisito específico de um terminal tem lugar próprio
— o campo **Observações do terminal** no cadastro do cliente, que o painel
exibe como "Regra do terminal".

Ele aparece **sem máscara**, ao contrário do CPF. O telefone já é exibido aberto
na solicitação e no envio por WhatsApp; escondê-lo só aqui seria inconsistente
sem proteger nada. O CPF continua mascarado e registrado ao copiar (seção 8).

**Bloco "Confirmação":**

| Campo | Obrigatório |
|---|---|
| Data agendada | sim |
| Hora agendada | sim |
| Comprovante (PDF) | sim |
| Contrato de frete da Pamcard (PDF) | sim |
| PDF da NF | opcional |

O contrato de frete **sai antes** do comprovante do terminal, mas os dois são
enviados ao parceiro de uma vez. Por isso ele é obrigatório para concluir
(quando a janela é confirmada, ele já existe — exigi-lo não prende a fila) e
por isso o portal só revela os documentos quando o status vira `agendado`:
gravar o arquivo e entregá-lo ao parceiro são momentos diferentes.

Os arquivos são gravados na linha **no upload**, não na conclusão. Fechar o
painel no meio não perde o que já foi anexado, e não sobra arquivo órfão no
bucket.

O campo de hora é a **mesma grade de slots** do portal, com o horário pedido pelo
parceiro pré-selecionado. Um clique confirma; outro clique escolhe o slot que o
terminal tinha de fato.

Horário fora da grade exige um campo livre, liberado por um link discreto
("outro horário"). Gera **aviso, não bloqueio** — exceções acontecem e o
comprovante do terminal é a prova final. O aviso fica registrado nas observações
internas.

**Reabrir um agendamento já concluído** (botão "Documentos", na fila e no card
da solicitação) abre o mesmo painel em modo somente-documentos: data, hora e
nota fiscal viram leitura, e só os três anexos seguem editáveis. Serve para o
contrato que chegou depois e para trocar um arquivo errado. Mudar a janela
continua sendo **Reagendar** — editar por cima uma janela que o terminal já
confirmou apagaria o histórico que a decisão 2.4 existe para preservar.

Botão **"Concluir agendamento"** → status `agendado`, notifica o parceiro.

Se a data confirmada difere da preferida, o sistema não pede justificativa — é
rotina. Apenas registra e exibe a divergência.

### 5.6 Reagendamento

Disponível no interno (terminal cancelou a janela) e no portal (veículo
atrasou), sobre um agendamento em `agendado`.

RPC única em transação:

```sql
-- interno
agendamento_reagendar(p_agendamento_id uuid, p_motivo text, p_nova_data date, p_nova_hora time)
-- portal
portal_reagendar_agendamento(p_id uuid, p_motivo text, p_nova_data date, p_nova_hora time)
```

As duas autorizam o chamador e delegam a `agendamento_reagendar_core`, que não
recebe `GRANT` nenhum: função `SECURITY DEFINER` sem checagem de permissão não
pode ficar exposta a `authenticated`.

Marca a anterior como `substituido`, insere nova em `solicitado` com
`substitui_agendamento_id` preenchido. O histórico fica encadeado e visível na
timeline dos dois lados.

---

## 6. Notificações

Reaproveita o mecanismo de `solicitacao_pendencias` (Realtime, migration 0035).

| Evento | Quem vê |
|---|---|
| Agendamento solicitado | Interno — contador na sidebar |
| Agendamento concluído | Parceiro — sino + card |
| Reagendamento solicitado | O outro lado |

Adicionar `agendamentos` à publicação `supabase_realtime`.

---

## 7. Auditoria

Trigger `audit_trigger()` na tabela, como as demais.

Eventos novos em `eventos_portal` (ampliar o CHECK de `tipo_evento` e a função
`registrar_evento_portal`, conforme o padrão das migrations 0023/0031/0043):

- `portal_agendamento_solicitado`
- `portal_agendamento_cancelado`
- `portal_agendamento_reagendado`

---

## 8. LGPD

O comprovante do terminal e o PDF da NF contêm nome de motorista, CPF e dados do
veículo. Já são categorias tratadas pelo sistema — não amplia o escopo do
`COMPLIANCE.md` em categoria nova, mas **amplia o volume de documentos
armazenados**.

Dois pontos para a política de retenção (seção 8 do `COMPLIANCE.md`):

- Comprovantes acompanham o prazo da solicitação (proposta: 5 anos)
- O CPF no bloco de cópia (5.5) aparece **mascarado** na tela, revelado apenas ao
  clicar em copiar, e o acesso é registrado em auditoria

---

## 9. Fases

As três foram entregues juntas em 26/08/2026. A divisão fica registrada porque
descreve a ordem em que a operação pode começar a usar: a Fase A já funciona
sozinha, com a equipe registrando pelo WhatsApp.

**Fase A — Núcleo interno** ✔
- Colunas em `clientes` + tela de cadastro
- Tabela `agendamentos`, trigger, RLS, bucket
- Lista interna agrupada por terminal, com assumir e tempo de espera
- Painel de trabalho com bloco de cópia e conclusão

Entregável isolado: a equipe já usa internamente, com solicitação registrada
manualmente a partir do WhatsApp.

**Fase B — Portal** ✔
- Botão e modal na solicitação
- RPCs `portal_solicitar_agendamento` e `portal_cancelar_agendamento`
- Card de acompanhamento com divergência
- Download do comprovante por signed URL

Entregável: acaba a entrada por WhatsApp.

**Fase C — Integrações**
- Preenchimento automático da NF ✔ — o código consulta `embarques` e, enquanto
  o módulo não existir, a consulta falha em silêncio e o campo vira manual.
  Não há o que testar até Embarques entrar.
- Reagendamento nos dois lados ✔
- Notificações em tempo real ✔ (`agendamentos` na publicação `supabase_realtime`,
  contador na sidebar interna, sino do portal)
- Métricas: tempo médio até agendamento, divergência média entre pedido e
  confirmado, taxa de reagendamento por terminal — **não feito**. Fica para
  quando houver volume: relatório construído sobre três linhas de teste mede
  ruído, não operação. Os dados para calcular já estão todos na tabela
  (`created_at`, `agendado_em`, pedido × confirmado, `substitui_agendamento_id`).

---

## 10. Questões em aberto

1. **A partir de qual status a carga é considerada "saída"?** ✔ **Decidido:**
   `oc_enviada` e `finalizada`. A regra está na RPC do portal, não só na tela —
   um pedido feito antes disso é recusado com `PT409`. **Continua valendo
   confirmar** se existe janela entre `oc_enviada` e o carregamento efetivo em
   que o pedido chegaria cedo demais; se existir, muda-se a lista em um lugar só
   (`portal_solicitar_agendamento` e `STATUS_COM_CARGA_NA_RUA` nos dois apps).

2. **Antecedência mínima por terminal** — ainda em aberto. O campo existe e é
   editável em Cadastros → Clientes → coluna Agendamento; `NULL` significa "sem
   regra conhecida" e não trava nada. Preencher os valores reais de A.B/CSN,
   TCI, ArcelorMittal e Metalsider.

3. **Grade de ArcelorMittal e Metalsider** — ainda em aberto, e agora com um
   precedente: a MRS foi descrita como "mesmo padrão do TCI" e veio com 30 min,
   3 vagas e 07:00–17:30 (0066). **O padrão era o formato, não os números** —
   provavelmente vale o mesmo para esses dois. O seed assume os do TCI
   (08:00–16:00, 1 h, 4 por slot) até alguém confirmar; a tela corrige slot a
   slot sem migration.

4. **Variação por dia da semana** — ainda em aberto, e **não** foi antecipada no
   schema: `terminal_janelas` não tem `dia_semana`. Se variar, a mudança é uma
   coluna nova e a `UNIQUE` passando a incluí-la. Foi decisão consciente não
   adivinhar — a alternativa era carregar desde já uma dimensão que talvez não
   exista.

5. **Cancelamento pelo terminal** — ainda em aberto. Por ora o reagendamento
   iniciado pelo interno cobre; se for frequente, vale um status próprio.

6. **Solicitação interna** ✔ **Sim.** O card de agendamento na tela da
   solicitação tem "Registrar pedido", para o motorista que manda WhatsApp
   direto. O agendamento cai na mesma fila, com `parceiro_usuario_id` nulo —
   é assim que se distingue do que veio pelo portal.

---

## 11. O que a implementação mudou em relação à 0.1

Oito pontos. Nenhum muda o desenho; todos vieram de conferir a spec contra o
banco e as telas que já existem.

**1. `p_periodo text` virou `p_hora_preferida time`.** A 0.1 tinha resquício de
um rascunho anterior em que o parceiro escolhia manhã/tarde: a tabela já dizia
`hora_preferida time` e a seção 5.1 já descrevia grade de slots, mas a
assinatura da RPC ainda pedia período. Vale a grade.

**2. "Observações internas" viraram `hora_fora_da_grade boolean`.** A 5.5 dizia
que o aviso de horário fora da grade ficaria "registrado nas observações
internas". Texto livre da equipe numa linha que o parceiro lê pelo RLS seria
vazamento na primeira vez que alguém escrevesse ali. Um booleano calculado no
servidor na hora de concluir resolve melhor: não vaza, não depende de alguém
lembrar de escrever, e ainda é contável — dá para medir com que frequência cada
terminal foge da própria grade.

**3. `clientes_publicos` ganhou quatro colunas.** O portal precisa saber se o
destino exige agendamento e qual a antecedência. O parceiro não tem `SELECT` em
`clientes`; a view já existia para exatamente esse tipo de exposição controlada.
Frete, liberação e observações comerciais continuam de fora.

**4. Seed por `razao_social` continua, mas ganhou uma saída.** O seed da 3.1.1 é
frágil pelo motivo que a própria 0.1 aponta (a base tem grafias divergentes) e
só age em cliente já marcado — em base limpa não faz nada. A tela de cadastro
aplica a grade por **id**, via `terminal_aplicar_grade_padrao`, sem adivinhar
por texto.

**5. Peso não entra no bloco de cópia (ainda).** A 5.5 lista "Peso 36,78 t",
mas peso não existe no SisLog: `peso_liquido` vive em `embarques`
(SPEC-EMBARQUES 3.2). A linha aparece quando o módulo existir e a NF for
localizada; até lá, some em vez de mostrar vazio.

**6. Concluir exige ter assumido.** A máquina de estados não aceita
`solicitado -> agendado`. Isso é a trava de concorrência valendo de fato: o
botão do card na solicitação assume e abre o painel no mesmo clique, e "Retomar"
um item parado há mais de 2 h passa pela RPC de novo, para a trava trocar de
dono em vez de o card continuar com o nome de quem saiu.

**7. Registro de acesso ampliado (LGPD).** `log_acesso` (0059) tinha CHECK com
três ações. A 0061 acrescenta `abrir_documento_agendamento` e `copiar_cpf` — sem
isso, a regra da seção 8 ("CPF revelado só ao copiar, com acesso registrado")
seria uma chamada que o banco descartaria em silêncio.

**8. Contrato de frete da Pamcard (0064, pedido depois da entrega inicial).**
Terceiro documento, obrigatório para concluir e devolvido ao parceiro junto com
o comprovante. Trouxe junto duas correções no que a 0061 tinha entregado: os
uploads passam a gravar o caminho na linha **na hora** (antes ficavam só no
estado da tela até a conclusão — fechar o painel no meio perdia a referência e
deixava arquivo órfão no bucket), e o portal só revela os documentos quando o
status é `agendado`, para a entrega continuar sendo de todos de uma vez.

O CHECK entrou como `NOT VALID`: já havia agendamento concluído antes da regra,
e as alternativas eram inventar um caminho de arquivo ou apagar dado de
produção. A dívida se fecha com `VALIDATE CONSTRAINT` depois de anexar o
contrato nas linhas herdadas.

---

## 12. Documentos relacionados

- `SPEC.md` — sistema interno
- `SPEC-FRONTEND.md` — padrões visuais
- `SPEC-PORTAL.md` — portal de parceiros
- `SPEC-EMBARQUES.md` — embarques e painel de contratação
- `COMPLIANCE.md` — conformidade LGPD
- `SPEC-AGENDAMENTOS.md` — este documento
