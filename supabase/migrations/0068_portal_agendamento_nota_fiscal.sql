-- 0068 — O parceiro pode informar o numero da nota ao pedir o agendamento
--
-- A NF nasce no carregamento e quem esta com ela na mao, primeiro, e o parceiro
-- (foto da nota era justamente o que ele mandava por WhatsApp). A equipe hoje
-- precisa localiza-la no Corporate para agendar; receber o numero junto com o
-- pedido encurta essa busca.
--
-- OPCIONAL: nem todo parceiro tem a nota em maos na hora de pedir, e exigir o
-- numero travaria o pedido por um dado que a equipe consegue obter sozinha. Sem
-- ele o fluxo segue exatamente como antes.
--
-- Reaproveita `agendamentos.nota_fiscal`, que ja existia para o preenchimento
-- automatico do modulo de Embarques — nao ha coluna nova. `nota_fiscal_origem`
-- fica 'manual', que e o que a 0061 ja usava para "digitado por gente"; se o
-- Embarques existir e localizar a nota depois, o painel interno mostra a versao
-- automatica e a equipe decide.
--
-- ATENCAO — nao e CREATE OR REPLACE: mudar a lista de argumentos cria uma
-- SOBRECARGA, nao substitui. Ficariam duas versoes da funcao, e o PostgREST
-- teria de escolher entre elas por nome de parametro. O DROP da assinatura
-- antiga e o que garante que so exista uma.
--
-- Idempotente.

DROP FUNCTION IF EXISTS portal_solicitar_agendamento(uuid, date, time, text);

CREATE OR REPLACE FUNCTION portal_solicitar_agendamento(
  p_solicitacao_id uuid,
  p_data_preferida date,
  p_hora_preferida time,
  p_observacoes text,
  p_nota_fiscal text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_parceiro    uuid := get_current_parceiro_id();
  v_status      text;
  v_cliente     uuid;
  v_requer      boolean;
  v_antecedencia integer;
  v_min_data    date;
  v_slots       integer;
  v_nota        text;
  v_id          uuid;
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;

  SELECT s.status, s.cliente_id, c.requer_agendamento, c.antecedencia_minima_horas
    INTO v_status, v_cliente, v_requer, v_antecedencia
    FROM solicitacoes s
    LEFT JOIN clientes c ON c.id = s.cliente_id
   WHERE s.id = p_solicitacao_id
     AND s.origem = 'parceiro'
     AND s.parceiro_id = v_parceiro;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'PT404';
  END IF;

  IF v_requer IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta rota nao exige agendamento.' USING ERRCODE = 'PT409';
  END IF;

  -- A NF nasce no carregamento: antes da OC enviada o pedido chegaria cedo
  -- demais, sem nota para levar ao terminal (SPEC 2.2 e questao 1).
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
  v_min_data := ((now() AT TIME ZONE 'America/Sao_Paulo')
                 + make_interval(hours => COALESCE(v_antecedencia, 0)))::date;
  IF p_data_preferida < v_min_data THEN
    RAISE EXCEPTION 'Este terminal exige % h de antecedencia.', COALESCE(v_antecedencia, 0)
      USING ERRCODE = 'PT422';
  END IF;

  -- Horario pedido tem que existir na grade do terminal (elimina pedidos
  -- impossiveis, como 07:30 no TCI). Terminal sem grade aceita qualquer hora.
  IF p_hora_preferida IS NOT NULL THEN
    SELECT count(*) INTO v_slots FROM terminal_janelas
     WHERE cliente_id = v_cliente AND ativo = true;
    IF v_slots > 0 AND NOT EXISTS (
      SELECT 1 FROM terminal_janelas
       WHERE cliente_id = v_cliente AND ativo = true AND hora = p_hora_preferida
    ) THEN
      RAISE EXCEPTION 'Horario indisponivel na grade deste terminal.' USING ERRCODE = 'PT422';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM agendamentos
     WHERE solicitacao_id = p_solicitacao_id
       AND status IN ('solicitado','em_andamento','agendado')
  ) THEN
    RAISE EXCEPTION 'Ja existe um agendamento em aberto para esta solicitacao.'
      USING ERRCODE = 'PT409';
  END IF;

  -- Teto de tamanho: numero de nota nao passa disso, e o campo e livre.
  v_nota := NULLIF(left(btrim(p_nota_fiscal), 40), '');

  INSERT INTO agendamentos (
    solicitacao_id, data_preferida, hora_preferida, observacoes,
    nota_fiscal, nota_fiscal_origem
  ) VALUES (
    p_solicitacao_id, p_data_preferida, p_hora_preferida, NULLIF(btrim(p_observacoes), ''),
    v_nota,
    CASE WHEN v_nota IS NULL THEN NULL ELSE 'manual' END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text) TO authenticated;

COMMENT ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text) IS
  'Pedido de agendamento pelo portal. `p_nota_fiscal` e opcional (0068): serve '
  'para encurtar a busca da nota no Corporate, nao para travar o pedido.';

NOTIFY pgrst, 'reload schema';
