-- 0049 — Auditoria de UPDATE passa a guardar só os campos que mudaram
--
-- Problema medido em 2026-07-27: `log_auditoria` tem 80 MB em ~44.000 linhas
-- (~1,9 KB por linha) contra ~10 MB de TODO o resto do banco somado. É a tabela
-- que mais cresce: 329 linhas/dia na última semana, 18.772 nos últimos 30 dias.
--
-- A causa não é o volume de eventos, é o tamanho de cada um. Em UPDATE o
-- trigger gravava `to_jsonb(OLD)` E `to_jsonb(NEW)` — duas cópias INTEIRAS da
-- linha — para registrar, quase sempre, a mudança de um único campo (o
-- `status` de uma solicitação, por exemplo). Uma solicitação tem ~40 colunas:
-- 39 delas eram copiadas duas vezes, idênticas, só para serem descartadas na
-- leitura.
--
-- Agora o UPDATE grava apenas as chaves cujo valor mudou, dos dois lados.
-- INSERT e DELETE continuam guardando a linha COMPLETA — de propósito: são os
-- únicos registros do que foi criado ou apagado, e um delta ali não teria
-- sentido (não há "antes" num INSERT nem "depois" num DELETE).
--
-- Compatibilidade com quem lê (conferido consumidor por consumidor):
--   • Auditoria (tela)   — UPDATE já era exibido via `diffJson(antes, depois)`,
--                          que por definição filtra os campos iguais. Com o
--                          delta a saída é IDÊNTICA, só que sem transportar o
--                          que seria descartado. INSERT/DELETE seguem exibindo
--                          o JSON completo, que continua completo.
--   • Relatórios         — leem `dados_*->>status`. Num UPDATE que não mexeu no
--                          status a chave passa a estar ausente e o `->>` volta
--                          NULL; o código já ignorava esse caso (comparava
--                          `prev === next`, agora cai no `!next`). Mesmo
--                          resultado.
--   • Atividade da equipe— lia `dados_depois->>numero_interno`, que NUNCA muda
--                          num UPDATE e portanto some do delta. Ajustado no
--                          mesmo PR para resolver o número a partir de
--                          `solicitacoes`, que é a fonte viva do dado.
--
-- O que esta migration NÃO faz, de propósito:
--   1. Não reescreve as 44.000 linhas já gravadas. Reescrever histórico de
--      auditoria é adulterar a trilha; e um UPDATE em massa não devolveria
--      espaço sem um VACUUM FULL, que trava a tabela — e travar `log_auditoria`
--      trava toda escrita do app, já que ~20 tabelas escrevem aqui por trigger.
--      Os 80 MB atuais continuam lá; o que muda é a inclinação da curva.
--   2. Não apaga nada por retenção. Quanto tempo guardar auditoria é decisão de
--      negócio/compliance, não de performance.
--
-- ATENÇÃO ao mexer nesta função: ela é SECURITY DEFINER e está anexada a ~20
-- tabelas — um erro aqui derruba TODA escrita do sistema. O `SET search_path`
-- abaixo veio da 0042 (correção de search_path hijacking) e precisa continuar
-- no CREATE OR REPLACE: omiti-lo reintroduziria a falha em silêncio.
--
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user   uuid;
  v_old    jsonb;
  v_new    jsonb;
  v_antes  jsonb;
  v_depois jsonb;
BEGIN
  BEGIN
    v_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_depois)
    VALUES (v_user, 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    -- Rede de proteção deliberada: esta função está anexada a ~20 tabelas, então
    -- uma exceção aqui abortaria a transação e derrubaria TODA escrita do
    -- sistema. Se o cálculo do delta falhar por qualquer motivo, caímos no
    -- comportamento anterior (linha inteira dos dois lados) — o registro de
    -- auditoria fica gordo, mas a operação do cliente não quebra.
    --
    -- Como o silêncio dessa rede poderia esconder um defeito para sempre: o
    -- efeito é observável. Se ela estiver disparando, as linhas novas de
    -- `log_auditoria` continuam com ~1,9 KB em vez de cair para ~200 bytes.
    -- Foi assim que a mudança foi conferida em produção depois do deploy.
    BEGIN
      -- Percorre as chaves de NEW (uma linha de tabela tem sempre o mesmo
      -- conjunto de colunas dos dois lados) e mantém só as que diferem.
      -- IS DISTINCT FROM trata NULL corretamente: NULL -> 'x' e 'x' -> NULL
      -- contam como mudança, NULL -> NULL não.
      SELECT
        COALESCE(jsonb_object_agg(e.key, v_old -> e.key), '{}'::jsonb),
        COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        INTO v_antes, v_depois
        FROM jsonb_each(v_new) AS e
       WHERE e.value IS DISTINCT FROM (v_old -> e.key);
    EXCEPTION WHEN OTHERS THEN
      v_antes  := v_old;
      v_depois := v_new;
    END;

    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
    VALUES (v_user, 'UPDATE', TG_TABLE_NAME, NEW.id, v_antes, v_depois);
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes)
    VALUES (v_user, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION audit_trigger() IS
  'Trilha de auditoria. INSERT/DELETE guardam a linha completa; UPDATE guarda '
  'apenas as chaves alteradas, nos dois lados (migration 0049 — antes gravava '
  'duas copias inteiras da linha por UPDATE, o que fazia log_auditoria sozinha '
  'responder por ~90% do tamanho do banco). SECURITY DEFINER com search_path '
  'fixo (0042).';

NOTIFY pgrst, 'reload schema';
