-- 0065 — Parceiro pode cancelar o agendamento em qualquer estado vivo
--
-- A 0061 travou o cancelamento do portal em `solicitado`, com o argumento de
-- que depois disso a equipe ja pode ter agendado no terminal e o SisLog
-- passaria a mentir sobre o mundo real.
--
-- O argumento estava invertido. Quem desiste da carga e o parceiro; se ele
-- desiste depois de a equipe agendar, o SisLog mentir e justamente MANTER o
-- pedido de pe — a equipe continuaria tocando uma janela que ninguem vai usar,
-- e o terminal ficaria com uma vaga ocupada a toa. O que o sistema precisa e
-- registrar a desistencia e deixar visivel que ha uma janela a desmarcar.
--
-- Continua sem DELETE: a linha vira 'cancelado' e permanece. A decisao 2.4 da
-- SPEC vale para todo o modulo — nada e sobrescrito nem apagado, o historico e
-- que conta a verdade do que aconteceu.
--
-- A maquina de estados ja aceitava as tres transicoes (solicitado,
-- em_andamento e agendado -> cancelado), entao nada muda no trigger.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION portal_cancelar_agendamento(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_parceiro uuid := get_current_parceiro_id();
BEGIN
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Sessao de parceiro nao identificada.' USING ERRCODE = '42501';
  END IF;

  UPDATE agendamentos SET status = 'cancelado'
   WHERE id = p_id
     AND parceiro_id = v_parceiro
     AND status IN ('solicitado', 'em_andamento', 'agendado');

  IF NOT FOUND THEN
    -- Sobra so o que ja e terminal: outro cancelamento ou um reagendamento que
    -- ja substituiu esta linha.
    RAISE EXCEPTION 'Este agendamento ja foi cancelado ou substituido.'
      USING ERRCODE = 'PT409';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION portal_cancelar_agendamento(uuid) IS
  'Cancela um agendamento do parceiro em qualquer estado vivo (solicitado, '
  'em_andamento ou agendado). Nao apaga: a linha vira cancelado e fica no '
  'historico. Se a equipe ja tinha agendado no terminal, cabe a ela desmarcar '
  'la — o SisLog nao fala com o sistema do terminal.';

NOTIFY pgrst, 'reload schema';
