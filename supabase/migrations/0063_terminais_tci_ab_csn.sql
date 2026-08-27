-- 0063 — Liga o agendamento em TCI (Itutinga) e A.B/CSN (Pindamonhangaba)
--
-- A 0061 criou o modulo, mas nenhum cliente ficou marcado: `requer_agendamento`
-- nasce `false` e o seed de grade so age sobre cliente ja marcado. Este bloco
-- e a configuracao operacional dos dois primeiros terminais, para a equipe
-- comecar a usar.
--
-- Casamento por ID, nao por `razao_social`. A conferencia no remoto (26/08/2026)
-- mostrou uma linha ativa por terminal, mas os textos NAO sao os que a 0061
-- assumiu — a A.B esta gravada como 'A.B OPERADORA DE TERMINAIS', sem espaco
-- depois do 'A.', enquanto o LIKE da 0061 procurava '%A. B.%'. Ela so seria
-- alcancada pelo segundo padrao ('%OPERADORA DE TERMINAIS%'). Por id nao ha o
-- que dar errado.
--
--   99dbb554-5340-4b78-9e36-6eb7228d0835  TCI TERMINAL DE CARGAS    ITUTINGA/MG
--   652eb27d-c040-470a-8a96-314ae7011b59  A.B OPERADORA DE TERMINAIS PINDAMONHANGABA/SP
--
-- ArcelorMittal (Juiz de Fora) e Metalsider (Betim) ficam de FORA por ora: os
-- ids estao mapeados abaixo em comentario, e ligar cada um e um toggle na tela
-- de Clientes — nao precisa de migration.
--   cb4d3528-6eef-4231-aa89-52ce67beba01  ARCELORMITTAL BRASIL AS   JUIZ DE FORA/MG
--   fc9eba1a-dc28-46d7-bcd0-7fe59696908c  METALSIDER LTDA           BETIM/MG
--
-- `antecedencia_minima_horas` fica NULL de proposito: e a questao 2 em aberto
-- da SPEC (ninguem confirmou os valores reais com os terminais). NULL nao trava
-- nada; quando o numero aparecer, e um campo na tela.
--
-- Idempotente e NAO destrutivo: `terminal_nome` so e preenchido se estiver
-- vazio, entao um replay nao desfaz ajuste que a equipe tenha feito na tela.

-- ---------- 1. Marcar os dois clientes ----------

UPDATE clientes
   SET requer_agendamento = true,
       terminal_nome = COALESCE(NULLIF(btrim(terminal_nome), ''), 'TCI Itutinga')
 WHERE id = '99dbb554-5340-4b78-9e36-6eb7228d0835';

UPDATE clientes
   SET requer_agendamento = true,
       terminal_nome = COALESCE(NULLIF(btrim(terminal_nome), ''), 'A.B / CSN Pindamonhangaba')
 WHERE id = '652eb27d-c040-470a-8a96-314ae7011b59';

-- ---------- 2. Grade de cada um ----------
-- TCI: grade horaria, 08:00 a 16:00, 1 h, 4 vagas -> 36/dia.
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT '99dbb554-5340-4b78-9e36-6eb7228d0835', g.h::time, 60, 4
  FROM generate_series(timestamp '2000-01-01 08:00',
                       timestamp '2000-01-01 16:00',
                       interval '1 hour') AS g(h)
ON CONFLICT (cliente_id, hora) DO NOTHING;

-- A.B / CSN: janela longa, 06/13/19, 6 h, 10 vagas -> 30/dia.
INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade)
SELECT '652eb27d-c040-470a-8a96-314ae7011b59', g.h, 360, 10
  FROM (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
ON CONFLICT (cliente_id, hora) DO NOTHING;

-- ---------- 3. Conferencia de sanidade ----------
-- As duas capacidades diarias tem que ficar na mesma ordem de grandeza (36 e
-- 30, SPEC 3.1.1). Numero fora disso significa grade cadastrada errado.
--
-- WARNING e nao EXCEPTION de proposito: a equipe VAI ajustar capacidade na tela
-- quando confirmar os numeros com cada terminal (questao 3 da SPEC), e este
-- bloco tambem vive no schema cumulativo, que roda em UMA transacao. Abortar
-- por divergencia legitima derrubaria o replay inteiro.
DO $$
DECLARE
  v_tci integer;
  v_ab  integer;
BEGIN
  SELECT COALESCE(sum(capacidade), 0) INTO v_tci FROM terminal_janelas
   WHERE cliente_id = '99dbb554-5340-4b78-9e36-6eb7228d0835' AND ativo;
  SELECT COALESCE(sum(capacidade), 0) INTO v_ab FROM terminal_janelas
   WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59' AND ativo;

  IF v_tci <> 36 OR v_ab <> 30 THEN
    RAISE WARNING 'Grade fora do padrao da SPEC: TCI=% (padrao 36), A.B=% (padrao 30).',
      v_tci, v_ab;
  ELSE
    RAISE NOTICE 'Grades no padrao: TCI % veiculos/dia, A.B/CSN % veiculos/dia.', v_tci, v_ab;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
