# SisLog LHG — Módulo de Embarques e Painel de Contratação

Especificação do módulo que substitui a planilha `Embarques_Diários_2026`.

**Versão 0.3** — revisada após validação nos dados reais e confirmação de regras
de negócio com a operação.

**Pré-requisito:** MVP interno estável em produção.

**Origem:** demanda da diretoria — patrocínio interno que justifica o esforço.

---

## 1. Diagnóstico da planilha atual

O arquivo tem 34 abas e 20 MB. Reduz-se a três tipos de conteúdo:

### 1.1 Dado bruto (fato)

| Aba | Linhas | Período | Conteúdo |
|---|---|---|---|
| `Dedicados` | 76.402 | 01/01 a 30/07/2026 | Embarques da frota dedicada |
| `LHG` | 14.754 | 01/01 a 30/07/2026 | Embarques LHG (640.044 t) |

Despejos do Corporate no nível de CT-e. Mesmo conjunto de campos, com offset de
coluna diferente (ver 5.2).

### 1.2 Dado derivado (consulta congelada em fórmula)

`Jan`, `Fev`, `Mar`, `ABR`, `MAI`, `Junh`, `Julh`, `Ago`, `Histórico por
Destino`, `Performance diária`, `Orçado vs Realizado`.

Fórmula típica de célula de dia:

```
=SUMIFS(LHG!$G:$G, LHG!$V:$V, $A2, LHG!$D:$D, I$1)
```

Um `GROUP BY` replicado em milhares de células. **Nenhuma vira tabela.**

### 1.3 Dado que só existe na planilha

`PAINEL -STATUS CONTRATAÇÃO` — capacidade de dedicados por rota, programação
S&OP, volume liberado, e **observações em texto livre por rota e por data** em
384 colunas. Conhecimento operacional sem backup, sem histórico, sem autoria.

---

## 2. A descoberta central

O processo atual tem duas idas ao Corporate:

1. Buscar o que **já embarcou** → cola em `Dedicados` e `LHG`
2. Buscar **contratados que não carregaram** nos últimos 2 dias → digita no painel

**A segunda é desnecessária.** Toda OC do SisLog já tem `numero_instrucao`. Se o
veículo carregou, a instrução aparece no dump. Se não aparece, está pendente.

---

## 3. Achados verificados nos dados

Condicionam a implementação. Todos medidos sobre os dados reais.

### 3.1 Chaves e formatos

| Campo | Formato | Distintos | Observação |
|---|---|---|---|
| CT-e (código) | numérico 6 díg. | **100% único** | Chave natural do fato |
| Instrução **Matriz** | numérico 8 díg. | 99,6% | Número de busca no Corporate |
| Instrução **Filial** | numérico 5-6 díg. | 99,6% | **É o que o SisLog grava** |

**Decisão:** o SisLog registra a Filial. O join usa `instrucao_filial`.

**Guardar as duas.** A Matriz não participa do join, mas é o número que a
operação usa para localizar o registro no Corporate — necessária para
investigação manual.

### 3.2 Filial não é única sozinha

Nos Dedicados, **11 números de filial aparecem em mais de uma empresa**
(`333654`, `322048`, `322036`, …). Faz sentido: a numeração é por filial, e as
filiais (Tupacery/MJS e Urucum/MJU) reiniciam a contagem.

O SisLog **não registra a filial** — registra a subcontratada. Logo a chave
composta `(empresa, filial)` não é montável do lado do SisLog.

**Solução:** join por `instrucao_filial` **+ `placa_cavalo`**. A placa é
confiável no SisLog (confirmado com a operação) e nos 11 casos de colisão os
veículos são diferentes. Bônus: divergência de placa revela erro de digitação
que hoje passa despercebido.

### 3.3 Instrução repetida: devolução de nota

54 grupos com instrução repetida na LHG. Regra de negócio confirmada: quando a
nota sai com peso ou destino errado, a equipe de faturamento **devolve e emite
outra**. Ambas ficam no dump com CT-e válido e mesmo "Tipo Documento" — a
devolvida não vem marcada.

**Consequência:** a planilha atual soma o mesmo carregamento duas vezes.

Distribuição do intervalo entre emissões:

| Intervalo | Ocorrências | Peso extra |
|---|---|---|
| D+1 | 43 | 1.818,15 t |
| D+2 | 4 | 153,87 t |
| D+3 a D+7 | 9 | 322,72 t |
| **Total** | **56** | **2.294,74 t** |

D+1 concentra 77% das ocorrências e 79% do peso — assinatura clara de
devolução. A cauda longa é outra coisa.

Caso investigado (`MJS 387029`, matriz `23697793`):

```
19/01 → CT-e 734044 → NF 6/254215 → 25 t → SHC9G60/QPM3I57
22/01 → CT-e 738348 → NF 6/255942 → 25 t → SHC9G60/QPM3I57
29/01 → CT-e 748271 → NF 6/260298 → 25 t → SHC9G60/QPM3I57
```

Três notas fiscais distintas, intervalos de 3 e 7 dias, mesmo conjunto veicular
e destino. São três viagens reais reaproveitando a instrução — não devolução.

Adicionalmente: **6 pares têm placa de cavalo diferente**. Veículo diferente
nunca é reemissão da mesma nota.

### 3.4 Regra de substituição adotada

O discriminador **não** é uma janela fixa de dias — é o **tipo da rota**,
porque o tempo de ciclo é radicalmente diferente entre elas:

| Tipo de rota | Frequência real | Exemplos |
|---|---|---|
| `longa` | 1 a 2 viagens por semana | Pindamonhangaba, São João del Rei, Betim, Pará de Minas, Mogi das Cruzes |
| `local` | 2 a 3 viagens por dia, 24h | Portos de Corumbá |

O ciclo de ida e volta em rota longa varia muito (manutenção, fila de descarga),
então não é parametrizável com segurança. Mas o piso é confiável: nenhuma rota
longa fecha ciclo em menos de 3 dias.

**Regra:** dentro do mesmo `(empresa, instrucao_filial)`, uma emissão é
**suspeita de substituição** quando as três condições valem juntas:

- a rota é do tipo `longa`, **e**
- a **placa do cavalo é a mesma** da emissão anterior, **e**
- o intervalo é de **até 2 dias**

Em qualquer outro caso — rota `local`, placa diferente, ou intervalo ≥ 3 dias —
é **carregamento real**.

Verificação nos dados reais (LHG + Dedicados):

| Classificação | Ocorrências | Peso |
|---|---|---|
| Substituição | 46 | 1.976,71 t |
| Viagem real | 180 | — |

Correção de 0,052% sobre 3.800.176 t. Repare na proporção: das 226 duplicatas,
apenas 46 são devolução. Uma janela fixa de 2 dias sem distinguir o tipo de rota
teria eliminado viagens reais e produzido acumulado **menor** que a realidade —
erro pior que o atual, por ser para baixo num número acompanhado pela diretoria.

Distribuição observada, que sustenta a regra:

| Destino | Duplicatas | Intervalos |
|---|---|---|
| Pindamonhangaba (SP) | 31 | predominância de D+1 |
| São João del Rei (MG) | 13 | predominância de D+1 |
| Betim / Pará de Minas / Mogi | 5 | D+1 |
| Corumbá (portos locais) | 7 | D+2 a D+7 |

Dois fatos decisivos:

**Não existe nenhuma duplicata D+0.** Se as viagens ao porto reusassem
instrução, os 2-3 carregamentos diários apareceriam como duplicatas no mesmo
dia. Não aparecem — cada viagem ao porto recebe instrução própria. A alta
rotatividade local não gera ambiguidade.

**44 das 56 duplicatas da LHG estão em rotas longas**, quase todas em D+1. Um
cavalo não faz duas viagens a Pindamonhangaba em um dia: nessas rotas, D+1 só
pode ser devolução de nota.

**Nada é apagado.** O registro permanece em `embarques` com `substituido_por`
apontando para o CT-e que o corrigiu. As queries de volume excluem os
substituídos; a rastreabilidade permanece intacta.

**Toda marcação é revisável.** O sistema sugere pela regra; o analista confirma
ou recusa na tela de importação. Nunca decide sozinho.

### 3.5 Instrução nula

| Aba | Nulos | % |
|---|---|---|
| LHG | 1.139 | 7,7% |
| Dedicados | 931 | 1,2% |

**Não descartar** — contam para o volume. Apenas não participam do cruzamento
com contratação.

### 3.6 Cidade de frete ≠ destino do painel

`TCI Soluções Logisticas LTDA` tem `cidade_frete = SAO JOAO DEL REI`, mas o
painel chama a rota de **Itutinga**.

**A dimensão de rotas mapeia por destinatário, nunca por cidade.**

### 3.7 Cardinalidade da dimensão

35 pares destinatário/cidade na LHG, 20 nos Dedicados. Dimensão pequena e
estável.

### 3.8 Divergência de grafia

O mesmo cliente aparece escrito de formas diferentes entre abas (`A. B.
OPERADORA DE TERMINAIS L`, ` Estoque-A. B. OPERADORA DE `). Como `SUMIFS` casa
por texto exato, divergência produz **zero silencioso** — a célula mostra 0 e
ninguém percebe que é erro, não ausência.

Uma dimensão com apelido canônico elimina essa classe de falha.

---

## 4. Modelo de dados

### 4.1 `embarques` — fato

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `empresa_fonte` | text | `'LHG'` ou `'DEDICADOS'` |
| `empresa_sigla` | text | `MJS`, `MJU` — filial emissora |
| `cte_codigo` | text NOT NULL | Chave natural |
| `data_emissao` | date NOT NULL | |
| `nota_fiscal` | text | Distingue devolução de viagem nova |
| `peso_liquido` | numeric NOT NULL | Toneladas |
| `instrucao_filial` | text | **Chave de join com SisLog**, nullable |
| `instrucao_matriz` | text | Referência para busca no Corporate |
| `placa_cavalo` | text | **Chave secundária de join** |
| `tipo_cavalo` | text | |
| `placa_carreta` | text | |
| `tipo_carreta` | text | |
| `motorista_nome` | text | Ver seção 8 |
| `motorista_cpf` | text | **Ver seção 8 — não importar por padrão** |
| `transportador_nome` | text | |
| `remetente_nome` | text | |
| `destinatario_nome` | text NOT NULL | Ligação com `rotas` |
| `cidade_frete` | text | |
| `uf` | text | |
| `tipo_documento` | text | |
| `rota_id` | uuid FK rotas | Resolvido na importação |
| `substituido_por` | uuid FK embarques | Preenchido quando substituído |
| `substituicao_confirmada_por` | uuid FK auth.users | Quem revisou |
| `importacao_id` | uuid FK importacoes_embarques | |

**Idempotência:**

```sql
ALTER TABLE embarques
  ADD CONSTRAINT uq_embarques_cte UNIQUE (empresa_fonte, cte_codigo);
```

Reimportar o mesmo arquivo não duplica. Importação usa `ON CONFLICT DO NOTHING`.

**Índices:**

```sql
CREATE INDEX idx_embarques_data ON embarques(data_emissao);
CREATE INDEX idx_embarques_rota_data ON embarques(rota_id, data_emissao);
CREATE INDEX idx_embarques_join
  ON embarques(instrucao_filial, placa_cavalo)
  WHERE instrucao_filial IS NOT NULL;
CREATE INDEX idx_embarques_substituido
  ON embarques(substituido_por) WHERE substituido_por IS NOT NULL;
```

### 4.2 `rotas` — dimensão

| Coluna | Tipo | Exemplo |
|---|---|---|
| `id` | uuid PK | |
| `apelido` | text UNIQUE NOT NULL | `METALSIDER`, `TCI`, `CSN` |
| `cliente_razao_social` | text NOT NULL | `METALSIDER LTDA` |
| `destino_label` | text | `Betim`, `Itutinga`, `Pinda` |
| `produto` | text | `HTHG`, `LOHG/SFHG` |
| `tipo_rota` | text NOT NULL | `local` ou `longa` — ver 3.4 |
| `capacidade_dedicados` | integer | Coluna A do painel |
| `ativo` | boolean | |

**`rota_aliases`** — resolve a divergência de grafia (3.8):

| Coluna | Tipo |
|---|---|
| `rota_id` | uuid FK rotas |
| `destinatario_nome` | text UNIQUE |

Importação resolve `destinatario_nome → rota_id` por lookup. Sem match, o
registro entra como **não classificado** e aparece na tela para mapeamento.

### 4.3 `metas_mensais`

| Coluna | Tipo |
|---|---|
| `rota_id` | uuid FK rotas |
| `ano` / `mes` | integer |
| `programado_sop` | numeric |
| `liberado` | numeric |

UNIQUE (rota_id, ano, mes).

### 4.4 `painel_observacoes`

Substitui as 384 colunas de observação.

| Coluna | Tipo |
|---|---|
| `rota_id` | uuid FK rotas |
| `data` | date |
| `texto` | text |
| `created_by` | uuid FK auth.users |

UNIQUE (rota_id, data). Ganha autoria, histórico e busca.

### 4.5 `importacoes_embarques`

| Coluna | Tipo |
|---|---|
| `arquivo_nome` | text |
| `empresa_fonte` | text |
| `linhas_lidas` / `inseridas` / `ignoradas` | integer |
| `nao_classificados` | integer |
| `substituicoes_sugeridas` / `confirmadas` | integer |
| `periodo_min` / `periodo_max` | date |
| `importado_por` | uuid |

---

## 5. Parser de importação

### 5.1 Estrutura do arquivo

Cabeçalho de **dois níveis**:

- Linha 1: grupos (`Empresa`, `Documento`, `CT-e`, `Instrução`, `Veículo`, …)
- Linha 2: campos (`Código`, `Sigla`, `Data`, `Matriz`, `Filial`, `Placa`, …)
- Linha 3+: dados

O parser pula as duas primeiras linhas.

### 5.2 Mapa de colunas (índice base 0)

`Dedicados` tem uma coluna `Mês` na posição 0 que `LHG` não tem — todo o resto
desloca em 1. O parser detecta a variante pelo cabeçalho, não por configuração.

| Campo | LHG | Dedicados |
|---|---|---|
| Mês | — | 0 |
| Empresa código | 0 | 1 |
| **Empresa sigla** | **1** | **2** |
| **CT-e código** | **2** | **3** |
| **Data** | **3** | **4** |
| CT-e número | 4 | 5 |
| **Nota fiscal** | **5** | **6** |
| **Peso líquido** | **6** | **7** |
| Instrução matriz | 7 | 8 |
| **Instrução filial** | **8** | **9** |
| **Placa cavalo** | **9** | **10** |
| Tipo cavalo | 10 | 11 |
| Placa carreta | 11 | 12 |
| Tipo carreta | 12 | 13 |
| Motorista código | 13 | 14 |
| Motorista nome | 14 | 15 |
| Motorista CPF | 15 | 16 |
| Transportador código | 16 | 17 |
| Transportador nome | 17 | 18 |
| Remetente código | 18 | 19 |
| Remetente nome | 19 | 20 |
| Destinatário código | 20 | 21 |
| **Destinatário nome** | **21** | **22** |
| Tipo doc código | 22 | 23 |
| Tipo doc nome | 23 | 24 |
| Cidade frete | 24 | 25 |
| UF | 25 | 26 |
| País | 26 | 27 |

### 5.3 Fluxo da tela de importação

1. Usuário exporta o relatório do Corporate
2. Sobe o arquivo
3. Sistema detecta a variante, faz parse e valida
4. **Preview obrigatório**, mostrando:
   - Total de linhas e período coberto
   - Inseridas / já existentes (por CT-e)
   - **Destinatários não classificados**, com campo para mapear na hora
   - **Substituições sugeridas** (regra 3.4), com os pares lado a lado
     (data, peso, NF, placa) e caixa para confirmar ou recusar cada uma
   - Amostra das 10 primeiras linhas
5. Usuário confirma
6. Gravação com `ON CONFLICT DO NOTHING`
7. Registro em `importacoes_embarques`

A tela de substituições é o ponto de controle humano: o sistema aponta o
padrão D+1/mesma-placa, e o analista decide.

---

## 6. Queries do painel

### 6.1 Acumulado por rota no mês (exclui substituídos)

```sql
SELECT r.apelido, SUM(e.peso_liquido) AS acumulado
FROM embarques e
JOIN rotas r ON r.id = e.rota_id
WHERE date_trunc('month', e.data_emissao) = date_trunc('month', $1::date)
  AND e.substituido_por IS NULL
GROUP BY r.apelido;
```

### 6.2 Contratado sem embarque

Substitui a segunda ida ao Corporate. Join por instrução **e** placa (3.2).

```sql
SELECT s.numero_interno, s.numero_instrucao, s.created_at,
       m.nome_completo, v.placa, c.razao_social
FROM solicitacoes s
LEFT JOIN motoristas m ON m.id = s.motorista_id
LEFT JOIN veiculos   v ON v.id = s.veiculo_id
LEFT JOIN clientes   c ON c.id = s.cliente_id
WHERE s.numero_instrucao IS NOT NULL
  AND s.status <> 'cancelada'
  AND s.created_at >= now() - ($2 || ' days')::interval
  AND NOT EXISTS (
    SELECT 1 FROM embarques e
    WHERE e.instrucao_filial = s.numero_instrucao
      AND e.placa_cavalo     = v.placa
  );
```

Janela (`$2`) configurável na tela — hoje a operação usa 2 dias.

**Divergência de placa** (instrução casa, placa não) deve aparecer em painel
separado: é erro de digitação ou troca de veículo não registrada.

### 6.3 Métricas derivadas

| Métrica | Cálculo |
|---|---|
| Saldo | `liberado − acumulado` |
| Necessidade | `saldo / dias_uteis_restantes` |
| Ritmo | média móvel de peso/dia dos últimos N dias |
| % atendimento | `acumulado / liberado` |
| Faturados LHG / Dedicados | `COUNT(*) WHERE substituido_por IS NULL GROUP BY empresa_fonte` |

### 6.4 Performance diária e histórico por destino

`GROUP BY` sobre `embarques`. A Fase C é barata porque a dificuldade toda está
na Fase A.

---

## 7. Telas

### 7.1 Importação de embarques

Conforme 5.3. Acesso: `admin` / `analista`.

### 7.2 Painel de status de contratação

Colunas do painel atual: capacidade, cliente, destino, produto, programado,
liberado, acumulado, saldo, necessidade, ritmo, % atendimento, faturados.

Adições que a planilha não tem:

- **Alerta de rota fora de ritmo** — destaque quando a necessidade diária supera
  o ritmo observado
- **Observação inline** por rota/dia, com autoria e histórico
- **Contratados sem embarque** por rota (query 6.2)
- **Divergências de placa** para conferência

### 7.3 Análises

Performance diária (matriz mês × dia) e histórico por destino, com filtro de
período arbitrário.

---

## 8. LGPD

As abas de origem trazem **nome e CPF de motorista** em 91.156 linhas.
Importar amplia o escopo do `COMPLIANCE.md` para tratamento em larga escala de
identificador civil.

O CPF **não aparece em nenhuma métrica do painel** — as análises são por rota,
cliente, peso e data.

**Decisão: não importar CPF por padrão.** O parser mantém a coluna desabilitada,
habilitável apenas com justificativa registrada. Minimização (art. 6º, III)
reduz exposição sem custo funcional.

---

## 9. Fases

**Fase A — Fato e importação**
- Tabelas `embarques`, `rotas`, `rota_aliases`, `importacoes_embarques`
- Parser das duas variantes com detecção automática
- Tela de importação com preview, deduplicação, mapeamento e revisão de
  substituições
- Seed de `rotas`/`rota_aliases` a partir das 55 combinações existentes

Elimina as oito abas mensais.

**Fase B — Painel**
- `metas_mensais`, `painel_observacoes`
- Painel com métricas derivadas
- Contratados sem embarque + divergências de placa

Elimina a segunda ida ao Corporate.

**Fase C — Analítico**
- Performance diária, histórico por destino, orçado vs realizado

---

## 10. Questões em aberto

1. **Dias úteis** — o cálculo de necessidade divide saldo por dias restantes.
   Considerar sábado? Feriado? Precisa de tabela de calendário?
2. **Frequência de importação** — diária, como hoje?
3. **Classificação das rotas** — preencher `tipo_rota` para todas as rotas no
   seed da Fase A. Regra prática: destino em Corumbá é `local`; qualquer destino
   fora do município é `longa`. Confirmar se há rota intermediária que não se
   encaixe bem em nenhum dos dois.
4. **Instrução `23697793`** (matriz de `MJS 387029`) — confirmar no Corporate se
   as três emissões são viagens reais. Se forem, a regra 3.4 está correta. Se
   for outra coisa, revisar.

---

## 11. Documentos relacionados

- `SPEC.md` — sistema interno
- `SPEC-FRONTEND.md` — padrões visuais
- `SPEC-PATCH-PAMCARD.md` — Pamcard e origem
- `SPEC-PORTAL.md` — portal de parceiros
- `COMPLIANCE.md` — conformidade LGPD
- `SPEC-EMBARQUES.md` — este documento

## Controle de versões

| Versão | Alteração |
|---|---|
| 0.1 | Versão inicial |
| 0.2 | Join por `instrucao_filial` + `placa_cavalo`; regra de substituição por devolução de nota; `empresa_sigla`, `nota_fiscal` e `substituido_por` no fato; CPF fora por padrão |
| 0.3 | Regra de substituição passa a depender de `tipo_rota` (`local`/`longa`) em vez de janela fixa; campo `tipo_rota` na dimensão de rotas; impacto medido em 46 substituições / 1.976,71 t |
