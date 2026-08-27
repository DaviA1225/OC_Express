-- 0064 — Contrato de frete da Pamcard no agendamento
--
-- Terceiro documento do agendamento, ao lado do comprovante do terminal e do
-- PDF da nota fiscal. Diferente dos outros dois, este e um documento que a
-- equipe DEVOLVE ao parceiro — mesmo papel do comprovante.
--
-- Nao ha policy nova: a do bucket `agendamentos-docs` (0061) deriva o dono do
-- primeiro segmento do caminho (`{agendamento_id}/...`), entao qualquer arquivo
-- daquele agendamento ja e legivel pelo parceiro dono e gravavel so pela
-- equipe. O caminho deste passa a ser `{agendamento_id}/contrato-{ts}.pdf`.
--
-- OBRIGATORIO para concluir, junto com data, hora e comprovante. A operacao
-- confirmou: o contrato de frete sai ANTES do comprovante do terminal, e os
-- dois sao enviados ao parceiro de uma vez. Como ele ja existe quando a janela
-- e confirmada, exigi-lo nao prende a fila — e garante que 'agendado' signifique
-- "pronto para mandar", nao "metade dos papeis".

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS contrato_frete_path text;

COMMENT ON COLUMN agendamentos.contrato_frete_path IS
  'PDF do contrato de frete da Pamcard, no bucket agendamentos-docs. Sai antes '
  'do comprovante do terminal e volta para o parceiro junto com ele.';

-- Substitui o CHECK da 0061 acrescentando o contrato.
--
-- NOT VALID de proposito. A primeira tentativa desta migration abortou com
-- 23514: ja existia agendamento concluido ANTES desta regra, sem contrato
-- anexado (teste da equipe em 27/08/2026). As saidas eram tres, e duas sao
-- ruins: inventar um caminho de arquivo para satisfazer o CHECK seria mentir
-- sobre um documento que nao existe, e apagar a linha seria decidir sozinho o
-- destino de dado de producao.
--
-- NOT VALID e a terceira: a regra vale para toda linha inserida ou atualizada
-- daqui em diante, e as anteriores ficam explicitamente de fora — sem
-- fabricacao e sem perda. Para achar as linhas herdadas:
--
--   SELECT numero_interno, data_agendada, comprovante_path
--     FROM agendamentos
--    WHERE status = 'agendado' AND contrato_frete_path IS NULL;
--
-- Depois de anexar o contrato nelas, a divida se fecha com:
--
--   ALTER TABLE agendamentos VALIDATE CONSTRAINT agendamentos_agendado_completo;
--
-- (`VALIDATE` nao trava escrita — so varre a tabela conferindo.)
ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_agendado_completo;
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_agendado_completo
  CHECK (
    status <> 'agendado'
    OR (data_agendada IS NOT NULL
        AND hora_agendada IS NOT NULL
        AND comprovante_path IS NOT NULL
        AND contrato_frete_path IS NOT NULL)
  ) NOT VALID;

NOTIFY pgrst, 'reload schema';
