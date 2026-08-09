-- 0057 — Direitos do titular: exportação e anonimização (achado 3 da auditoria)
--
-- O art. 18 da LGPD dá ao titular o direito de (II) acessar, (III) corrigir e
-- (VI) eliminar seus dados. O sistema só atendia CORREÇÃO, pelos formulários
-- de edição. Não havia como responder "me manda tudo que vocês têm sobre mim"
-- nem "me apaga": os CSVs são por tabela e por filtro de tela, e excluir um
-- motorista é bloqueado por FK quando há solicitação vinculada — e quando não
-- é, o CPF sobrevive em `log_auditoria.dados_antes`.
--
-- Esta migration cria as duas pontas que faltavam.
--
-- POR QUE ANONIMIZAR EM VEZ DE APAGAR: a LGPD (art. 16) aceita anonimização
-- como alternativa à eliminação, e aqui ela é a única saída que não destrói o
-- histórico operacional. Um motorista de 2026 aparece em dezenas de OCs já
-- finalizadas, que a empresa é obrigada a guardar por prazo fiscal. Apagar a
-- linha ou quebraria a FK ou apagaria a OC junto. Anonimizar preserva os IDs
-- e o histórico ("a OC 0287 existiu, com um motorista") e destrói o vínculo
-- com a pessoa, que é o que a lei protege.
--
-- Idempotente: CREATE OR REPLACE.

-- ============================================================
-- 1. audit_scrub_pii — remove dado pessoal de um payload de auditoria
-- ============================================================
-- Pura e IMMUTABLE: recebe o jsonb, devolve o jsonb com as chaves de dado
-- pessoal trocadas por '[ANONIMIZADO]'. Preserva as demais chaves para a
-- trilha continuar provando O QUE mudou e QUANDO — perde só o valor pessoal.
--
-- Trocar por marcador em vez de remover a chave é deliberado: a ausência da
-- chave seria indistinguível de "esse campo não estava no delta", e a trilha
-- deixaria de mostrar que ali houve anonimização.

CREATE OR REPLACE FUNCTION audit_scrub_pii(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    ELSE COALESCE(
      (SELECT jsonb_object_agg(
                e.key,
                CASE WHEN e.key IN (
                       'nome_completo', 'nome_completo_unaccent', 'cpf',
                       'telefone', 'observacoes',
                       'solicitante_nome', 'solicitante_nome_unaccent',
                       'solicitante_telefone'
                     )
                     AND e.value <> 'null'::jsonb
                     THEN '"[ANONIMIZADO]"'::jsonb
                     ELSE e.value
                END)
         FROM jsonb_each(p) AS e),
      p)
  END;
$$;

COMMENT ON FUNCTION audit_scrub_pii(jsonb) IS
  'Troca as chaves de dado pessoal de um payload de log_auditoria por '
  '"[ANONIMIZADO]", preservando as demais. Usada por anonimizar_titular().';

-- ============================================================
-- 2. exportar_dados_titular — art. 18, II (acesso)
-- ============================================================
-- Recebe o CPF em qualquer formatação (compara só os dígitos) e devolve um
-- jsonb com tudo que o sistema sabe sobre a pessoa, atravessando as tabelas.
--
-- Acesso: admin e gerente. Atender pedido de titular é ato de controlador, não
-- rotina de atendimento — por isso não é liberado para analista/assistente.

CREATE OR REPLACE FUNCTION exportar_dados_titular(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digitos text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_ids_int uuid[];
  v_ids_par uuid[];
  v_out     jsonb;
BEGIN
  IF meu_perfil_interno() IS DISTINCT FROM 'admin'
     AND meu_perfil_interno() IS DISTINCT FROM 'gerente' THEN
    RAISE EXCEPTION 'forbidden: exportar_dados_titular exige perfil admin ou gerente';
  END IF;

  IF length(v_digitos) <> 11 THEN
    RAISE EXCEPTION 'cpf invalido: informe os 11 digitos (recebido: % digitos)', length(v_digitos);
  END IF;

  SELECT array_agg(id) INTO v_ids_int
    FROM motoristas WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;
  SELECT array_agg(id) INTO v_ids_par
    FROM parceiro_motoristas WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;

  v_ids_int := COALESCE(v_ids_int, ARRAY[]::uuid[]);
  v_ids_par := COALESCE(v_ids_par, ARRAY[]::uuid[]);

  SELECT jsonb_build_object(
    'gerado_em', now(),
    'gerado_por', auth.uid(),
    'cpf_consultado', p_cpf,
    'encontrado', (array_length(v_ids_int, 1) IS NOT NULL
                   OR array_length(v_ids_par, 1) IS NOT NULL),

    'cadastro_frota_interna', COALESCE(
      (SELECT jsonb_agg(to_jsonb(m)) FROM motoristas m WHERE m.id = ANY(v_ids_int)),
      '[]'::jsonb),

    'cadastro_frota_parceiro', COALESCE(
      (SELECT jsonb_agg(to_jsonb(pm) || jsonb_build_object('parceiro', p.razao_social))
         FROM parceiro_motoristas pm
         JOIN parceiros p ON p.id = pm.parceiro_id
        WHERE pm.id = ANY(v_ids_par)),
      '[]'::jsonb),

    -- Onde a pessoa aparece na operação. Só as colunas do vínculo — não
    -- despeja a solicitação inteira, que tem dado de terceiros (cliente,
    -- valores) que não é do titular.
    'solicitacoes', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'id', s.id, 'numero_interno', s.numero_interno,
                'tipo', s.tipo, 'status', s.status, 'origem', s.origem,
                'created_at', s.created_at, 'finalizada_em', s.finalizada_em))
         FROM solicitacoes s
        WHERE s.motorista_id = ANY(v_ids_int)
           OR s.parceiro_motorista_id = ANY(v_ids_par)),
      '[]'::jsonb),

    -- Metadados dos anexos das solicitações da pessoa. O conteúdo do arquivo
    -- fica no storage: para entregar ao titular, baixar pelos storage_path.
    'anexos', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'filename', a.filename, 'storage_path', a.storage_path,
                'mime_type', a.mime_type, 'created_at', a.created_at))
         FROM solicitacao_anexos a
         JOIN solicitacoes s ON s.id = a.solicitacao_id
        WHERE s.motorista_id = ANY(v_ids_int)
           OR s.parceiro_motorista_id = ANY(v_ids_par)),
      '[]'::jsonb),

    -- Trilha de auditoria do cadastro da pessoa. Resumo, não payload: o
    -- payload completo tem o valor antigo de cada campo e pode ser entregue
    -- sob pedido, consultando log_auditoria por registro_id.
    'auditoria_do_cadastro', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'acao', l.acao, 'tabela', l.tabela,
                'registro_id', l.registro_id, 'quando', l.created_at,
                'por', COALESCE(pu.nome_completo, l.usuario_id::text)))
         FROM log_auditoria l
         LEFT JOIN perfis_usuarios pu ON pu.user_id = l.usuario_id
        WHERE (l.tabela = 'motoristas' AND l.registro_id = ANY(v_ids_int))
           OR (l.tabela = 'parceiro_motoristas' AND l.registro_id = ANY(v_ids_par))),
      '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION exportar_dados_titular(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION exportar_dados_titular(text) TO authenticated;

COMMENT ON FUNCTION exportar_dados_titular(text) IS
  'LGPD art. 18, II. Devolve tudo que o sistema guarda sobre o titular de um '
  'CPF, atravessando cadastro, solicitacoes, anexos e trilha. Exige admin ou '
  'gerente (checado dentro da funcao, nao por RLS).';

-- ============================================================
-- 3. anonimizar_titular — art. 18, VI (eliminação)
-- ============================================================
-- Substitui nome, CPF, telefone e observações por marcadores nas duas tabelas
-- de motorista, e limpa o dado pessoal da trilha de auditoria daquele cadastro.
-- Preserva o `id` — as solicitações continuam apontando para ele.
--
-- Exige p_confirmar => true. Sem isso a função roda em modo simulação e diz o
-- que FARIA: anonimização é irreversível e não deve depender de o operador ter
-- digitado o CPF certo de primeira.

CREATE OR REPLACE FUNCTION anonimizar_titular(
  p_cpf       text,
  p_confirmar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digitos    text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_ids_int    uuid[];
  v_ids_par    uuid[];
  v_abertas    bigint;
  v_scrub_aud  bigint := 0;
  v_marcador   constant text := '[ANONIMIZADO]';
BEGIN
  IF meu_perfil_interno() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: anonimizar_titular exige perfil admin';
  END IF;

  IF length(v_digitos) <> 11 THEN
    RAISE EXCEPTION 'cpf invalido: informe os 11 digitos (recebido: % digitos)', length(v_digitos);
  END IF;

  SELECT array_agg(id) INTO v_ids_int
    FROM motoristas WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;
  SELECT array_agg(id) INTO v_ids_par
    FROM parceiro_motoristas WHERE regexp_replace(cpf, '\D', '', 'g') = v_digitos;

  v_ids_int := COALESCE(v_ids_int, ARRAY[]::uuid[]);
  v_ids_par := COALESCE(v_ids_par, ARRAY[]::uuid[]);

  IF array_length(v_ids_int, 1) IS NULL AND array_length(v_ids_par, 1) IS NULL THEN
    RETURN jsonb_build_object('encontrado', false, 'cpf_consultado', p_cpf);
  END IF;

  -- Guarda-corpo operacional: anonimizar no meio de uma viagem quebraria a OC
  -- (o PDF sai com o nome do motorista) e deixaria o pátio sem conferir quem
  -- chegou. Só libera com tudo finalizado/cancelado.
  SELECT count(*) INTO v_abertas
    FROM solicitacoes s
   WHERE (s.motorista_id = ANY(v_ids_int) OR s.parceiro_motorista_id = ANY(v_ids_par))
     AND s.status NOT IN ('finalizada', 'cancelada');

  IF v_abertas > 0 THEN
    RAISE EXCEPTION 'titular tem % solicitacao(oes) em andamento — finalize ou cancele antes de anonimizar', v_abertas;
  END IF;

  IF NOT p_confirmar THEN
    RETURN jsonb_build_object(
      'simulacao', true,
      'encontrado', true,
      'cpf_consultado', p_cpf,
      'cadastros_frota_interna', COALESCE(array_length(v_ids_int, 1), 0),
      'cadastros_frota_parceiro', COALESCE(array_length(v_ids_par, 1), 0),
      'solicitacoes_preservadas', (
        SELECT count(*) FROM solicitacoes s
         WHERE s.motorista_id = ANY(v_ids_int) OR s.parceiro_motorista_id = ANY(v_ids_par)),
      'linhas_de_auditoria_a_limpar', (
        SELECT count(*) FROM log_auditoria l
         WHERE (l.tabela = 'motoristas' AND l.registro_id = ANY(v_ids_int))
            OR (l.tabela = 'parceiro_motoristas' AND l.registro_id = ANY(v_ids_par))),
      'aviso', 'nada foi alterado. Repita com p_confirmar => true para aplicar.'
    );
  END IF;

  -- CPF é UNIQUE e NOT NULL nas duas tabelas: o marcador precisa ser único por
  -- linha, por isso deriva do próprio id em vez de ser um literal fixo.
  UPDATE motoristas
     SET nome_completo = v_marcador,
         cpf           = 'ANON-' || left(replace(id::text, '-', ''), 12),
         telefone      = NULL,
         observacoes   = NULL,
         ativo         = false
   WHERE id = ANY(v_ids_int);

  UPDATE parceiro_motoristas
     SET nome_completo = v_marcador,
         cpf           = 'ANON-' || left(replace(id::text, '-', ''), 12),
         telefone      = NULL,
         observacoes   = NULL,
         ativo         = false
   WHERE id = ANY(v_ids_par);

  -- ORDEM IMPORTA: a limpeza da trilha vem DEPOIS dos UPDATEs de propósito.
  -- Os UPDATEs acima disparam o audit_trigger, que grava o delta com o nome e
  -- o CPF ANTIGOS. Se limpássemos antes, a própria anonimização reintroduziria
  -- o dado que ela veio remover — e ninguém perceberia.
  WITH alvo AS (
    UPDATE log_auditoria l
       SET dados_antes  = audit_scrub_pii(l.dados_antes),
           dados_depois = audit_scrub_pii(l.dados_depois)
     WHERE (l.tabela = 'motoristas'           AND l.registro_id = ANY(v_ids_int))
        OR (l.tabela = 'parceiro_motoristas'  AND l.registro_id = ANY(v_ids_par))
    RETURNING 1
  )
  SELECT count(*) INTO v_scrub_aud FROM alvo;

  RETURN jsonb_build_object(
    'simulacao', false,
    'encontrado', true,
    'anonimizado_em', now(),
    'anonimizado_por', auth.uid(),
    'cadastros_frota_interna', COALESCE(array_length(v_ids_int, 1), 0),
    'cadastros_frota_parceiro', COALESCE(array_length(v_ids_par, 1), 0),
    'linhas_de_auditoria_limpas', v_scrub_aud,
    'ids_preservados', to_jsonb(v_ids_int || v_ids_par)
  );
END;
$$;

REVOKE ALL ON FUNCTION anonimizar_titular(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION anonimizar_titular(text, boolean) TO authenticated;

COMMENT ON FUNCTION anonimizar_titular(text, boolean) IS
  'LGPD art. 18, VI / art. 16. Anonimiza o titular de um CPF nas duas tabelas '
  'de motorista e limpa o dado pessoal da trilha daquele cadastro, preservando '
  'os ids para nao quebrar o historico de OCs. Exige admin e p_confirmar=true. '
  'Recusa se houver solicitacao em andamento.';

-- ============================================================
-- Limite conhecido
-- ============================================================
-- `solicitacoes.solicitante_nome` / `.solicitante_telefone` sao texto livre
-- digitado no atendimento e NAO tem vinculo com o cadastro de motorista — nao
-- da para casar por CPF. Se o titular tambem aparecer ali, a limpeza e manual:
--
--   SELECT id, numero_interno, solicitante_nome, solicitante_telefone
--     FROM solicitacoes
--    WHERE solicitante_nome ILIKE '%<nome>%'
--       OR solicitante_telefone = '<telefone>';
--
-- Depois do UPDATE manual, rode audit_scrub_pii nas linhas de log_auditoria
-- daquelas solicitacoes (tabela='solicitacoes', registro_id=<id>).

NOTIFY pgrst, 'reload schema';
