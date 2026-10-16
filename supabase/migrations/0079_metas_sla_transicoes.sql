-- 0079 — Dashboards operacionais: metas e SLA por etapa, histórico de etapas,
-- carimbos no servidor e o perfil "Painel TV".
--
-- Plano: .omc/plans/dashboards-operacionais.md (v2), §2.2–§2.4. Decisões do Davi
-- (2026-10-16): SLA POR ETAPA em horas corridas (aviso 2 h / alerta 8 h; OC
-- enviada fora), metas configuráveis pelo admin, TV com conta dedicada, fuso da
-- operação em Mato Grosso do Sul (America/Campo_Grande).
--
-- O que muda:
--   1. Perfil `painel_tv`: só lê o Painel. `is_interno()` passa a NEGÁ-LO, então
--      as policies que liberam dados por is_interno() não valem para a TV.
--   2. `sla_etapas` e `metas_operacao` (config, auditadas; só admin altera).
--   3. `solicitacoes.status_desde` + `solicitacao_transicoes` (histórico de
--      etapas), reconstruídos do log_auditoria e mantidos por trigger.
--   4. `status_desde` e `finalizada_em` passam a ser carimbados NO SERVIDOR
--      (antes `finalizada_em` vinha do relógio do navegador e podia ser forjado).
--   5. `sla_classificar()`: a regra de SLA numa função pura, espelhada no front
--      (apps/interno/src/features/metricas/sla.ts) com os mesmos vetores.
--   6. Hook de inatividade (0077): renovação sempre liberada para o painel_tv.
--   7. Fuso: limite diário do portal e data mínima de agendamento passam de
--      America/Sao_Paulo para America/Campo_Grande.
--   8. `agente_config.usuario_id` (se a 0078 existir): qual login é o agente de
--      WhatsApp, para a linha separada da Produtividade.
--
-- Idempotente: pode rodar de novo sem duplicar nada (memória "migrations-idempotentes").
-- ATENÇÃO na hora de aplicar: o backfill de status_desde faz UM UPDATE em todas
-- as solicitações (triggers de auditoria e updated_at desligados durante ele).
-- Isso gera eventos de Realtime para quem estiver com o sistema aberto —
-- aplicar fora do expediente.

-- Sem fila de espera infinita por lock em solicitacoes (o backfill e os índices
-- pedem lock forte): se a tabela estiver ocupada, falha rápido e se tenta de novo.
SET lock_timeout = '5s';

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE A — estrutura e policies (no cumulative-schema: ANTES da seção 0051)
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Perfil painel_tv
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.perfis_usuarios DROP CONSTRAINT IF EXISTS perfis_usuarios_perfil_check;
ALTER TABLE public.perfis_usuarios ADD CONSTRAINT perfis_usuarios_perfil_check
  CHECK (perfil IN ('admin', 'gerente', 'supervisor', 'analista', 'assistente', 'painel_tv'));

-- is_interno(): qualquer perfil ativo, MENOS o da TV. As ~10 policies que
-- liberam dados pessoais por is_interno() passam a negar para a TV sem precisar
-- tocar em nenhuma delas.
CREATE OR REPLACE FUNCTION public.is_interno()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE user_id = auth.uid() AND ativo = true AND perfil <> 'painel_tv'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_painel_tv()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE user_id = auth.uid() AND ativo = true AND perfil = 'painel_tv'
  );
$$;
REVOKE ALL ON FUNCTION public.is_painel_tv() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_painel_tv() TO authenticated;

-- Para o hook de inatividade, que roda como supabase_auth_admin (sem auth.uid()).
CREATE OR REPLACE FUNCTION public.usuario_e_painel_tv(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE user_id = p_user AND ativo = true AND perfil = 'painel_tv'
  );
$$;
REVOKE ALL ON FUNCTION public.usuario_e_painel_tv(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_e_painel_tv(uuid) TO supabase_auth_admin;

-- Cada usuário lê o PRÓPRIO perfil. A TV não é is_interno() e sem isto o app
-- não sabe que ela é a TV (ficaria em "Aguardando liberação"). Só a própria linha.
DROP POLICY IF EXISTS perfis_usuarios_select_proprio ON public.perfis_usuarios;
CREATE POLICY perfis_usuarios_select_proprio ON public.perfis_usuarios FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- log_auditoria: ninguém insere direto pela API. Quem grava é o audit_trigger
-- (SECURITY DEFINER desde a 0049); a policy WITH CHECK (true) da 0025 deixava
-- qualquer autenticado — parceiro inclusive — forjar linhas, e o backfill
-- abaixo transforma esse log em histórico de etapas. Fechar ANTES do backfill.
DROP POLICY IF EXISTS log_auditoria_insert ON public.log_auditoria;
REVOKE INSERT ON public.log_auditoria FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Configuração: SLA por etapa e metas da operação
-- ─────────────────────────────────────────────────────────────────────────────

-- `id uuid` em ambas: o audit_trigger grava registro_id = NEW.id numa coluna uuid.
CREATE TABLE IF NOT EXISTS public.sla_etapas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status         text NOT NULL UNIQUE
                 CHECK (status IN ('recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada')),
  aviso_min      integer NOT NULL CHECK (aviso_min > 0),
  alerta_min     integer NOT NULL,
  ativo          boolean NOT NULL DEFAULT true,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT sla_etapas_alerta_maior CHECK (alerta_min > aviso_min)
);
COMMENT ON TABLE public.sla_etapas IS
  'Limites de SLA por etapa (0079), em minutos de horas corridas. aviso = começa a pedir atenção; '
  'alerta = fora do SLA. OC enviada fica com ativo=false (decisão D1).';

INSERT INTO public.sla_etapas (status, aviso_min, alerta_min, ativo) VALUES
  ('recebida', 120, 480, true),
  ('em_cadastro', 120, 480, true),
  ('instrucao_emitida', 120, 480, true),
  ('oc_gerada', 120, 480, true),
  ('oc_enviada', 120, 480, false)
ON CONFLICT (status) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.metas_operacao (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton              boolean NOT NULL UNIQUE DEFAULT true CHECK (singleton),
  meta_finalizadas_dia   integer CHECK (meta_finalizadas_dia >= 0),
  meta_lead_time_p90_min integer CHECK (meta_lead_time_p90_min > 0),
  alerta_validade_h      integer NOT NULL DEFAULT 24 CHECK (alerta_validade_h BETWEEN 1 AND 168),
  expediente_inicio      time NOT NULL DEFAULT '07:00',
  expediente_fim         time NOT NULL DEFAULT '18:00',
  atualizado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_por         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT metas_operacao_expediente CHECK (expediente_fim > expediente_inicio)
);
COMMENT ON TABLE public.metas_operacao IS
  'Metas da operação (0079), linha única. meta_finalizadas_dia NULL = sem meta (D3): '
  'Painel e TV mostram só o realizado.';

INSERT INTO public.metas_operacao (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- Carimbo de quem alterou (o front não precisa mandar).
CREATE OR REPLACE FUNCTION public.carimbar_config_metas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.atualizado_em := now();
  BEGIN
    NEW.atualizado_por := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    NEW.atualizado_por := NULL;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.carimbar_config_metas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sla_etapas_carimbo ON public.sla_etapas;
CREATE TRIGGER trg_sla_etapas_carimbo BEFORE UPDATE ON public.sla_etapas
  FOR EACH ROW EXECUTE FUNCTION public.carimbar_config_metas();
DROP TRIGGER IF EXISTS trg_metas_operacao_carimbo ON public.metas_operacao;
CREATE TRIGGER trg_metas_operacao_carimbo BEFORE UPDATE ON public.metas_operacao
  FOR EACH ROW EXECUTE FUNCTION public.carimbar_config_metas();

DROP TRIGGER IF EXISTS aud_sla_etapas ON public.sla_etapas;
CREATE TRIGGER aud_sla_etapas AFTER INSERT OR UPDATE OR DELETE ON public.sla_etapas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
DROP TRIGGER IF EXISTS aud_metas_operacao ON public.metas_operacao;
CREATE TRIGGER aud_metas_operacao AFTER INSERT OR UPDATE OR DELETE ON public.metas_operacao
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

ALTER TABLE public.sla_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_operacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sla_etapas, public.metas_operacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sla_etapas, public.metas_operacao TO authenticated;
-- Só as colunas de valor: etapa, id e carimbos não se editam pela API.
GRANT UPDATE (aviso_min, alerta_min, ativo) ON public.sla_etapas TO authenticated;
GRANT UPDATE (meta_finalizadas_dia, meta_lead_time_p90_min, alerta_validade_h, expediente_inicio, expediente_fim)
  ON public.metas_operacao TO authenticated;

-- Leitura: equipe interna e a TV (sem dado pessoal). Escrita: só admin. Sem
-- INSERT/DELETE — as linhas são fixas (seed acima).
DROP POLICY IF EXISTS sla_etapas_select ON public.sla_etapas;
CREATE POLICY sla_etapas_select ON public.sla_etapas FOR SELECT TO authenticated
  USING ((SELECT public.is_interno()) OR (SELECT public.is_painel_tv()));
DROP POLICY IF EXISTS sla_etapas_update ON public.sla_etapas;
CREATE POLICY sla_etapas_update ON public.sla_etapas FOR UPDATE TO authenticated
  USING ((SELECT public.meu_perfil_interno()) = 'admin')
  WITH CHECK ((SELECT public.meu_perfil_interno()) = 'admin');

DROP POLICY IF EXISTS metas_operacao_select ON public.metas_operacao;
CREATE POLICY metas_operacao_select ON public.metas_operacao FOR SELECT TO authenticated
  USING ((SELECT public.is_interno()) OR (SELECT public.is_painel_tv()));
DROP POLICY IF EXISTS metas_operacao_update ON public.metas_operacao;
CREATE POLICY metas_operacao_update ON public.metas_operacao FOR UPDATE TO authenticated
  USING ((SELECT public.meu_perfil_interno()) = 'admin')
  WITH CHECK ((SELECT public.meu_perfil_interno()) = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Função pura do SLA (espelhada em apps/interno/src/features/metricas/sla.ts)
-- ─────────────────────────────────────────────────────────────────────────────

-- null = etapa sem SLA (inativa ou fora da fila); 'ok' | 'aviso' | 'fora'.
-- Minutos na etapa < aviso → 'ok'; aviso ≤ minutos ≤ alerta → 'aviso';
-- minutos > alerta → 'fora' (mesma regra e vetores de sla.ts).
CREATE OR REPLACE FUNCTION public.sla_classificar(
  p_status text, p_desde timestamptz, p_agora timestamptz,
  p_aviso integer, p_alerta integer, p_ativo boolean
)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_ativo IS NOT TRUE OR p_desde IS NULL OR p_agora IS NULL
      OR p_aviso IS NULL OR p_alerta IS NULL
      OR p_status NOT IN ('recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada')
      THEN NULL
    WHEN extract(epoch FROM (p_agora - p_desde)) / 60 > p_alerta THEN 'fora'
    WHEN extract(epoch FROM (p_agora - p_desde)) / 60 >= p_aviso THEN 'aviso'
    ELSE 'ok'
  END;
$$;
REVOKE ALL ON FUNCTION public.sla_classificar(text, timestamptz, timestamptz, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sla_classificar(text, timestamptz, timestamptz, integer, integer, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Histórico de etapas e status_desde
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS status_desde timestamptz;
COMMENT ON COLUMN public.solicitacoes.status_desde IS
  'Quando a solicitação entrou na etapa atual (0079). Carimbado pelo servidor; '
  'base do SLA por etapa.';

CREATE TABLE IF NOT EXISTS public.solicitacao_transicoes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  de_status      text,
  para_status    text NOT NULL,
  em             timestamptz NOT NULL,
  usuario_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fonte          text NOT NULL DEFAULT 'trigger' CHECK (fonte IN ('trigger', 'backfill'))
);
COMMENT ON TABLE public.solicitacao_transicoes IS
  'Cada mudança de etapa de uma solicitação (0079). Antes da 0079: reconstruído do '
  'log_auditoria (fonte=backfill). usuario_id só é legível por funções SECURITY '
  'DEFINER (Produtividade, só gestão) — privilégio de coluna.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacao_transicao
  ON public.solicitacao_transicoes (solicitacao_id, em, para_status);
CREATE INDEX IF NOT EXISTS idx_transicoes_para_em ON public.solicitacao_transicoes (para_status, em);
CREATE INDEX IF NOT EXISTS idx_transicoes_em ON public.solicitacao_transicoes (em);
CREATE INDEX IF NOT EXISTS idx_transicoes_usuario_em ON public.solicitacao_transicoes (usuario_id, em)
  WHERE usuario_id IS NOT NULL;

ALTER TABLE public.solicitacao_transicoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitacao_transicoes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, solicitacao_id, de_status, para_status, em, fonte)
  ON public.solicitacao_transicoes TO authenticated;
DROP POLICY IF EXISTS solicitacao_transicoes_select ON public.solicitacao_transicoes;
CREATE POLICY solicitacao_transicoes_select ON public.solicitacao_transicoes FOR SELECT TO authenticated
  USING ((SELECT public.is_interno()));

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE B — dados, triggers e funções que sobrescrevem as antigas
-- (no cumulative-schema: no FIM, para vencer as versões antigas recriadas lá)
-- ═════════════════════════════════════════════════════════════════════════════

-- Qual login é o agente de WhatsApp (0078). Só existe se a 0078 já rodou.
DO $$
BEGIN
  IF to_regclass('public.agente_config') IS NOT NULL THEN
    ALTER TABLE public.agente_config
      ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN public.agente_config.usuario_id IS
      'Login (auth.users) que o agente usa (0079). A Produtividade mostra esse usuário '
      'numa linha separada, fora dos totais da equipe. Preencher uma vez (admin).';
  END IF;
END $$;

-- 4a. Backfill das transições a partir do log (antes dos triggers novos).
--     Recorte: só o log anterior à primeira transição gravada por trigger, para
--     uma reexecução não duplicar o que o trigger já escreveu.
WITH corte AS (
  SELECT coalesce(min(em), 'infinity'::timestamptz) AS t
  FROM public.solicitacao_transicoes WHERE fonte = 'trigger'
),
criacao AS (
  SELECT DISTINCT ON (s.id)
         s.id AS solicitacao_id,
         -- Sem NENHUM log (anonimizadas pela 0057, escritas com replica): a única
         -- transição é a criação já no status atual (lacuna declarada no plano).
         coalesce(l.dados_depois ->> 'status',
                  CASE WHEN NOT EXISTS (SELECT 1 FROM public.log_auditoria x
                                         WHERE x.tabela = 'solicitacoes' AND x.registro_id = s.id)
                       THEN s.status END,
                  'recebida') AS para_status,
         s.created_at AS em,
         coalesce(l.usuario_id, s.created_by) AS usuario_id
  FROM public.solicitacoes s
  LEFT JOIN public.log_auditoria l
    ON l.tabela = 'solicitacoes' AND l.acao = 'INSERT' AND l.registro_id = s.id
  ORDER BY s.id, l.created_at
)
INSERT INTO public.solicitacao_transicoes (solicitacao_id, de_status, para_status, em, usuario_id, fonte)
SELECT c.solicitacao_id, NULL, c.para_status, c.em,
       CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.usuario_id) THEN c.usuario_id END,
       'backfill'
FROM criacao c, corte
WHERE c.em < corte.t
ON CONFLICT (solicitacao_id, em, para_status) DO NOTHING;

WITH corte AS (
  SELECT coalesce(min(em), 'infinity'::timestamptz) AS t
  FROM public.solicitacao_transicoes WHERE fonte = 'trigger'
)
INSERT INTO public.solicitacao_transicoes (solicitacao_id, de_status, para_status, em, usuario_id, fonte)
SELECT l.registro_id, l.dados_antes ->> 'status', l.dados_depois ->> 'status', l.created_at,
       CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.usuario_id) THEN l.usuario_id END,
       'backfill'
FROM public.log_auditoria l
JOIN public.solicitacoes s ON s.id = l.registro_id
CROSS JOIN corte
WHERE l.tabela = 'solicitacoes'
  AND l.acao = 'UPDATE'
  AND l.dados_depois ? 'status'
  AND (l.dados_antes ->> 'status') IS DISTINCT FROM (l.dados_depois ->> 'status')
  AND l.created_at < corte.t
ON CONFLICT (solicitacao_id, em, para_status) DO NOTHING;

-- 4b. Backfill de status_desde: a última entrada no status atual; na falta,
--     updated_at; na falta, created_at. Sem mexer em updated_at nem gerar log.
ALTER TABLE public.solicitacoes DISABLE TRIGGER trg_solicitacoes_updated;
ALTER TABLE public.solicitacoes DISABLE TRIGGER aud_solicitacoes;

UPDATE public.solicitacoes s
SET status_desde = coalesce(
  (SELECT max(t.em) FROM public.solicitacao_transicoes t
    WHERE t.solicitacao_id = s.id AND t.para_status = s.status),
  s.updated_at, s.created_at)
WHERE s.status_desde IS NULL;

ALTER TABLE public.solicitacoes ENABLE TRIGGER trg_solicitacoes_updated;
ALTER TABLE public.solicitacoes ENABLE TRIGGER aud_solicitacoes;

ALTER TABLE public.solicitacoes ALTER COLUMN status_desde SET DEFAULT now();
ALTER TABLE public.solicitacoes ALTER COLUMN status_desde SET NOT NULL;

-- 4c. Carimbos no servidor. BEFORE INSERT OR UPDATE sem `OF status`: o valor que
--     o cliente mandar para status_desde/finalizada_em é sempre ignorado.
--     O nome "zz" faz este trigger rodar DEPOIS dos outros BEFORE INSERT
--     (sanitizador do parceiro, rate limit), que podem reescrever o status.
CREATE OR REPLACE FUNCTION public.solicitacao_carimbos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_desde := now();
    NEW.finalizada_em := CASE WHEN NEW.status = 'finalizada' THEN now() END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_desde := now();
    NEW.finalizada_em := CASE WHEN NEW.status = 'finalizada' THEN now() END;
    -- Entrou em "OC enviada": o servidor carimba (reenvio sem mudar de etapa
    -- continua podendo atualizar enviada_em, como hoje).
    IF NEW.status = 'oc_enviada' THEN
      NEW.enviada_em := now();
    END IF;
  ELSE
    NEW.status_desde := OLD.status_desde;
    NEW.finalizada_em := OLD.finalizada_em;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.solicitacao_carimbos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_solicitacoes_zz_carimbos ON public.solicitacoes;
CREATE TRIGGER trg_solicitacoes_zz_carimbos BEFORE INSERT OR UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.solicitacao_carimbos();

-- 4d. Uma linha de transição por mudança de etapa (e na criação).
--     SECURITY DEFINER: authenticated não tem INSERT na tabela.
--     Emergência (bug em produção): ALTER TABLE solicitacoes DISABLE TRIGGER trg_registra_transicao;
CREATE OR REPLACE FUNCTION public.registra_transicao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
BEGIN
  BEGIN
    v_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO solicitacao_transicoes (solicitacao_id, de_status, para_status, em, usuario_id, fonte)
    VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, now(), v_user, 'trigger')
    ON CONFLICT (solicitacao_id, em, para_status) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.registra_transicao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_registra_transicao ON public.solicitacoes;
CREATE TRIGGER trg_registra_transicao AFTER INSERT OR UPDATE OF status ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.registra_transicao();

-- 4e. Índices dos painéis.
CREATE INDEX IF NOT EXISTS idx_solicitacoes_finalizada_em ON public.solicitacoes (finalizada_em)
  WHERE finalizada_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_fila ON public.solicitacoes (status, status_desde)
  WHERE status IN ('recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada');
CREATE INDEX IF NOT EXISTS idx_solicitacoes_validade_aberta ON public.solicitacoes (validade_fim)
  WHERE status IN ('oc_gerada', 'oc_enviada');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Hook de inatividade (0077) com o ramo do painel_tv
-- ─────────────────────────────────────────────────────────────────────────────

-- Corpo idêntico ao da 0077, mais o ramo do painel_tv no início: a conta da TV
-- não sofre o limite de 50/60 min (decisão D4). Só ela — o acesso dela é mínimo.
CREATE OR REPLACE FUNCTION public.hook_limite_inatividade(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp
AS $$
DECLARE
  v_sessao  uuid;
  v_user    uuid;
  v_ultima  timestamptz;
BEGIN
  v_sessao := nullif(event -> 'claims' ->> 'session_id', '')::uuid;
  v_user   := nullif(event ->> 'user_id', '')::uuid;

  IF v_sessao IS NULL OR v_user IS NULL THEN
    RETURN event;
  END IF;

  -- 0079: a conta da TV renova sempre.
  IF public.usuario_e_painel_tv(v_user) THEN
    RETURN event;
  END IF;

  IF event ->> 'authentication_method' IS DISTINCT FROM 'token_refresh' THEN
    INSERT INTO sessao_atividade (session_id, user_id, ultima_atividade)
    VALUES (v_sessao, v_user, now())
    ON CONFLICT (session_id) DO UPDATE SET ultima_atividade = now();

    -- Faxina barata, pelo índice de user_id: sessões antigas do mesmo usuário.
    DELETE FROM sessao_atividade
     WHERE user_id = v_user
       AND session_id <> v_sessao
       AND ultima_atividade < now() - interval '1 day';

    RETURN event;
  END IF;

  SELECT ultima_atividade INTO v_ultima
    FROM sessao_atividade
   WHERE session_id = v_sessao;

  IF NOT FOUND THEN
    INSERT INTO sessao_atividade (session_id, user_id, ultima_atividade)
    VALUES (v_sessao, v_user, now())
    ON CONFLICT (session_id) DO NOTHING;
    RETURN event;
  END IF;

  IF v_ultima < now() - interval '60 minutes' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 401,
        'message', 'Sessao encerrada por inatividade.'
      )
    );
  END IF;

  RETURN event;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'hook_limite_inatividade: % (%) — token liberado', SQLERRM, SQLSTATE;
  RETURN event;
END;
$$;
REVOKE ALL ON FUNCTION public.hook_limite_inatividade(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_limite_inatividade(jsonb) TO supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fuso da operação: America/Campo_Grande (corpos iguais aos vigentes, só o fuso muda)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_portal_rate_limit_diario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_limite constant integer := 50;
BEGIN
  IF NEW.origem <> 'parceiro' OR NEW.parceiro_usuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM solicitacoes
  WHERE parceiro_usuario_id = NEW.parceiro_usuario_id
    AND (created_at AT TIME ZONE 'America/Campo_Grande')::date
        = (now()        AT TIME ZONE 'America/Campo_Grande')::date;

  IF v_count >= v_limite THEN
    RAISE EXCEPTION
      'Limite diario de % solicitacoes por usuario atingido. Tente novamente amanha.',
      v_limite
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_solicitar_agendamento(p_solicitacao_id uuid, p_data_preferida date, p_hora_preferida time without time zone, p_observacoes text, p_nota_fiscal text DEFAULT NULL::text, p_tipo_veiculo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
  v_status text; v_cliente uuid; v_requer boolean; v_antecedencia integer;
  v_min_data date; v_slots integer; v_separa boolean; v_tipo text;
  v_nota text; v_id uuid;
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;
  SELECT s.status, s.cliente_id, c.requer_agendamento, c.antecedencia_minima_horas
    INTO v_status, v_cliente, v_requer, v_antecedencia
    FROM solicitacoes s LEFT JOIN clientes c ON c.id = s.cliente_id
   WHERE s.id = p_solicitacao_id AND s.origem = 'parceiro' AND s.parceiro_id = v_parceiro;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'PT404';
  END IF;
  IF v_requer IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta rota nao exige agendamento.' USING ERRCODE = 'PT409';
  END IF;
  -- A NF nasce no carregamento: antes da OC enviada o pedido chega cedo demais.
  IF v_status NOT IN ('oc_enviada','finalizada') THEN
    RAISE EXCEPTION 'O agendamento so pode ser pedido depois que a carga sai (OC enviada).'
      USING ERRCODE = 'PT409';
  END IF;
  IF p_data_preferida IS NULL THEN
    RAISE EXCEPTION 'Informe a data desejada.' USING ERRCODE = '22004';
  END IF;
  -- Fuso explicito: o servidor roda em UTC e o front calcula a data minima no
  -- relogio local. Sem isto, das 21h em diante o SisLog recusaria uma data que
  -- a propria tela acabou de oferecer (mesmo motivo do dia-calendario da 0022).
  v_min_data := ((now() AT TIME ZONE 'America/Campo_Grande')
                 + make_interval(hours => COALESCE(v_antecedencia, 0)))::date;
  IF p_data_preferida < v_min_data THEN
    RAISE EXCEPTION 'Este terminal exige % h de antecedencia.', COALESCE(v_antecedencia, 0)
      USING ERRCODE = 'PT422';
  END IF;
  -- 0069 — o tipo de veiculo decide QUAL grade vale. Terminal que separa exige
  -- o tipo mesmo sem hora escolhida: quem vai agendar precisa saber em qual
  -- fila entrar.
  v_tipo := NULLIF(btrim(lower(p_tipo_veiculo)), '');
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('cacamba','graneleiro') THEN
    RAISE EXCEPTION 'Tipo de veiculo invalido: % (use cacamba ou graneleiro).', v_tipo
      USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS (SELECT 1 FROM terminal_janelas
                  WHERE cliente_id = v_cliente AND ativo = true
                    AND tipo_veiculo <> 'todos') INTO v_separa;
  IF v_separa AND v_tipo IS NULL THEN
    RAISE EXCEPTION 'Informe o tipo de veiculo: este terminal tem horarios diferentes por tipo.'
      USING ERRCODE = 'PT422';
  END IF;
  IF p_hora_preferida IS NOT NULL THEN
    SELECT count(*) INTO v_slots FROM terminal_janelas
     WHERE cliente_id = v_cliente AND ativo = true;
    IF v_slots > 0 AND NOT EXISTS (
      SELECT 1 FROM terminal_janelas
       WHERE cliente_id = v_cliente AND ativo = true AND hora = p_hora_preferida
         AND (tipo_veiculo = 'todos' OR v_tipo IS NULL OR tipo_veiculo = v_tipo)) THEN
      RAISE EXCEPTION 'Horario indisponivel na grade deste terminal para este tipo de veiculo.'
        USING ERRCODE = 'PT422';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM agendamentos
              WHERE solicitacao_id = p_solicitacao_id
                AND status IN ('solicitado','em_andamento','agendado')) THEN
    RAISE EXCEPTION 'Ja existe um agendamento em aberto para esta solicitacao.'
      USING ERRCODE = 'PT409';
  END IF;
  -- Teto de tamanho: numero de nota nao passa disso, e o campo e livre.
  v_nota := NULLIF(left(btrim(p_nota_fiscal), 40), '');
  INSERT INTO agendamentos (solicitacao_id, data_preferida, hora_preferida, observacoes,
                            nota_fiscal, nota_fiscal_origem, tipo_veiculo)
  VALUES (p_solicitacao_id, p_data_preferida, p_hora_preferida, NULLIF(btrim(p_observacoes), ''),
          v_nota, CASE WHEN v_nota IS NULL THEN NULL ELSE 'manual' END, v_tipo)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6b. LGPD: aceite do termo e registro de acesso da conta da TV contam como
--     'interno' (corpos iguais aos vigentes, só a origem muda)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_aceite_termos(p_versao text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_versao text := NULLIF(btrim(left(p_versao, 40)), '');
  v_origem text;
  v_id     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessao nao identificada.' USING ERRCODE = '42501';
  END IF;
  IF v_versao IS NULL THEN
    RAISE EXCEPTION 'Versao do termo nao informada.' USING ERRCODE = '22004';
  END IF;

  -- 0079: a conta da TV não é is_interno(), mas também não é do portal.
  v_origem := CASE WHEN is_interno() OR is_painel_tv() THEN 'interno' ELSE 'portal' END;

  INSERT INTO termos_aceite (user_id, versao, origem)
  VALUES (v_user, v_versao, v_origem)
  ON CONFLICT (user_id, versao) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM termos_aceite
     WHERE user_id = v_user AND versao = v_versao;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_acesso(p_acao text, p_recurso text DEFAULT NULL::text, p_detalhe jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_headers json; v_ip text; v_ua text;
  v_origem text; v_detalhe jsonb; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;
  IF p_acao NOT IN ('export_csv', 'download_oc_pdf', 'abrir_anexo',
                    'abrir_documento_agendamento', 'copiar_cpf') THEN
    RETURN NULL;  -- entrada invalida nao derruba o fluxo do usuario
  END IF;
  BEGIN v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  IF v_headers IS NOT NULL THEN
    v_ip := NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_ua := left(v_headers ->> 'user-agent', 500);
  END IF;
  -- 0079: a conta da TV não é is_interno(), mas também não é do portal.
  v_origem := CASE WHEN is_interno() OR is_painel_tv() THEN 'interno' ELSE 'portal' END;
  v_detalhe := p_detalhe;
  IF v_detalhe IS NOT NULL AND length(v_detalhe::text) > 1024 THEN
    v_detalhe := jsonb_build_object('truncado', true);
  END IF;
  INSERT INTO log_acesso (usuario_id, acao, recurso, detalhe, ip, user_agent, origem)
  VALUES (v_user, p_acao, left(p_recurso, 120), v_detalhe, v_ip, v_ua, v_origem)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Consulta de consistência (rodar depois de aplicar; tudo deve dar 0)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT
--   (SELECT count(*) FROM solicitacoes WHERE status_desde IS NULL) AS sem_status_desde,
--   (SELECT count(*) FROM solicitacoes WHERE status = 'finalizada' AND finalizada_em IS NULL) AS finalizada_sem_carimbo,
--   (SELECT count(*) FROM solicitacoes s WHERE s.status IS DISTINCT FROM (
--      SELECT t.para_status FROM solicitacao_transicoes t WHERE t.solicitacao_id = s.id
--      ORDER BY t.em DESC, t.id DESC LIMIT 1)) AS ultima_transicao_diferente;

RESET lock_timeout;

NOTIFY pgrst, 'reload schema';
