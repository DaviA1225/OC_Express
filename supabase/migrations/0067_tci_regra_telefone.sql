-- 0067 — Regra do TCI Itutinga: exige o telefone do motorista
--
-- O painel de trabalho mostra `clientes.observacoes_agendamento` como "Regra do
-- terminal", logo acima do bloco de cópia. E ali que exigencia especifica de um
-- terminal deve viver — em vez de virar coluna nova a cada pedido.
--
-- O telefone ja aparece no bloco de cópia para todos os terminais; esta nota diz
-- a quem esta agendando que, no TCI, ele NAO e opcional.
--
--   99dbb554-5340-4b78-9e36-6eb7228d0835  TCI TERMINAL DE CARGAS  ITUTINGA/MG
--
-- Nao destrutivo e idempotente, e os dois pontos importam porque este campo e
-- editavel na tela: se a equipe ja escreveu algo ali, o texto e ACRESCENTADO em
-- linha nova em vez de substituir; se ja houver mencao a telefone, nao mexe.
-- Reexecutar nao duplica a frase.

UPDATE clientes
   SET observacoes_agendamento = CASE
         WHEN observacoes_agendamento IS NULL OR btrim(observacoes_agendamento) = ''
           THEN 'Exige o telefone do motorista no agendamento.'
         WHEN observacoes_agendamento ILIKE '%telefone%'
           THEN observacoes_agendamento
         ELSE btrim(observacoes_agendamento) || E'\nExige o telefone do motorista no agendamento.'
       END
 WHERE id = '99dbb554-5340-4b78-9e36-6eb7228d0835';

-- Conferencia: `observacoes_agendamento` NAO esta em `clientes_publicos` (a 0062
-- a tirou de la de proposito, por ser texto livre numa view que o anon le), e
-- por isso nao da para verificar o resultado de fora com a chave anonima. A
-- migration verifica a si mesma: se o id estiver errado ou o UPDATE nao pegar,
-- isto aborta em vez de a migration passar dizendo que fez algo que nao fez.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM clientes
     WHERE id = '99dbb554-5340-4b78-9e36-6eb7228d0835'
       AND observacoes_agendamento ILIKE '%telefone do motorista%'
  ) THEN
    RAISE EXCEPTION 'A regra do telefone nao ficou gravada no TCI (id conferido?).';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
