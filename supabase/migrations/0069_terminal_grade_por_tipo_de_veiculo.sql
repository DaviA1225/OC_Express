-- 0069 — Grade do terminal separada por tipo de veiculo (cacamba x graneleiro)
--
-- A A.B/CSN Pindamonhangaba nao tem UMA grade: tem duas, e o horario de
-- descarga depende do tipo do veiculo. Cacamba descarrega as 01, 07, 13, 19 e
-- 22; graneleiro so as 06 e as 13. Quem pede o agendamento precisa dizer o tipo
-- ANTES de escolher a hora — sem isso a tela ofereceria 19:00 a um graneleiro,
-- que o terminal recusa.
--
-- Por que uma coluna em `terminal_janelas` e nao duas tabelas ou um campo em
-- `clientes`: a grade JA e uma linha por slot (0061), e o tipo e mais um
-- atributo do slot. Terminal que nao separa por tipo (TCI, MRS) continua com
-- uma grade so, e a tela nem pergunta.
--
-- 'todos' EM VEZ DE NULL, de proposito. NULL seria o jeito idiomatico de dizer
-- "serve qualquer veiculo", mas duas linhas com NULL nao colidem numa UNIQUE —
-- a grade aceitaria 13:00 duplicado no mesmo terminal, que e exatamente o que a
-- restricao existe para impedir. E o upsert do gerador de grade (PostgREST,
-- on_conflict=cliente_id,hora,tipo_veiculo) precisa de uma UNIQUE simples:
-- indice parcial ou por expressao nao serve de arbitro ali.
--
-- ATENCAO — a UNIQUE antiga (cliente_id, hora) SAI. Ela e que impedia os dois
-- 13:00 da A.B (um por tipo). A nova inclui o tipo.
--
-- ATENCAO — `portal_solicitar_agendamento` ganha argumento, entao e DROP e nao
-- CREATE OR REPLACE (mesma armadilha da 0068: lista de argumentos diferente
-- cria SOBRECARGA, e o PostgREST teria de escolher entre duas versoes).
-- `agendamentos_ocupacao_slot` tambem cai: mudou a tabela de retorno, e isso
-- CREATE OR REPLACE nao faz.
--
-- Idempotente.

-- ============================================================
-- 1. Tipo de veiculo na grade
-- ============================================================

ALTER TABLE terminal_janelas
  ADD COLUMN IF NOT EXISTS tipo_veiculo text NOT NULL DEFAULT 'todos';

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS tipo_veiculo text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terminal_janelas_tipo_veiculo_check') THEN
    ALTER TABLE terminal_janelas ADD CONSTRAINT terminal_janelas_tipo_veiculo_check
      CHECK (tipo_veiculo IN ('todos','cacamba','graneleiro'));
  END IF;

  -- Em `agendamentos` NULL e legitimo: e o pedido que nao informou o tipo
  -- (terminal que nao separa, ou pedido registrado pela equipe a partir de um
  -- WhatsApp). Aqui nao ha UNIQUE envolvida, entao NULL nao esconde colisao.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_tipo_veiculo_check') THEN
    ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_tipo_veiculo_check
      CHECK (tipo_veiculo IS NULL OR tipo_veiculo IN ('cacamba','graneleiro'));
  END IF;
END $$;

-- A UNIQUE nasceu inline no CREATE TABLE da 0061, com o nome que o Postgres
-- gera. O DROP usa esse nome; o IF EXISTS cobre o replay.
ALTER TABLE terminal_janelas DROP CONSTRAINT IF EXISTS terminal_janelas_cliente_id_hora_key;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terminal_janelas_cliente_hora_tipo_key') THEN
    ALTER TABLE terminal_janelas ADD CONSTRAINT terminal_janelas_cliente_hora_tipo_key
      UNIQUE (cliente_id, hora, tipo_veiculo);
  END IF;
END $$;

COMMENT ON COLUMN terminal_janelas.tipo_veiculo IS
  'Tipo de veiculo que descarrega neste slot: cacamba, graneleiro ou todos '
  '(terminal com grade unica). Terminal com pelo menos um slot tipado passa a '
  'exigir o tipo no pedido.';
COMMENT ON COLUMN agendamentos.tipo_veiculo IS
  'Tipo informado no pedido, quando o terminal separa a grade. NULL = nao '
  'informado (terminal de grade unica ou pedido registrado pela equipe).';

-- ============================================================
-- 2. Ocupacao por slot, ciente do tipo
-- ============================================================
-- A lista de ARGUMENTOS nao muda de proposito: o filtro por tipo e feito na
-- tela, sobre a grade inteira. Assim o portal descobre em UMA consulta se o
-- terminal separa por tipo (existe slot com tipo <> 'todos') e quais tipos
-- oferece, sem um endpoint so para isso.
--
-- A contagem, essa sim, precisa do tipo: com dois 13:00 na A.B, somar todo
-- mundo que esta agendado as 13:00 misturaria as duas filas.
--
-- Agendamento SEM tipo conta nas duas linhas daquela hora, e nao em nenhuma:
-- ele ocupa um veiculo nosso no terminal de qualquer jeito, e sumir da conta
-- seria pior do que aparecer duas vezes num numero que ja e declaradamente
-- referencia, nao disponibilidade.

DROP FUNCTION IF EXISTS agendamentos_ocupacao_slot(uuid, date);

CREATE OR REPLACE FUNCTION agendamentos_ocupacao_slot(
  p_cliente_id uuid,
  p_data date
)
RETURNS TABLE (
  hora time,
  tipo_veiculo text,
  duracao_minutos integer,
  capacidade integer,
  ocupados integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT tj.hora,
         tj.tipo_veiculo,
         tj.duracao_minutos,
         tj.capacidade,
         (SELECT count(*)::integer
            FROM agendamentos a
            JOIN solicitacoes s ON s.id = a.solicitacao_id
           WHERE a.status = 'agendado'
             AND a.data_agendada = p_data
             AND a.hora_agendada = tj.hora
             AND s.cliente_id = p_cliente_id
             AND (tj.tipo_veiculo = 'todos'
                  OR a.tipo_veiculo IS NULL
                  OR a.tipo_veiculo = tj.tipo_veiculo)) AS ocupados
    FROM terminal_janelas tj
   WHERE tj.cliente_id = p_cliente_id
     AND tj.ativo = true
   ORDER BY tj.hora, tj.tipo_veiculo;
$$;

REVOKE ALL ON FUNCTION agendamentos_ocupacao_slot(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION agendamentos_ocupacao_slot(uuid, date) TO authenticated;

-- ============================================================
-- 3. Aviso de "fora da grade" ciente do tipo
-- ============================================================
-- Cacamba confirmada as 06:00 na A.B esta fora da grade DELA, ainda que 06:00
-- exista para graneleiro. Sem o tipo na comparacao, a excecao passaria batida.

CREATE OR REPLACE FUNCTION agendamento_transicao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok    boolean;
  v_slots integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_ok := CASE OLD.status
      WHEN 'solicitado'   THEN NEW.status IN ('em_andamento','cancelado')
      WHEN 'em_andamento' THEN NEW.status IN ('agendado','solicitado','cancelado')
      WHEN 'agendado'     THEN NEW.status IN ('substituido','cancelado')
      ELSE false  -- 'substituido' e 'cancelado' sao terminais
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Transicao invalida de % para %.', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'em_andamento' AND OLD.status <> 'em_andamento' THEN
    NEW.assumido_por := COALESCE(auth.uid(), NEW.assumido_por);
    NEW.assumido_em  := now();
  END IF;

  IF NEW.status = 'solicitado' AND OLD.status = 'em_andamento' THEN
    NEW.assumido_por := NULL;
    NEW.assumido_em  := NULL;
  END IF;

  IF NEW.status = 'agendado' AND OLD.status <> 'agendado' THEN
    NEW.agendado_por := COALESCE(auth.uid(), NEW.agendado_por);
    NEW.agendado_em  := now();

    -- Aviso de horario fora da grade, calculado aqui e nao no front: o
    -- comprovante do terminal e a prova final, mas a excecao fica registrada.
    -- Terminal sem grade cadastrada nao gera aviso — seria ruido, nao sinal.
    SELECT count(*) INTO v_slots
      FROM terminal_janelas tj
      JOIN solicitacoes s ON s.cliente_id = tj.cliente_id
     WHERE s.id = NEW.solicitacao_id AND tj.ativo = true;

    IF v_slots = 0 THEN
      NEW.hora_fora_da_grade := false;
    ELSE
      NEW.hora_fora_da_grade := NOT EXISTS (
        SELECT 1
          FROM terminal_janelas tj
          JOIN solicitacoes s ON s.cliente_id = tj.cliente_id
         WHERE s.id = NEW.solicitacao_id
           AND tj.ativo = true
           AND tj.hora = NEW.hora_agendada
           AND (tj.tipo_veiculo = 'todos'
                OR NEW.tipo_veiculo IS NULL
                OR tj.tipo_veiculo = NEW.tipo_veiculo)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Reagendamento carrega o tipo
-- ============================================================
-- O veiculo e o mesmo: o reagendamento so troca a janela. Copiar o tipo mantem
-- a grade certa na tela do parceiro e no painel da equipe. Veiculo de outro
-- tipo e um pedido novo, nao um reagendamento.

CREATE OR REPLACE FUNCTION agendamento_reagendar_core(
  p_agendamento_id uuid,
  p_motivo text,
  p_nova_data date,
  p_nova_hora time
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_antigo agendamentos%ROWTYPE;
  v_novo   uuid;
BEGIN
  SELECT * INTO v_antigo FROM agendamentos WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento nao encontrado.' USING ERRCODE = 'PT404';
  END IF;
  IF v_antigo.status <> 'agendado' THEN
    RAISE EXCEPTION 'So um agendamento ja confirmado pode ser reagendado.'
      USING ERRCODE = 'PT409';
  END IF;
  IF p_nova_data IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data desejada.' USING ERRCODE = '22004';
  END IF;

  UPDATE agendamentos
     SET status = 'substituido',
         motivo_reagendamento = COALESCE(NULLIF(btrim(p_motivo), ''), motivo_reagendamento)
   WHERE id = p_agendamento_id;

  INSERT INTO agendamentos (
    solicitacao_id, data_preferida, hora_preferida, observacoes,
    nota_fiscal, nota_fiscal_origem, tipo_veiculo,
    substitui_agendamento_id, motivo_reagendamento
  ) VALUES (
    v_antigo.solicitacao_id, p_nova_data, p_nova_hora, v_antigo.observacoes,
    v_antigo.nota_fiscal, v_antigo.nota_fiscal_origem, v_antigo.tipo_veiculo,
    p_agendamento_id, NULLIF(btrim(p_motivo), '')
  )
  RETURNING id INTO v_novo;

  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION agendamento_reagendar_core(uuid, text, date, time) FROM public, anon, authenticated;

-- ============================================================
-- 5. Presets de grade: alvo do ON CONFLICT
-- ============================================================
-- `terminal_aplicar_grade_padrao` aponta para a UNIQUE (cliente_id, hora), que
-- este bloco acabou de derrubar. Sem esta correcao a funcao passaria a estourar
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" na primeira chamada.
--
-- A tela nao a chama mais (o cadastro gera a grade a partir da faixa que o
-- terminal informou), mas ela existe no banco e e chamavel por `authenticated`
-- — funcao quebrada nao fica de pe so porque hoje ninguem clica nela.
--
-- Os dois presets seguem criando slots 'todos' (o DEFAULT da coluna): eles
-- descrevem terminal de grade unica. Grade separada por tipo se monta na tela.

CREATE OR REPLACE FUNCTION terminal_aplicar_grade_padrao(
  p_cliente_id uuid,
  p_modelo text
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_inseridos integer := 0;
BEGIN
  IF p_modelo = 'horaria' THEN
    INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade, created_by)
    SELECT p_cliente_id, g.h::time, 60, 4, auth.uid()
      FROM generate_series(timestamp '2000-01-01 08:00',
                           timestamp '2000-01-01 16:00',
                           interval '1 hour') AS g(h)
    ON CONFLICT (cliente_id, hora, tipo_veiculo) DO NOTHING;
  ELSIF p_modelo = 'janela_longa' THEN
    INSERT INTO terminal_janelas (cliente_id, hora, duracao_minutos, capacidade, created_by)
    SELECT p_cliente_id, g.h, 360, 10, auth.uid()
      FROM (VALUES ('06:00'::time), ('13:00'::time), ('19:00'::time)) AS g(h)
    ON CONFLICT (cliente_id, hora, tipo_veiculo) DO NOTHING;
  ELSE
    RAISE EXCEPTION 'Modelo de grade invalido: % (use horaria ou janela_longa).', p_modelo
      USING ERRCODE = '22023';
  END IF;

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RETURN v_inseridos;
END;
$$;

-- ============================================================
-- 6. Pedido do portal com o tipo de veiculo
-- ============================================================

DROP FUNCTION IF EXISTS portal_solicitar_agendamento(uuid, date, time, text, text);

CREATE OR REPLACE FUNCTION portal_solicitar_agendamento(
  p_solicitacao_id uuid,
  p_data_preferida date,
  p_hora_preferida time,
  p_observacoes text,
  p_nota_fiscal text DEFAULT NULL,
  p_tipo_veiculo text DEFAULT NULL
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
  v_separa      boolean;
  v_tipo        text;
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

  v_tipo := NULLIF(btrim(lower(p_tipo_veiculo)), '');
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('cacamba','graneleiro') THEN
    RAISE EXCEPTION 'Tipo de veiculo invalido: % (use cacamba ou graneleiro).', v_tipo
      USING ERRCODE = '22023';
  END IF;

  -- Terminal com grade separada exige o tipo ANTES da hora — e o tipo que diz
  -- qual das duas grades vale. Vale mesmo sem hora escolhida ("qualquer
  -- horario"): quem vai agendar no terminal precisa saber em qual fila entrar.
  SELECT EXISTS (
    SELECT 1 FROM terminal_janelas
     WHERE cliente_id = v_cliente AND ativo = true AND tipo_veiculo <> 'todos'
  ) INTO v_separa;

  IF v_separa AND v_tipo IS NULL THEN
    RAISE EXCEPTION 'Informe o tipo de veiculo: este terminal tem horarios diferentes por tipo.'
      USING ERRCODE = 'PT422';
  END IF;

  -- Horario pedido tem que existir na grade do terminal PARA AQUELE TIPO
  -- (elimina pedidos impossiveis, como 07:30 no TCI ou 19:00 de graneleiro na
  -- A.B). Terminal sem grade aceita qualquer hora.
  IF p_hora_preferida IS NOT NULL THEN
    SELECT count(*) INTO v_slots FROM terminal_janelas
     WHERE cliente_id = v_cliente AND ativo = true;
    IF v_slots > 0 AND NOT EXISTS (
      SELECT 1 FROM terminal_janelas
       WHERE cliente_id = v_cliente
         AND ativo = true
         AND hora = p_hora_preferida
         AND (tipo_veiculo = 'todos' OR v_tipo IS NULL OR tipo_veiculo = v_tipo)
    ) THEN
      RAISE EXCEPTION 'Horario indisponivel na grade deste terminal para este tipo de veiculo.'
        USING ERRCODE = 'PT422';
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
    nota_fiscal, nota_fiscal_origem, tipo_veiculo
  ) VALUES (
    p_solicitacao_id, p_data_preferida, p_hora_preferida, NULLIF(btrim(p_observacoes), ''),
    v_nota,
    CASE WHEN v_nota IS NULL THEN NULL ELSE 'manual' END,
    v_tipo
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text, text) TO authenticated;

COMMENT ON FUNCTION portal_solicitar_agendamento(uuid, date, time, text, text, text) IS
  'Pedido de agendamento pelo portal. `p_nota_fiscal` e opcional (0068). '
  '`p_tipo_veiculo` (0069) e obrigatorio quando o terminal separa a grade por '
  'tipo de veiculo, porque e ele que decide quais horarios existem.';

-- ============================================================
-- 7. Grade nova da A.B/CSN Pindamonhangaba
-- ============================================================
--   652eb27d-c040-470a-8a96-314ae7011b59  A.B OPERADORA DE TERMINAIS  PINDA/SP
--
--   cacamba    01:00  07:00  13:00  19:00  22:00
--   graneleiro        06:00         13:00
--
-- Os tres slots que ja existiam (06, 13, 19, todos com 6 h e 10 vagas, da 0063)
-- nao sao apagados: ganham o tipo a que pertencem. O 13:00 fica com a cacamba e
-- o 13:00 do graneleiro entra como linha nova — antes da 0069 os dois nao
-- cabiam na mesma grade.
--
-- A duracao passa a ser a distancia ate o proximo slot DO MESMO TIPO (19:00
-- dura 3 h, nao 6, senao a janela cobriria o 22:00). So e reescrita onde ainda
-- esta no valor da 0063 (360): se a equipe ja ajustou na tela, o ajuste dela
-- vale — mesmo cuidado que a 0063 teve com `terminal_nome`.
--
-- A capacidade segue 10 por slot, herdada da 0063. Com 7 slots isso da 70
-- veiculos/dia no papel (50 cacamba + 20 graneleiro) contra os 30 de antes, e a
-- conferencia de sanidade da 0063 vai passar a avisar (RAISE WARNING, nunca
-- erro) ate que a equipe confirme os numeros reais com o terminal e ajuste na
-- tela de Clientes. O numero e referencia da LHG: a vaga vive no sistema do
-- terminal.

-- ---------- 7.1 Os tres slots antigos ganham tipo ----------
UPDATE terminal_janelas
   SET tipo_veiculo = 'graneleiro',
       duracao_minutos = CASE WHEN duracao_minutos = 360 THEN 420 ELSE duracao_minutos END
 WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59'
   AND hora = '06:00'
   AND tipo_veiculo = 'todos';

UPDATE terminal_janelas
   SET tipo_veiculo = 'cacamba'
 WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59'
   AND hora = '13:00'
   AND tipo_veiculo = 'todos';

UPDATE terminal_janelas
   SET tipo_veiculo = 'cacamba',
       duracao_minutos = CASE WHEN duracao_minutos = 360 THEN 180 ELSE duracao_minutos END
 WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59'
   AND hora = '19:00'
   AND tipo_veiculo = 'todos';

-- ---------- 7.2 O que falta ----------
INSERT INTO terminal_janelas (cliente_id, hora, tipo_veiculo, duracao_minutos, capacidade)
SELECT '652eb27d-c040-470a-8a96-314ae7011b59', g.hora, g.tipo, g.duracao, 10
  FROM (VALUES
          ('01:00'::time, 'cacamba',    360),
          ('07:00'::time, 'cacamba',    360),
          ('13:00'::time, 'cacamba',    360),
          ('19:00'::time, 'cacamba',    180),
          ('22:00'::time, 'cacamba',    180),
          ('06:00'::time, 'graneleiro', 420),
          ('13:00'::time, 'graneleiro', 360)
       ) AS g(hora, tipo, duracao)
ON CONFLICT (cliente_id, hora, tipo_veiculo) DO NOTHING;

-- ---------- 7.3 Conferencia ----------
-- Verifica a si mesma, como a 0067: id errado ou UPDATE que nao pegou aborta
-- aqui em vez de a migration passar dizendo que fez algo que nao fez.
DO $$
DECLARE
  v_cacamba    integer;
  v_graneleiro integer;
  v_orfaos     integer;
BEGIN
  SELECT count(*) INTO v_cacamba FROM terminal_janelas
   WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59'
     AND tipo_veiculo = 'cacamba'
     AND hora IN ('01:00','07:00','13:00','19:00','22:00');

  SELECT count(*) INTO v_graneleiro FROM terminal_janelas
   WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59'
     AND tipo_veiculo = 'graneleiro'
     AND hora IN ('06:00','13:00');

  -- Slot da A.B que ficou sem tipo: seria um horario oferecido aos dois tipos,
  -- que e justamente o que este bloco veio desfazer.
  SELECT count(*) INTO v_orfaos FROM terminal_janelas
   WHERE cliente_id = '652eb27d-c040-470a-8a96-314ae7011b59'
     AND tipo_veiculo = 'todos';

  IF v_cacamba <> 5 OR v_graneleiro <> 2 THEN
    RAISE EXCEPTION 'Grade da A.B nao ficou como esperado: % slots de cacamba (esperado 5) e % de graneleiro (esperado 2).',
      v_cacamba, v_graneleiro;
  END IF;

  IF v_orfaos > 0 THEN
    RAISE WARNING 'A A.B tem % slot(s) ainda sem tipo de veiculo — confira a grade em Cadastros > Clientes.', v_orfaos;
  END IF;

  RAISE NOTICE 'Grade da A.B/CSN: 5 horarios de cacamba e 2 de graneleiro.';
END $$;

NOTIFY pgrst, 'reload schema';
