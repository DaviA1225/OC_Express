-- 0066 — Liga o agendamento na MRS Estacao Sao Bento (Mogi das Cruzes)
--
-- Quinto cliente que exige agendamento, e o primeiro a mostrar que "segue o
-- padrao do TCI" queria dizer o FORMATO (slots discretos, hora marcada), nao os
-- numeros. E exatamente a questao 3 da SPEC se confirmando:
--
--   TCI / Arcelor / Metalsider : 08:00-16:00, 60 min, 4 vagas  ->  36/dia
--   A.B / CSN                  : 06/13/19,    360 min, 10 vagas -> 30/dia
--   MRS Sao Bento              : 07:00-17:30,  30 min, 3 vagas  ->  66/dia
--
-- Os 66/dia ficam acima dos outros dois, e isso e real: janela de meia hora
-- rende o dobro de slots. O aviso de sanidade da 0063 compara so TCI e A.B, e
-- continua valendo para eles.
--
--   0281905e-646a-431f-abf1-80d7d7e757e1  MRS ESTACAO SAO BENTO  MOGI DAS CRUZES/SP
--
-- ATENCAO ao ultimo slot: "das 7 as 18" foi lido como horario de FUNCIONAMENTO,
-- entao a ultima janela que cabe inteira comeca 17:30 e termina 18:00 — 22
-- slots. Se na pratica o terminal aceita um veiculo comecando 18:00 (indo ate
-- 18:30), falta um slot: e um clique em Cadastros -> Clientes -> Agendamento,
-- sem migration.
--
-- Casamento por ID, como na 0063. Idempotente e nao destrutivo: `terminal_nome`
-- so e preenchido se estiver vazio e as janelas usam ON CONFLICT DO NOTHING.

UPDATE clientes
   SET requer_agendamento = true,
       terminal_nome = COALESCE(NULLIF(btrim(terminal_nome), ''),
                                'MRS São Bento — Mogi das Cruzes')
 WHERE id = '0281905e-646a-431f-abf1-80d7d7e757e1';

-- 07:00, 07:30, ... 17:30 — 22 janelas de 30 min, 3 vagas cada.
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT '0281905e-646a-431f-abf1-80d7d7e757e1', g.h::time, 30, 3
  FROM generate_series(timestamp '2000-01-01 07:00',
                       timestamp '2000-01-01 17:30',
                       interval '30 minutes') AS g(h)
ON CONFLICT (cliente_id, hora) DO NOTHING;

DO $$
DECLARE
  v_slots integer;
  v_dia   integer;
BEGIN
  SELECT count(*), COALESCE(sum(capacidade), 0) INTO v_slots, v_dia
    FROM terminal_janelas
   WHERE cliente_id = '0281905e-646a-431f-abf1-80d7d7e757e1' AND ativo;

  IF v_slots <> 22 OR v_dia <> 66 THEN
    RAISE WARNING 'Grade da MRS fora do combinado: % slots / % veiculos-dia (esperado 22 / 66).',
      v_slots, v_dia;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
