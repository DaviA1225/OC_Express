-- 0080 — Dashboards operacionais: funções de leitura (RPCs) do Painel, do Modo
-- TV, dos Relatórios e da Produtividade, e o salvamento atômico de Metas e SLA.
--
-- Plano: .omc/plans/dashboards-operacionais.md (v2), §1 e §2.5. Contrato dos
-- retornos: apps/interno/src/features/metricas/tipos.ts (mesmos nomes de campo).
--
-- Convenções:
--   * fuso da operação: America/Campo_Grande (dia e hora sempre cortados aqui);
--   * p_de/p_ate são DATAS inclusivas; o intervalo efetivo é
--     [p_de 00:00 MS, least(p_ate+1 00:00 MS, now())) e o período anterior é o
--     mesmo intervalo deslocado para trás pelo tamanho do período;
--   * durações em MINUTOS, percentis com o n junto, frações 0–1 em *_pct;
--   * filtros comuns F: p_origem ('todas' | 'interno' = tudo que não é parceiro
--     | 'parceiro'), p_cliente_id, p_local ('Sem local' = local vazio).
--   * painel_* e relatorio_produtividade são SECURITY DEFINER com checagem
--     explícita de perfil; as demais são INVOKER (a RLS de solicitacoes vale) e
--     também recusam quem não é da equipe interna.
--
-- Idempotente (CREATE OR REPLACE). Só funções: entra no fim do cumulative-schema.

-- ─────────────────────────────────────────────────────────────────────────────
-- Auxiliares
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dash_filtro(
  s_origem text, s_cliente uuid, s_local text,
  p_origem text, p_cliente_id uuid, p_local text
)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT (coalesce(p_origem, 'todas') = 'todas'
          OR (p_origem = 'parceiro' AND s_origem = 'parceiro')
          OR (p_origem = 'interno'  AND s_origem IS DISTINCT FROM 'parceiro'))
     AND (p_cliente_id IS NULL OR s_cliente = p_cliente_id)
     AND (p_local IS NULL OR coalesce(nullif(btrim(s_local), ''), 'Sem local') = p_local);
$$;

-- Percentis em minutos de uma lista de durações (em minutos).
CREATE OR REPLACE FUNCTION public.dash_percentis(p_min double precision[])
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'p50', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY x))::numeric, 1),
    'p90', round((percentile_cont(0.9) WITHIN GROUP (ORDER BY x))::numeric, 1),
    'n', count(x))
  FROM unnest(coalesce(p_min, '{}')) AS x;
$$;

-- Limites efetivos de um período (ver convenções).
CREATE OR REPLACE FUNCTION public.dash_limites(p_de date, p_ate date)
RETURNS TABLE (ini timestamptz, fim timestamptz, ini_ant timestamptz, fim_ant timestamptz)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_len interval;
BEGIN
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_ate - p_de > 400 THEN
    RAISE EXCEPTION 'Período máximo: 400 dias.' USING ERRCODE = '22023';
  END IF;
  v_len := make_interval(days => p_ate - p_de + 1);
  ini := p_de::timestamp AT TIME ZONE 'America/Campo_Grande';
  fim := least((p_ate + 1)::timestamp AT TIME ZONE 'America/Campo_Grande', now());
  ini_ant := ini - v_len;
  fim_ant := fim - v_len;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.dash_exigir_interno()
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT coalesce((SELECT public.is_interno()), false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Passagens por etapa (entrou → saiu) de um conjunto de solicitações, a partir
-- das transições. A passagem aberta (etapa atual) sai com `saiu` = NULL.
CREATE OR REPLACE FUNCTION public.dash_passagens(p_ids uuid[])
RETURNS TABLE (solicitacao_id uuid, etapa text, entrou timestamptz, saiu timestamptz)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT t.solicitacao_id, t.para_status, t.em,
         lead(t.em) OVER (PARTITION BY t.solicitacao_id ORDER BY t.em, t.id)
  FROM solicitacao_transicoes t
  WHERE t.solicitacao_id = ANY (p_ids);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Painel e TV (SECURITY DEFINER: a TV não lê solicitacoes; payload sem PII)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.painel_estado_atual(
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agora timestamptz := now();
  v_hoje  date := (now() AT TIME ZONE 'America/Campo_Grande')::date;
  v_lim_validade date;
  v_out   jsonb;
  v_interno boolean := coalesce(is_interno(), false);
BEGIN
  IF NOT (v_interno OR coalesce(is_painel_tv(), false)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT ((v_agora AT TIME ZONE 'America/Campo_Grande') + make_interval(hours => m.alerta_validade_h))::date
    INTO v_lim_validade FROM metas_operacao m WHERE m.singleton;
  v_lim_validade := coalesce(v_lim_validade, v_hoje + 1);

  WITH abertas AS (
    SELECT s.id, s.numero_interno, s.status, s.origem, s.created_at, s.status_desde,
           s.cliente_id, nullif(btrim(s.local_carregamento), '') AS local,
           extract(epoch FROM (v_agora - s.status_desde)) / 60 AS min_na_etapa,
           e.alerta_min,
           sla_classificar(s.status, s.status_desde, v_agora, e.aviso_min, e.alerta_min, e.ativo) AS cls
    FROM solicitacoes s
    LEFT JOIN sla_etapas e ON e.status = s.status
    WHERE s.status IN ('recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada')
      AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)
  ),
  fila AS (SELECT * FROM abertas WHERE status <> 'oc_enviada'),
  etapas AS (
    SELECT st.status, st.ordem,
           count(a.id) AS qtd,
           count(a.id) FILTER (WHERE a.cls = 'fora') AS fora_sla,
           count(a.id) FILTER (WHERE a.cls = 'aviso') AS aviso,
           round(max(a.min_na_etapa)) AS mais_antiga_min
    FROM (VALUES ('recebida', 1), ('em_cadastro', 2), ('instrucao_emitida', 3), ('oc_gerada', 4), ('oc_enviada', 5))
         AS st(status, ordem)
    LEFT JOIN abertas a ON a.status = st.status
    GROUP BY st.status, st.ordem
  ),
  aging AS (
    SELECT f.faixa, f.ordem, count(q.id) AS qtd
    FROM (VALUES ('lt1h', 1, 0, 60), ('1a4h', 2, 60, 240), ('4a8h', 3, 240, 480),
                 ('8a24h', 4, 480, 1440), ('gt24h', 5, 1440, NULL)) AS f(faixa, ordem, de_min, ate_min)
    LEFT JOIN fila q
      ON extract(epoch FROM (v_agora - q.created_at)) / 60 >= f.de_min
     AND (f.ate_min IS NULL OR extract(epoch FROM (v_agora - q.created_at)) / 60 < f.ate_min)
    GROUP BY f.faixa, f.ordem
  ),
  locais AS (
    SELECT coalesce(local, 'Sem local') AS local, count(*) AS qtd,
           count(*) FILTER (WHERE cls = 'fora') AS fora_sla,
           row_number() OVER (ORDER BY count(*) DESC, coalesce(local, 'Sem local')) AS rk
    FROM fila GROUP BY coalesce(local, 'Sem local')
  ),
  por_local AS (
    SELECT local, qtd, fora_sla, rk FROM locais WHERE rk <= 6
    UNION ALL
    SELECT 'Outros', sum(qtd), sum(fora_sla), 7 FROM locais WHERE rk > 6 HAVING count(*) > 0
  ),
  atrasadas AS (
    SELECT a.id, a.numero_interno, a.status, c.razao_social AS cliente, a.local, a.origem,
           round(a.min_na_etapa) AS min_na_etapa, round(a.min_na_etapa - a.alerta_min) AS excesso_min
    FROM fila a LEFT JOIN clientes c ON c.id = a.cliente_id
    WHERE a.cls = 'fora'
    ORDER BY a.min_na_etapa - a.alerta_min DESC
    LIMIT 12
  )
  SELECT jsonb_build_object(
    'gerado_em', v_agora,
    'fila', jsonb_build_object(
      'total', (SELECT count(*) FROM fila),
      'aguardando_finalizacao', (SELECT count(*) FROM abertas WHERE status = 'oc_enviada'),
      'fora_sla', (SELECT count(*) FROM fila WHERE cls = 'fora'),
      'aviso', (SELECT count(*) FROM fila WHERE cls = 'aviso')),
    'etapas', (SELECT jsonb_agg(jsonb_build_object('status', status, 'qtd', qtd, 'fora_sla', fora_sla,
                                                   'aviso', aviso, 'mais_antiga_min', mais_antiga_min) ORDER BY ordem)
               FROM etapas),
    'aging', (SELECT jsonb_agg(jsonb_build_object('faixa', faixa, 'qtd', qtd) ORDER BY ordem) FROM aging),
    'validade', jsonb_build_object(
      'vencendo', (SELECT count(*) FROM abertas a JOIN solicitacoes s ON s.id = a.id
                    WHERE a.status IN ('oc_gerada', 'oc_enviada') AND s.validade_fim BETWEEN v_hoje AND v_lim_validade),
      'vencidas', (SELECT count(*) FROM abertas a JOIN solicitacoes s ON s.id = a.id
                    WHERE a.status IN ('oc_gerada', 'oc_enviada') AND s.validade_fim < v_hoje)),
    'pamcard_pendente', (SELECT count(*) FROM solicitacoes s
                          WHERE s.origem = 'parceiro' AND s.pamcard_status = 'nao_tem_cartao'
                            AND s.pamcard_providenciado_em IS NULL
                            AND s.status NOT IN ('finalizada', 'cancelada')
                            AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)),
    'pendencias_parceiro', (SELECT count(*) FROM solicitacao_pendencias p JOIN solicitacoes s ON s.id = p.solicitacao_id
                             WHERE p.status = 'aberta' AND p.parceiro_id IS NOT NULL
                               AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)),
    'por_local', coalesce((SELECT jsonb_agg(jsonb_build_object('local', local, 'qtd', qtd, 'fora_sla', fora_sla) ORDER BY rk)
                           FROM por_local), '[]'::jsonb),
    -- A TV não recebe o id (nada a abrir na parede, e o id abriria o PDF da OC
    -- por outras portas). A equipe interna recebe, para o link da linha.
    'atrasadas', coalesce((SELECT jsonb_agg(CASE WHEN v_interno THEN to_jsonb(x) ELSE to_jsonb(x) - 'id' END
                                            ORDER BY x.excesso_min DESC) FROM atrasadas x), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.painel_hoje(
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agora timestamptz := now();
  v_hoje  date := (now() AT TIME ZONE 'America/Campo_Grande')::date;
  v_ini   timestamptz := (now() AT TIME ZONE 'America/Campo_Grande')::date::timestamp AT TIME ZONE 'America/Campo_Grande';
  v_m     metas_operacao%ROWTYPE;
  v_out   jsonb;
BEGIN
  IF NOT (coalesce(is_interno(), false) OR coalesce(is_painel_tv(), false)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM metas_operacao WHERE singleton;

  WITH s AS (
    SELECT s.status, s.created_at, s.finalizada_em
    FROM solicitacoes s
    WHERE dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)
      AND (s.created_at >= v_ini - interval '29 days' OR s.finalizada_em >= v_ini - interval '29 days')
  ),
  fin AS (SELECT finalizada_em FROM s WHERE status = 'finalizada' AND finalizada_em IS NOT NULL),
  horas AS (SELECT generate_series(0, 23) AS hora)
  SELECT jsonb_build_object(
    'finalizadas', (SELECT count(*) FROM fin WHERE finalizada_em >= v_ini),
    'finalizadas_ref', (SELECT count(*) FROM fin WHERE finalizada_em >= v_ini - interval '1 day'
                                                  AND finalizada_em < v_agora - interval '1 day'),
    'meta', v_m.meta_finalizadas_dia,
    'finalizadas_2h', (SELECT count(*) FROM fin WHERE finalizada_em >= v_agora - interval '2 hours'),
    'lead7d', dash_percentis((SELECT array_agg(extract(epoch FROM (finalizada_em - created_at)) / 60)
                               FROM s WHERE status = 'finalizada' AND finalizada_em >= v_agora - interval '7 days')),
    'lead7d_ant', (SELECT dash_percentis(array_agg(extract(epoch FROM (x.finalizada_em - x.created_at)) / 60))
                   FROM solicitacoes x
                   WHERE x.status = 'finalizada'
                     AND x.finalizada_em >= v_agora - interval '14 days' AND x.finalizada_em < v_agora - interval '7 days'
                     AND dash_filtro(x.origem, x.cliente_id, x.local_carregamento, p_origem, p_cliente_id, p_local)),
    'por_hora', (SELECT jsonb_agg(jsonb_build_object(
                    'hora', h.hora,
                    'finalizadas', (SELECT count(*) FROM fin
                                     WHERE finalizada_em >= v_ini
                                       AND extract(hour FROM finalizada_em AT TIME ZONE 'America/Campo_Grande') = h.hora),
                    'entradas', (SELECT count(*) FROM s
                                  WHERE created_at >= v_ini
                                    AND extract(hour FROM created_at AT TIME ZONE 'America/Campo_Grande') = h.hora),
                    'ref', (SELECT round(count(*) / 4.0, 2) FROM fin
                             WHERE (finalizada_em AT TIME ZONE 'America/Campo_Grande')::date
                                   IN (v_hoje - 7, v_hoje - 14, v_hoje - 21, v_hoje - 28)
                               AND extract(hour FROM finalizada_em AT TIME ZONE 'America/Campo_Grande') = h.hora))
                  ORDER BY h.hora) FROM horas h),
    'expediente_inicio', to_char(coalesce(v_m.expediente_inicio, '07:00'::time), 'HH24:MI'),
    'expediente_fim', to_char(coalesce(v_m.expediente_fim, '18:00'::time), 'HH24:MI')
  ) INTO v_out;
  RETURN v_out;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Relatórios (INVOKER: a RLS de solicitacoes vale; só equipe interna)
-- ─────────────────────────────────────────────────────────────────────────────

-- Um bloco de indicadores para [ini, fim).
CREATE OR REPLACE FUNCTION public.dash_bloco_resumo(
  p_ini timestamptz, p_fim timestamptz, p_origem text, p_cliente_id uuid, p_local text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ent int; v_canc_coorte int; v_fin int; v_canc int;
  v_c48_num int; v_c48_den int;
  v_ids uuid[];
  v_dentro numeric;
BEGIN
  PERFORM dash_exigir_interno();
  IF p_fim - p_ini > interval '401 days' THEN
    RAISE EXCEPTION 'Período máximo: 400 dias.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE s.status = 'cancelada')
    INTO v_ent, v_canc_coorte
  FROM solicitacoes s
  WHERE s.created_at >= p_ini AND s.created_at < p_fim
    AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local);

  SELECT count(*), array_agg(s.id) INTO v_fin, v_ids
  FROM solicitacoes s
  WHERE s.status = 'finalizada' AND s.finalizada_em >= p_ini AND s.finalizada_em < p_fim
    AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local);

  SELECT count(DISTINCT t.solicitacao_id) INTO v_canc
  FROM solicitacao_transicoes t JOIN solicitacoes s ON s.id = t.solicitacao_id
  WHERE t.para_status = 'cancelada' AND t.em >= p_ini AND t.em < p_fim
    AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local);

  -- R4: entradas com 48 h+ de idade; canceladas fora do denominador (D8).
  SELECT count(*) FILTER (WHERE s.status = 'finalizada' AND s.finalizada_em - s.created_at <= interval '48 hours'),
         count(*) FILTER (WHERE s.status <> 'cancelada')
    INTO v_c48_num, v_c48_den
  FROM solicitacoes s
  WHERE s.created_at >= p_ini AND s.created_at < least(p_fim, now() - interval '48 hours')
    AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local);

  -- R7: das finalizadas, quantas sem nenhuma passagem acima do alerta da etapa.
  SELECT CASE WHEN count(*) = 0 THEN NULL
              ELSE round(count(*) FILTER (WHERE NOT x.estourou)::numeric / count(*), 4) END
    INTO v_dentro
  FROM (
    SELECT p.solicitacao_id,
           bool_or(coalesce(sla_classificar(p.etapa, p.entrou, p.saiu, e.aviso_min, e.alerta_min, e.ativo) = 'fora', false))
             AS estourou
    FROM dash_passagens(v_ids) p
    LEFT JOIN sla_etapas e ON e.status = p.etapa
    WHERE p.saiu IS NOT NULL
    GROUP BY p.solicitacao_id
  ) x;

  RETURN jsonb_build_object(
    'entradas', v_ent,
    'finalizadas', v_fin,
    'canceladas', v_canc,
    'conclusao48_pct', CASE WHEN v_c48_den > 0 THEN round(v_c48_num::numeric / v_c48_den, 4) END,
    'conclusao48_n', v_c48_den,
    'cancelamento_pct', CASE WHEN v_ent > 0 THEN round(v_canc_coorte::numeric / v_ent, 4) END,
    'lead', (SELECT dash_percentis(array_agg(extract(epoch FROM (s.finalizada_em - s.created_at)) / 60))
             FROM solicitacoes s WHERE s.id = ANY (v_ids)),
    'dentro_sla_pct', v_dentro
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_resumo(
  p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
BEGIN
  PERFORM dash_exigir_interno();
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  RETURN jsonb_build_object(
    'atual', dash_bloco_resumo(l.ini, l.fim, p_origem, p_cliente_id, p_local),
    'anterior', dash_bloco_resumo(l.ini_ant, l.fim_ant, p_origem, p_cliente_id, p_local),
    'limites', jsonb_build_object('ini', l.ini, 'fim', l.fim, 'ini_ant', l.ini_ant, 'fim_ant', l.fim_ant)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_serie(
  p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL,
  p_granularidade text DEFAULT 'dia'
)
RETURNS TABLE (balde timestamptz, entradas int, finalizadas int, canceladas int, entradas_ant int, finalizadas_ant int)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
  v_passo interval;
  v_unid text;
  v_len interval := make_interval(days => p_ate - p_de + 1);
  v_inicio timestamp;
BEGIN
  PERFORM dash_exigir_interno();
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  IF p_granularidade = 'hora' THEN v_passo := interval '1 hour'; v_unid := 'hour';
  ELSIF p_granularidade = 'semana' THEN v_passo := interval '7 days'; v_unid := 'week';
  ELSIF p_granularidade = 'dia' THEN v_passo := interval '1 day'; v_unid := 'day';
  ELSE RAISE EXCEPTION 'Granularidade inválida: %', p_granularidade USING ERRCODE = '22023';
  END IF;
  IF v_unid = 'hour' AND p_ate - p_de > 6 THEN
    RAISE EXCEPTION 'Série por hora: no máximo 7 dias.' USING ERRCODE = '22023';
  END IF;
  v_inicio := date_trunc(v_unid, p_de::timestamp);

  -- Agrega uma vez por balde (nada de subconsulta por balde: 400 dias × 12 mil linhas).
  RETURN QUERY
  WITH baldes AS (
    SELECT g AS b FROM generate_series(v_inicio, p_ate::timestamp + interval '23 hours', v_passo) g
  ),
  s AS (
    SELECT x.id, x.status, x.created_at, x.finalizada_em
    FROM solicitacoes x
    WHERE dash_filtro(x.origem, x.cliente_id, x.local_carregamento, p_origem, p_cliente_id, p_local)
      AND ((x.created_at >= l.ini_ant AND x.created_at < l.fim)
        OR (x.finalizada_em >= l.ini_ant AND x.finalizada_em < l.fim))
  ),
  ent AS (
    SELECT date_trunc(v_unid, s.created_at AT TIME ZONE 'America/Campo_Grande') AS b, count(*)::int AS n
    FROM s WHERE s.created_at >= l.ini AND s.created_at < l.fim GROUP BY 1
  ),
  fin AS (
    SELECT date_trunc(v_unid, s.finalizada_em AT TIME ZONE 'America/Campo_Grande') AS b, count(*)::int AS n
    FROM s WHERE s.status = 'finalizada' AND s.finalizada_em >= l.ini AND s.finalizada_em < l.fim GROUP BY 1
  ),
  canc AS (
    SELECT date_trunc(v_unid, t.em AT TIME ZONE 'America/Campo_Grande') AS b, count(DISTINCT t.solicitacao_id)::int AS n
    FROM solicitacao_transicoes t
    JOIN solicitacoes x ON x.id = t.solicitacao_id
    WHERE t.para_status = 'cancelada' AND t.em >= l.ini AND t.em < l.fim
      AND dash_filtro(x.origem, x.cliente_id, x.local_carregamento, p_origem, p_cliente_id, p_local)
    GROUP BY 1
  ),
  ent_ant AS (
    SELECT date_trunc(v_unid, (s.created_at + v_len) AT TIME ZONE 'America/Campo_Grande') AS b, count(*)::int AS n
    FROM s WHERE s.created_at >= l.ini_ant AND s.created_at < l.fim_ant GROUP BY 1
  ),
  fin_ant AS (
    SELECT date_trunc(v_unid, (s.finalizada_em + v_len) AT TIME ZONE 'America/Campo_Grande') AS b, count(*)::int AS n
    FROM s WHERE s.status = 'finalizada' AND s.finalizada_em >= l.ini_ant AND s.finalizada_em < l.fim_ant GROUP BY 1
  )
  SELECT (bb.b AT TIME ZONE 'America/Campo_Grande'),
         coalesce(ent.n, 0), coalesce(fin.n, 0), coalesce(canc.n, 0),
         coalesce(ent_ant.n, 0), coalesce(fin_ant.n, 0)
  FROM baldes bb
  LEFT JOIN ent ON ent.b = bb.b
  LEFT JOIN fin ON fin.b = bb.b
  LEFT JOIN canc ON canc.b = bb.b
  LEFT JOIN ent_ant ON ent_ant.b = bb.b
  LEFT JOIN fin_ant ON fin_ant.b = bb.b
  ORDER BY bb.b;
END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_tempo_etapas(
  p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL
)
RETURNS TABLE (status text, n int, p50_min numeric, p90_min numeric, acima_alerta_pct numeric)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
  v_ids uuid[];
BEGIN
  PERFORM dash_exigir_interno();
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  -- Solicitações com alguma SAÍDA de etapa no período (todas as transições delas entram no lead()).
  SELECT array_agg(DISTINCT t.solicitacao_id) INTO v_ids
  FROM solicitacao_transicoes t JOIN solicitacoes s ON s.id = t.solicitacao_id
  WHERE t.em >= l.ini AND t.em < l.fim AND t.de_status IS NOT NULL
    AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local);

  RETURN QUERY
  WITH pas AS (
    SELECT p.etapa, extract(epoch FROM (p.saiu - p.entrou)) / 60 AS dur,
           sla_classificar(p.etapa, p.entrou, p.saiu, e.aviso_min, e.alerta_min, e.ativo) AS cls
    FROM dash_passagens(v_ids) p
    LEFT JOIN sla_etapas e ON e.status = p.etapa
    WHERE p.saiu >= l.ini AND p.saiu < l.fim
  )
  SELECT st.s, count(pas.dur)::int,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY pas.dur))::numeric, 1),
         round((percentile_cont(0.9) WITHIN GROUP (ORDER BY pas.dur))::numeric, 1),
         CASE WHEN count(pas.dur) = 0 OR bool_and(pas.cls IS NULL) THEN NULL
              ELSE round(avg((pas.cls = 'fora')::int)::numeric, 4) END
  FROM (VALUES ('recebida', 1), ('em_cadastro', 2), ('instrucao_emitida', 3), ('oc_gerada', 4), ('oc_enviada', 5)) st(s, o)
  LEFT JOIN pas ON pas.etapa = st.s
  GROUP BY st.s, st.o
  ORDER BY st.o;
END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_ranking(
  p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL,
  p_dimensao text DEFAULT 'cliente', p_limite int DEFAULT 50
)
RETURNS TABLE (chave text, rotulo text, entradas int, finalizadas int,
               lead_p50_min numeric, emissao_p50_min numeric, emissao_p90_min numeric)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
BEGIN
  PERFORM dash_exigir_interno();
  IF p_dimensao NOT IN ('cliente', 'material', 'local', 'motorista', 'veiculo', 'subcontratada', 'parceiro', 'origem') THEN
    RAISE EXCEPTION 'Dimensão inválida: %', p_dimensao USING ERRCODE = '22023';
  END IF;
  SELECT * INTO l FROM dash_limites(p_de, p_ate);

  RETURN QUERY
  WITH base AS (
    SELECT s.id, s.status, s.created_at, s.finalizada_em,
      CASE p_dimensao
        WHEN 'cliente' THEN s.cliente_id::text
        WHEN 'material' THEN s.material_id::text
        WHEN 'local' THEN coalesce(nullif(btrim(s.local_carregamento), ''), 'Sem local')
        WHEN 'motorista' THEN coalesce(s.motorista_id, s.parceiro_motorista_id)::text
        WHEN 'veiculo' THEN coalesce(s.veiculo_id, s.parceiro_veiculo_id)::text
        WHEN 'subcontratada' THEN coalesce(s.subcontratada_id, s.parceiro_subcontratada_id)::text
        WHEN 'parceiro' THEN s.parceiro_id::text
        WHEN 'origem' THEN CASE WHEN s.origem = 'parceiro' THEN 'parceiro' ELSE 'interno' END
      END AS k,
      CASE p_dimensao
        WHEN 'cliente' THEN (SELECT c.razao_social FROM clientes c WHERE c.id = s.cliente_id)
        WHEN 'material' THEN (SELECT m.nome FROM materiais m WHERE m.id = s.material_id)
        WHEN 'local' THEN coalesce(nullif(btrim(s.local_carregamento), ''), 'Sem local')
        WHEN 'motorista' THEN coalesce((SELECT m.nome_completo FROM motoristas m WHERE m.id = s.motorista_id),
                                       (SELECT m.nome_completo FROM parceiro_motoristas m WHERE m.id = s.parceiro_motorista_id))
        WHEN 'veiculo' THEN coalesce((SELECT v.placa FROM veiculos v WHERE v.id = s.veiculo_id),
                                     (SELECT v.placa FROM parceiro_veiculos v WHERE v.id = s.parceiro_veiculo_id))
        WHEN 'subcontratada' THEN coalesce((SELECT x.razao_social FROM subcontratadas x WHERE x.id = s.subcontratada_id),
                                           (SELECT x.razao_social FROM parceiro_subcontratadas x WHERE x.id = s.parceiro_subcontratada_id))
        WHEN 'parceiro' THEN (SELECT p.razao_social FROM parceiros p WHERE p.id = s.parceiro_id)
        WHEN 'origem' THEN CASE WHEN s.origem = 'parceiro' THEN 'Parceiros' ELSE 'Interno' END
      END AS r,
      (s.created_at >= l.ini AND s.created_at < l.fim) AS entrou,
      (s.status = 'finalizada' AND s.finalizada_em >= l.ini AND s.finalizada_em < l.fim) AS finalizou
    FROM solicitacoes s
    WHERE dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)
      AND ((s.created_at >= l.ini AND s.created_at < l.fim) OR (s.finalizada_em >= l.ini AND s.finalizada_em < l.fim))
      AND (p_dimensao <> 'parceiro' OR s.origem = 'parceiro')
  ),
  emissao AS (
    SELECT b.id, extract(epoch FROM (b.finalizada_em - min(t.em))) / 60 AS min_emissao
    FROM base b JOIN solicitacao_transicoes t ON t.solicitacao_id = b.id AND t.para_status = 'em_cadastro'
    WHERE b.finalizou
    GROUP BY b.id, b.finalizada_em
  )
  SELECT coalesce(b.k, 'sem'), coalesce(max(b.r), 'Não informado'),
         count(*) FILTER (WHERE b.entrou)::int,
         count(*) FILTER (WHERE b.finalizou)::int,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (b.finalizada_em - b.created_at)) / 60)
                FILTER (WHERE b.finalizou))::numeric, 1),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY e.min_emissao))::numeric, 1),
         round((percentile_cont(0.9) WITHIN GROUP (ORDER BY e.min_emissao))::numeric, 1)
  FROM base b LEFT JOIN emissao e ON e.id = b.id
  GROUP BY coalesce(b.k, 'sem')
  ORDER BY count(*) FILTER (WHERE b.entrou) DESC, count(*) FILTER (WHERE b.finalizou) DESC
  LIMIT greatest(1, least(coalesce(p_limite, 50), 500));
END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_locais(p_de date, p_ate date)
RETURNS TABLE (local text, qtd int)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
BEGIN
  PERFORM dash_exigir_interno();
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  RETURN QUERY
  SELECT coalesce(nullif(btrim(s.local_carregamento), ''), 'Sem local'), count(*)::int
  FROM solicitacoes s
  WHERE s.created_at >= l.ini AND s.created_at < l.fim
  GROUP BY 1 ORDER BY 2 DESC, 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_mapa_calor(
  p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL
)
RETURNS TABLE (dow int, hora int, entradas int)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
BEGIN
  PERFORM dash_exigir_interno();
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  RETURN QUERY
  SELECT extract(dow FROM s.created_at AT TIME ZONE 'America/Campo_Grande')::int,
         extract(hour FROM s.created_at AT TIME ZONE 'America/Campo_Grande')::int,
         count(*)::int
  FROM solicitacoes s
  WHERE s.created_at >= l.ini AND s.created_at < l.fim
    AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)
  GROUP BY 1, 2 ORDER BY 1, 2;
END;
$$;

-- Ids por trás de um indicador (drill-down), no máximo 1000, mais antiga primeiro.
CREATE OR REPLACE FUNCTION public.ids_para_drill(
  p_tipo text, p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
  v_ids uuid[];
BEGIN
  PERFORM dash_exigir_interno();
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  IF p_tipo = 'conclusao48' THEN
    RETURN QUERY
    SELECT s.id FROM solicitacoes s
    WHERE s.created_at >= l.ini AND s.created_at < least(l.fim, now() - interval '48 hours')
      AND s.status = 'finalizada' AND s.finalizada_em - s.created_at <= interval '48 hours'
      AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)
    ORDER BY s.created_at LIMIT 1000;
  ELSIF p_tipo = 'cancelada' THEN
    RETURN QUERY
    SELECT s.id FROM solicitacoes s
    WHERE EXISTS (SELECT 1 FROM solicitacao_transicoes t WHERE t.solicitacao_id = s.id
                   AND t.para_status = 'cancelada' AND t.em >= l.ini AND t.em < l.fim)
      AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)
    ORDER BY s.created_at LIMIT 1000;
  ELSIF p_tipo = 'sla_estourou' THEN
    SELECT array_agg(s.id) INTO v_ids FROM solicitacoes s
    WHERE s.status = 'finalizada' AND s.finalizada_em >= l.ini AND s.finalizada_em < l.fim
      AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local);
    RETURN QUERY
    SELECT p.solicitacao_id FROM dash_passagens(v_ids) p
    JOIN sla_etapas e ON e.status = p.etapa
    JOIN solicitacoes s ON s.id = p.solicitacao_id
    WHERE p.saiu IS NOT NULL
      AND sla_classificar(p.etapa, p.entrou, p.saiu, e.aviso_min, e.alerta_min, e.ativo) = 'fora'
    GROUP BY p.solicitacao_id, s.created_at
    ORDER BY s.created_at LIMIT 1000;
  ELSE
    RAISE EXCEPTION 'Tipo de drill inválido: %', p_tipo USING ERRCODE = '22023';
  END IF;
END;
$$;

-- As solicitações por trás de um drill-down, como linhas da própria tabela: a
-- lista chama via PostgREST com select/embed/count/range/order normais (nada de
-- mandar 1000 ids na URL). INVOKER: a RLS de solicitacoes vale.
CREATE OR REPLACE FUNCTION public.solicitacoes_drill(
  p_tipo text, p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL
)
RETURNS SETOF public.solicitacoes
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.* FROM solicitacoes s
  WHERE s.id IN (SELECT ids_para_drill(p_tipo, p_de, p_ate, p_origem, p_cliente_id, p_local));
$$;

-- Linhas "tidy" para o CSV de dados (uma por solicitação criada no período).
CREATE OR REPLACE FUNCTION public.exportar_solicitacoes_periodo(
  p_de date, p_ate date,
  p_origem text DEFAULT 'todas', p_cliente_id uuid DEFAULT NULL, p_local text DEFAULT NULL,
  p_offset int DEFAULT 0, p_limite int DEFAULT 1000
)
RETURNS TABLE (numero_interno int, origem text, parceiro text, cliente text, material text, local text,
               status text, criada_em timestamptz, finalizada_em timestamptz, lead_min numeric,
               min_recebida numeric, min_em_cadastro numeric, min_instrucao_emitida numeric,
               min_oc_gerada numeric, min_oc_enviada numeric)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
  v_ids uuid[];
BEGIN
  PERFORM dash_exigir_interno();
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  SELECT array_agg(x.id ORDER BY x.created_at, x.numero_interno) INTO v_ids FROM (
    SELECT s.id, s.created_at, s.numero_interno FROM solicitacoes s
    WHERE s.created_at >= l.ini AND s.created_at < l.fim
      AND dash_filtro(s.origem, s.cliente_id, s.local_carregamento, p_origem, p_cliente_id, p_local)
    ORDER BY s.created_at, s.numero_interno
    OFFSET greatest(coalesce(p_offset, 0), 0)
    LIMIT greatest(1, least(coalesce(p_limite, 1000), 1000))
  ) x;

  -- Minutos por etapa: um GROUP BY por solicitação (pivot), não uma subconsulta por célula.
  RETURN QUERY
  WITH pas AS (
    SELECT p.solicitacao_id,
           sum(d) FILTER (WHERE p.etapa = 'recebida') AS m_rec,
           sum(d) FILTER (WHERE p.etapa = 'em_cadastro') AS m_cad,
           sum(d) FILTER (WHERE p.etapa = 'instrucao_emitida') AS m_ins,
           sum(d) FILTER (WHERE p.etapa = 'oc_gerada') AS m_ger,
           sum(d) FILTER (WHERE p.etapa = 'oc_enviada') AS m_env
    FROM dash_passagens(v_ids) p,
         LATERAL (SELECT extract(epoch FROM (coalesce(p.saiu, now()) - p.entrou)) / 60 AS d) dd
    GROUP BY p.solicitacao_id
  )
  SELECT s.numero_interno::int, s.origem, pa.razao_social, c.razao_social, m.nome,
         nullif(btrim(s.local_carregamento), ''),
         s.status, s.created_at, s.finalizada_em,
         CASE WHEN s.status = 'finalizada' THEN round((extract(epoch FROM (s.finalizada_em - s.created_at)) / 60)::numeric, 1) END,
         round(pas.m_rec::numeric, 1), round(pas.m_cad::numeric, 1), round(pas.m_ins::numeric, 1),
         round(pas.m_ger::numeric, 1), round(pas.m_env::numeric, 1)
  FROM unnest(v_ids) WITH ORDINALITY u(id, ord)
  JOIN solicitacoes s ON s.id = u.id
  LEFT JOIN pas ON pas.solicitacao_id = s.id
  LEFT JOIN parceiros pa ON pa.id = s.parceiro_id
  LEFT JOIN clientes c ON c.id = s.cliente_id
  LEFT JOIN materiais m ON m.id = s.material_id
  ORDER BY u.ord;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Produtividade da equipe (SECURITY DEFINER: lê usuario_id das transições; só gestão)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.relatorio_produtividade(p_de date, p_ate date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
  v_agente uuid;
  v_out jsonb;
BEGIN
  IF coalesce(meu_perfil_interno(), '') NOT IN ('admin', 'gerente', 'supervisor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO l FROM dash_limites(p_de, p_ate);
  -- agente_config vem da 0078 e usuario_id da 0079: só lê se os dois existirem.
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = to_regclass('public.agente_config')
                AND attname = 'usuario_id' AND NOT attisdropped) THEN
    EXECUTE 'SELECT usuario_id FROM public.agente_config WHERE id = 1' INTO v_agente;
  END IF;

  WITH tr AS (
    SELECT t.* FROM solicitacao_transicoes t WHERE t.em >= l.ini AND t.em < l.fim AND t.usuario_id IS NOT NULL
  ),
  -- responsável atual: quem fez a ÚLTIMA entrada em "Em emissão" das abertas
  resp AS (
    SELECT DISTINCT ON (t.solicitacao_id) t.solicitacao_id, t.usuario_id
    FROM solicitacao_transicoes t
    JOIN solicitacoes s ON s.id = t.solicitacao_id
    WHERE t.para_status = 'em_cadastro'
      AND s.status IN ('em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada')
    ORDER BY t.solicitacao_id, t.em DESC, t.id DESC
  ),
  conclusao AS (
    SELECT f.usuario_id,
           extract(epoch FROM (f.em - (SELECT min(t2.em) FROM solicitacao_transicoes t2
                                        WHERE t2.solicitacao_id = f.solicitacao_id AND t2.para_status = 'em_cadastro'
                                          AND t2.em <= f.em))) / 60 AS m
    FROM tr f WHERE f.para_status = 'finalizada'
  ),
  por_usuario AS (
    SELECT p.user_id AS usuario_id, p.nome_completo AS nome, p.perfil, p.ativo,
      (SELECT count(DISTINCT solicitacao_id) FROM tr WHERE tr.usuario_id = p.user_id AND tr.de_status IS NULL) AS criou,
      (SELECT count(DISTINCT solicitacao_id) FROM tr WHERE tr.usuario_id = p.user_id AND tr.para_status = 'em_cadastro') AS em_emissao,
      (SELECT count(DISTINCT solicitacao_id) FROM tr WHERE tr.usuario_id = p.user_id AND tr.para_status = 'oc_gerada') AS gerou_oc,
      (SELECT count(DISTINCT solicitacao_id) FROM tr WHERE tr.usuario_id = p.user_id AND tr.para_status = 'oc_enviada') AS enviou_oc,
      (SELECT count(DISTINCT solicitacao_id) FROM tr WHERE tr.usuario_id = p.user_id AND tr.para_status = 'finalizada') AS finalizou,
      (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY c.m))::numeric, 1)
         FROM conclusao c WHERE c.usuario_id = p.user_id AND c.m IS NOT NULL) AS conclusao_p50_min,
      (SELECT count(*) FROM resp r WHERE r.usuario_id = p.user_id) AS em_aberto,
      (SELECT round(max(extract(epoch FROM (now() - s.status_desde)) / 60))
         FROM resp r JOIN solicitacoes s ON s.id = r.solicitacao_id WHERE r.usuario_id = p.user_id) AS parada_mais_longa_min
    FROM perfis_usuarios p
    WHERE p.perfil <> 'painel_tv'
  ),
  ativos AS (
    SELECT * FROM por_usuario
    WHERE ativo OR criou + em_emissao + gerou_oc + enviou_oc + finalizou + em_aberto > 0
  )
  SELECT jsonb_build_object(
    'usuarios', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.finalizou DESC, a.nome)
                          FROM ativos a WHERE a.usuario_id IS DISTINCT FROM v_agente), '[]'::jsonb),
    'agente', (SELECT to_jsonb(a) FROM ativos a WHERE a.usuario_id = v_agente),
    'abertas_paradas', coalesce((
      SELECT jsonb_agg(x ORDER BY (x ->> 'min_na_etapa')::numeric DESC) FROM (
        SELECT jsonb_build_object(
          'id', s.id, 'numero_interno', s.numero_interno, 'status', s.status,
          'parceiro', (SELECT pa.razao_social FROM parceiros pa WHERE pa.id = s.parceiro_id),
          'responsavel', coalesce((SELECT pu.nome_completo FROM resp r JOIN perfis_usuarios pu ON pu.user_id = r.usuario_id
                                    WHERE r.solicitacao_id = s.id), '—'),
          'min_na_etapa', round(extract(epoch FROM (now() - s.status_desde)) / 60)) AS x
        FROM solicitacoes s
        WHERE s.origem = 'parceiro' AND s.status IN ('em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada')
        ORDER BY s.status_desde
        LIMIT 20) q), '[]'::jsonb),
    'totais', jsonb_build_object(
      'entradas', (SELECT count(*) FROM solicitacoes s WHERE s.created_at >= l.ini AND s.created_at < l.fim),
      'de_parceiro', (SELECT count(*) FROM solicitacoes s WHERE s.created_at >= l.ini AND s.created_at < l.fim AND s.origem = 'parceiro'),
      'finalizadas', (SELECT count(*) FROM solicitacoes s WHERE s.status = 'finalizada' AND s.finalizada_em >= l.ini AND s.finalizada_em < l.fim),
      'abertas', (SELECT count(*) FROM solicitacoes s WHERE s.status IN ('recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada')),
      'recebidas_sem_responsavel', (SELECT count(*) FROM solicitacoes s WHERE s.status = 'recebida' AND s.atendente_id IS NULL))
  ) INTO v_out;
  RETURN v_out;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Metas e SLA: salvar tudo numa transação (só admin; a RLS também exige)
-- ─────────────────────────────────────────────────────────────────────────────

-- p: { "etapas": [{status, aviso_min, alerta_min, ativo}], "metas": {meta_finalizadas_dia,
--      meta_lead_time_p90_min, alerta_validade_h, expediente_inicio, expediente_fim} }
CREATE OR REPLACE FUNCTION public.salvar_metas_sla(p jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  e jsonb;
  v_n int;
BEGIN
  IF coalesce(meu_perfil_interno(), '') <> 'admin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'etapas', '[]'::jsonb)) LOOP
    UPDATE sla_etapas SET
      aviso_min  = (e ->> 'aviso_min')::int,
      alerta_min = (e ->> 'alerta_min')::int,
      ativo      = coalesce((e ->> 'ativo')::boolean, ativo)
    WHERE status = e ->> 'status';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Etapa inválida: %', e ->> 'status' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p ? 'metas' THEN
    UPDATE metas_operacao SET
      -- chave presente com null = "sem meta"; chave ausente = não mexe
      meta_finalizadas_dia   = CASE WHEN p -> 'metas' ? 'meta_finalizadas_dia'
                                    THEN (p -> 'metas' ->> 'meta_finalizadas_dia')::int ELSE meta_finalizadas_dia END,
      meta_lead_time_p90_min = CASE WHEN p -> 'metas' ? 'meta_lead_time_p90_min'
                                    THEN (p -> 'metas' ->> 'meta_lead_time_p90_min')::int ELSE meta_lead_time_p90_min END,
      alerta_validade_h      = coalesce((p -> 'metas' ->> 'alerta_validade_h')::int, alerta_validade_h),
      expediente_inicio      = coalesce((p -> 'metas' ->> 'expediente_inicio')::time, expediente_inicio),
      expediente_fim         = coalesce((p -> 'metas' ->> 'expediente_fim')::time, expediente_fim)
    WHERE singleton;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Privilégios: nada para anon; authenticated executa (cada função checa o perfil)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.dash_filtro(text, uuid, text, text, uuid, text)',
    'public.dash_percentis(double precision[])',
    'public.dash_limites(date, date)',
    'public.dash_exigir_interno()',
    'public.dash_passagens(uuid[])',
    'public.dash_bloco_resumo(timestamptz, timestamptz, text, uuid, text)',
    'public.painel_estado_atual(text, uuid, text)',
    'public.painel_hoje(text, uuid, text)',
    'public.relatorio_resumo(date, date, text, uuid, text)',
    'public.relatorio_serie(date, date, text, uuid, text, text)',
    'public.relatorio_tempo_etapas(date, date, text, uuid, text)',
    'public.relatorio_ranking(date, date, text, uuid, text, text, int)',
    'public.relatorio_locais(date, date)',
    'public.relatorio_mapa_calor(date, date, text, uuid, text)',
    'public.ids_para_drill(text, date, date, text, uuid, text)',
    'public.solicitacoes_drill(text, date, date, text, uuid, text)',
    'public.exportar_solicitacoes_periodo(date, date, text, uuid, text, int, int)',
    'public.relatorio_produtividade(date, date)',
    'public.salvar_metas_sla(jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
