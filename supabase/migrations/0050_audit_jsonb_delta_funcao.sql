-- 0050 — Extrai o cálculo do delta para uma função própria, testável
--
-- Por que existe: a 0049 embutiu o cálculo do delta dentro de `audit_trigger()`,
-- protegido por um `EXCEPTION WHEN OTHERS` que cai no comportamento antigo. A
-- rede funcionou (nenhuma escrita quebrou), mas ela ENGOLE o erro: em produção
-- as linhas novas continuaram saindo com a cópia inteira dos dois lados, e não
-- havia como saber o motivo — não dá para inspecionar pg_proc nem rodar EXPLAIN
-- pela API.
--
-- Correção estrutural: o cálculo vira `audit_jsonb_delta(old, new)`, uma função
-- PURA (IMMUTABLE, sem acesso a tabela) que recebe os dois JSONs e devolve o
-- par reduzido. Assim ela pode ser chamada direto por RPC com entradas
-- controladas, e qualquer erro aparece na resposta em vez de virar fallback
-- silencioso. O trigger passa a só orquestrar.
--
-- Segurança: é função pura sobre argumentos recebidos — não lê tabela, não usa
-- auth.uid(), não é SECURITY DEFINER. Expor no PostgREST não dá acesso a nada
-- que o chamador já não tenha em mãos.
--
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION audit_jsonb_delta(p_old jsonb, p_new jsonb)
RETURNS TABLE (antes jsonb, depois jsonb)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  -- Percorre as chaves de NEW (uma linha de tabela tem sempre o mesmo conjunto
  -- de colunas dos dois lados) e mantém só as que diferem. IS DISTINCT FROM
  -- trata NULL corretamente: NULL -> 'x' e 'x' -> NULL contam como mudança,
  -- NULL -> NULL não.
  SELECT
    COALESCE(jsonb_object_agg(e.key, p_old -> e.key), '{}'::jsonb),
    COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  FROM jsonb_each(p_new) AS e
  WHERE e.value IS DISTINCT FROM (p_old -> e.key);
$$;

COMMENT ON FUNCTION audit_jsonb_delta(jsonb, jsonb) IS
  'Reduz um par (antes, depois) as chaves que mudaram. Pura e testavel por RPC: '
  'existe separada do trigger justamente para que falhas aparecam na resposta em '
  'vez de virarem fallback silencioso (migration 0050).';

-- ============================================================
-- Trigger passa a delegar
-- ============================================================
-- Mantém a rede de proteção: esta função está anexada a ~20 tabelas e um erro
-- aqui abortaria a transação, derrubando toda escrita do sistema.
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

    BEGIN
      SELECT d.antes, d.depois INTO v_antes, v_depois
        FROM audit_jsonb_delta(v_old, v_new) AS d;
    EXCEPTION WHEN OTHERS THEN
      -- Fallback para o formato antigo: auditoria gorda é melhor que escrita
      -- abortada. Observável: linha nova com a cópia inteira = rede disparou.
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

NOTIFY pgrst, 'reload schema';
