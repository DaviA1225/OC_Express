-- 0075 — O parceiro passa a carregar RETORNO pelo portal
--
-- Regra antiga (0030): "o parceiro externo so carrega minerio; retorno so com
-- motorista da propria LHG". A regra mudou — a transportadora parceira agora
-- tambem carrega o retorno. Esta migration desfaz o bloqueio e da ao portal o
-- mesmo caminho que o interno usa para abrir um retorno: o operador escolhe
-- uma CARGA DE RETORNO (par cliente + local de carregamento, cadastrado pela
-- LHG em `cargas_retorno`), e dela saem `cliente_id` e `local_carregamento`.
--
-- O que muda:
--   1. `clientes_publicos` deixa de filtrar `cliente_minerio = true`: lista os
--      clientes ativos de minerio OU de retorno, e ganha as duas flags no fim
--      para o portal separar as listas como o interno separa. Sem isso, uma
--      solicitacao de retorno apareceria no portal com o cliente em branco.
--   2. View nova `cargas_retorno_publicas`: so as cargas ativas de clientes
--      ativos, com id, cliente e local. `observacoes` fica de fora — e texto
--      livre da equipe (mesma regra da 0062).
--   3. `portal_solicitacoes` expoe `local_carregamento`, para o portal saber
--      qual carga de retorno foi escolhida ao editar/duplicar.
--   4. `portal_editar_solicitacao` aceita `p_tipo` e `p_local_carregamento`
--      (DEFAULT NULL — chamada antiga, com os 11 argumentos, continua valendo
--      e nao mexe no tipo).
--
-- Material continua em branco no que vem do portal: a equipe define no
-- processamento (SPEC 5.5), tanto no minerio quanto no retorno.
--
-- Idempotente.

-- ============================================================
-- 1. clientes_publicos — minerio E retorno
-- ============================================================
-- CREATE OR REPLACE (e nao DROP + CREATE): as colunas novas entram no FIM, o
-- que o Postgres aceita, e a view mantem os GRANTs. Mesmo assim o REVOKE do
-- anon vem colado aqui (0072): se um dia isto virar DROP + CREATE, o anon
-- recuperaria o SELECT pelos default privileges.
CREATE OR REPLACE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf,
       requer_agendamento, terminal_nome, antecedencia_minima_horas,
       cliente_minerio, cliente_retorno
FROM clientes
WHERE ativo = true
  AND (cliente_minerio = true OR cliente_retorno = true);

REVOKE ALL ON clientes_publicos FROM anon;
REVOKE ALL ON clientes_publicos FROM public;
GRANT SELECT ON clientes_publicos TO authenticated;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos (minerio ou retorno) com colunas seguras para o Portal de '
  'Parceiros. Desde a 0075 o parceiro tambem carrega retorno; as flags '
  'cliente_minerio/cliente_retorno separam as listas no portal. Inclui os campos '
  'ESTRUTURADOS de agendamento (0061); o texto livre `observacoes_agendamento` '
  'fica de fora de proposito (0062). Legivel apenas por `authenticated` (0072) '
  '— ao recriar a view, repetir o REVOKE do anon.';

-- ============================================================
-- 2. cargas_retorno_publicas — o seletor de retorno do portal
-- ============================================================
-- `cargas_retorno` tem SELECT so para o interno (0025). O parceiro le por aqui,
-- sem `observacoes` (texto livre da equipe) e sem autoria.
CREATE OR REPLACE VIEW cargas_retorno_publicas
WITH (security_invoker = false) AS
SELECT cr.id, cr.cliente_id, cr.local_carregamento,
       c.razao_social, c.cidade, c.uf
FROM cargas_retorno cr
JOIN clientes c ON c.id = cr.cliente_id
WHERE cr.ativo = true
  AND c.ativo = true;

-- View nova nasce legivel pelo anon (default privileges do schema — 0072).
REVOKE ALL ON cargas_retorno_publicas FROM anon;
REVOKE ALL ON cargas_retorno_publicas FROM public;
GRANT SELECT ON cargas_retorno_publicas TO authenticated;

COMMENT ON VIEW cargas_retorno_publicas IS
  'Cargas de retorno ativas (cliente + local de carregamento) para o Portal de '
  'Parceiros abrir solicitacao de retorno (0075). Sem `observacoes` (texto livre '
  'da equipe). Legivel apenas por `authenticated` — ao recriar, repetir o REVOKE.';

-- ============================================================
-- 3. portal_solicitacoes — expoe local_carregamento
-- ============================================================
-- Coluna nova no FIM: CREATE OR REPLACE aceita, e os GRANTs ficam.
CREATE OR REPLACE VIEW portal_solicitacoes
WITH (security_invoker = false) AS
SELECT id, numero_interno, tipo, status, origem,
       parceiro_id, parceiro_usuario_id, parceiro_motorista_id,
       parceiro_veiculo_id, parceiro_carreta_id,
       parceiro_primeira_carreta_id, parceiro_dolly_id,
       parceiro_subcontratada_id,
       cliente_id, pamcard_status, pamcard_numero,
       observacoes, created_at, enviada_em, finalizada_em,
       local_carregamento
FROM solicitacoes
WHERE origem = 'parceiro' AND parceiro_id = get_current_parceiro_id();

GRANT SELECT ON portal_solicitacoes TO authenticated;

COMMENT ON VIEW portal_solicitacoes IS
  'Solicitações do parceiro logado, apenas com colunas seguras. O portal lê '
  'por aqui; o parceiro não tem policy de SELECT na tabela solicitacoes. '
  '`local_carregamento` desde a 0075 (carga de retorno escolhida).';

-- ============================================================
-- 4. portal_editar_solicitacao — tipo e local de carregamento
-- ============================================================
-- Assinatura muda (2 parametros a mais), entao a antiga sai: duas sobrecargas
-- deixariam o PostgREST sem saber qual chamar.
DROP FUNCTION IF EXISTS portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text);

CREATE OR REPLACE FUNCTION portal_editar_solicitacao(
  p_id uuid,
  p_motorista uuid,
  p_veiculo uuid,
  p_carreta uuid,
  p_primeira_carreta uuid,
  p_dolly uuid,
  p_subcontratada uuid,
  p_cliente uuid,
  p_pamcard_status text,
  p_pamcard_numero text,
  p_observacoes text,
  p_tipo text DEFAULT NULL,
  p_local_carregamento text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;

  IF p_tipo IS NOT NULL AND p_tipo NOT IN ('carregamento', 'retorno') THEN
    RAISE EXCEPTION 'Tipo invalido: %', p_tipo USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'retorno' AND NULLIF(btrim(p_local_carregamento), '') IS NULL THEN
    RAISE EXCEPTION 'Retorno exige a carga de retorno (local de carregamento).'
      USING ERRCODE = '22023';
  END IF;

  UPDATE solicitacoes SET
    parceiro_motorista_id        = p_motorista,
    parceiro_veiculo_id          = p_veiculo,
    parceiro_carreta_id          = p_carreta,
    parceiro_primeira_carreta_id = p_primeira_carreta,
    parceiro_dolly_id            = p_dolly,
    parceiro_subcontratada_id    = p_subcontratada,
    cliente_id                   = p_cliente,
    pamcard_status               = p_pamcard_status,
    pamcard_numero               = p_pamcard_numero,
    observacoes                  = p_observacoes,
    -- p_tipo NULL = chamada antiga: tipo e local ficam como estao. No minerio o
    -- local e da equipe (define no processamento), entao sai em branco.
    tipo               = COALESCE(p_tipo, tipo),
    local_carregamento = CASE
                           WHEN p_tipo IS NULL       THEN local_carregamento
                           WHEN p_tipo = 'retorno'   THEN btrim(p_local_carregamento)
                           ELSE NULL
                         END
  WHERE id = p_id
    AND origem = 'parceiro'
    AND parceiro_id = v_parceiro
    AND status = 'recebida';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada ou nao editavel (ja em processamento).'
      USING ERRCODE = 'PT409';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) IS
  'Edita os campos do parceiro de uma solicitacao propria enquanto status=recebida. '
  'SECURITY DEFINER porque o parceiro nao tem SELECT em solicitacoes; valida posse '
  '(parceiro_id) e status no corpo. ERRCODE PT409 quando nada e editavel. '
  'Desde a 0075 aceita p_tipo/p_local_carregamento (retorno pelo portal).';

REVOKE ALL ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) TO authenticated;

-- Conferencia: as duas views do seletor precisam responder a quem tem sessao e
-- a ninguem sem ela.
DO $$
BEGIN
  IF has_table_privilege('anon', 'clientes_publicos', 'SELECT')
     OR has_table_privilege('anon', 'cargas_retorno_publicas', 'SELECT') THEN
    RAISE EXCEPTION 'anon le clientes_publicos/cargas_retorno_publicas — o REVOKE nao pegou.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'clientes_publicos', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'cargas_retorno_publicas', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated sem SELECT nas views do portal — o seletor quebraria.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
