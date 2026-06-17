-- 0044 — Portal: editar/cancelar solicitacao via RPC SECURITY DEFINER
--
-- Causa raiz (descoberta em producao): o parceiro NAO tem policy de SELECT em
-- `solicitacoes` (por decisao de seguranca do Bloco 1 — ele le apenas a view
-- `portal_solicitacoes`, que esconde colunas internas). No PostgreSQL, um
-- `UPDATE ... WHERE id = ...` so consegue localizar a linha se ela for VISIVEL
-- via SELECT. Sem policy de SELECT, o WHERE enxerga 0 linhas e o UPDATE afeta
-- 0 linhas SEM erro. Resultado: tanto a edicao (0043) quanto o cancelamento
-- (0018/0028) do parceiro falhavam silenciosamente — o toast de sucesso
-- mascarava porque a mutation so checava `error`, nao a contagem.
--
-- Nao queremos dar SELECT direto na tabela base ao parceiro (vazaria colunas
-- internas). A saida e' rotear a escrita por funcoes SECURITY DEFINER, que
-- rodam como dono (bypass de RLS) e validam posse + status no corpo. Isso
-- preserva o ocultamento de colunas, corrige edicao E cancelamento, e devolve
-- erro quando nada e' alterado (acaba com o "sucesso silencioso").
--
-- A policy `solicitacoes_parceiro_edit_cancel` (0043) fica como defesa em
-- profundidade — inofensiva, mas a escrita real passa por estas funcoes.
--
-- Idempotente.

-- ============================================================
-- 1. Editar a propria solicitacao (enquanto 'recebida')
-- ============================================================

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
  p_observacoes text
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
    observacoes                  = p_observacoes
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

COMMENT ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) IS
  'Edita os campos do parceiro de uma solicitacao propria enquanto status=recebida. '
  'SECURITY DEFINER porque o parceiro nao tem SELECT em solicitacoes; valida posse '
  '(parceiro_id) e status no corpo. ERRCODE PT409 quando nada e editavel.';

-- ============================================================
-- 2. Cancelar a propria solicitacao (enquanto 'recebida')
-- ============================================================

CREATE OR REPLACE FUNCTION portal_cancelar_solicitacao(p_id uuid)
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

  UPDATE solicitacoes SET status = 'cancelada'
  WHERE id = p_id
    AND origem = 'parceiro'
    AND parceiro_id = v_parceiro
    AND status = 'recebida';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada ou nao cancelavel (ja em processamento).'
      USING ERRCODE = 'PT409';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION portal_cancelar_solicitacao(uuid) IS
  'Cancela uma solicitacao propria do parceiro enquanto status=recebida. '
  'SECURITY DEFINER (parceiro nao tem SELECT em solicitacoes). ERRCODE PT409.';

-- ============================================================
-- 3. Permissoes de execucao
-- ============================================================
-- SECURITY DEFINER nao dispensa o GRANT EXECUTE para a role chamar a funcao.
REVOKE ALL ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) FROM public;
REVOKE ALL ON FUNCTION portal_cancelar_solicitacao(uuid) FROM public;
GRANT EXECUTE ON FUNCTION portal_editar_solicitacao(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cancelar_solicitacao(uuid) TO authenticated;
