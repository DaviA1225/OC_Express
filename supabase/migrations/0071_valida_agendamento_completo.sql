-- 0071 — Fecha a divida do NOT VALID da 0064
--
-- A 0064 acrescentou o contrato de frete ao CHECK `agendamentos_agendado_completo`
-- e o marcou NOT VALID: existia um agendamento concluido ANTES da regra, sem
-- contrato anexado (teste da equipe em 27/08/2026). NOT VALID fez a regra valer
-- para toda linha nova sem abortar por causa da velha, e a divida ficou anotada
-- no cabecalho da propria 0064.
--
-- A conferencia no remoto (01/09/2026) mostrou ZERO linhas violando: o unico
-- agendamento em 'agendado' tem data, hora, comprovante e contrato. A equipe
-- anexou o documento pela tela, que era o caminho previsto. Da para validar.
--
-- O que muda na pratica: um CHECK NOT VALID vale para INSERT e UPDATE, mas o
-- planejador NAO pode confiar nele para linhas antigas — e, mais importante, ele
-- documenta uma excecao que ninguem mais precisa. Validado, o CHECK passa a ser
-- verdade sobre a tabela inteira.
--
-- ATENCAO — este bloco NAO aborta se encontrar linha violando. Ele avisa e sai.
-- Motivo: o mesmo texto vive no schema cumulativo, que roda em UMA transacao;
-- abortar ali por causa de um dado herdado derrubaria o replay inteiro, que e
-- exatamente o que a 0064 evitou ao escolher NOT VALID. Se o aviso aparecer, o
-- caminho e o mesmo de antes — anexar o contrato pelo botao Documentos e
-- reexecutar.
--
-- Idempotente: validar constraint ja validada e no-op, e o bloco nem chega la.

DO $$
DECLARE
  v_validada  boolean;
  v_violando  integer;
BEGIN
  SELECT convalidated INTO v_validada
    FROM pg_constraint
   WHERE conname = 'agendamentos_agendado_completo'
     AND conrelid = 'agendamentos'::regclass;

  IF v_validada IS NULL THEN
    RAISE WARNING 'CHECK agendamentos_agendado_completo nao existe — a 0064 nao rodou nesta base.';
    RETURN;
  END IF;

  IF v_validada THEN
    RAISE NOTICE 'CHECK agendamentos_agendado_completo ja estava validado.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_violando
    FROM agendamentos
   WHERE status = 'agendado'
     AND (data_agendada IS NULL
       OR hora_agendada IS NULL
       OR comprovante_path IS NULL
       OR contrato_frete_path IS NULL);

  IF v_violando > 0 THEN
    RAISE WARNING
      'Nao validado: % agendamento(s) concluido(s) sem data, hora, comprovante ou contrato. Anexe o que falta pelo botao Documentos e rode este bloco de novo.',
      v_violando;
    RETURN;
  END IF;

  ALTER TABLE agendamentos VALIDATE CONSTRAINT agendamentos_agendado_completo;
  RAISE NOTICE 'CHECK agendamentos_agendado_completo validado: a regra agora vale para a tabela inteira.';
END $$;
