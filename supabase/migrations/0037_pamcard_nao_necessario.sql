-- 0037 — Pamcard: opção "Não Necessário" (pagamento por outro meio)
--
-- A operação atualizou para a nova regra/lei da ANTT e passou a aceitar outros
-- métodos de pagamento que não exigem o cartão Pamcard. Adiciona o valor
-- 'nao_necessario' ao status do cartão.
--
-- Regras:
--  - 'tem_cartao'     → número obrigatório (10 a 16 dígitos).
--  - 'nao_tem_cartao' → sem número; entra na fila de "cartão a providenciar".
--  - 'nao_necessario' → sem número; NÃO entra na fila (pagamento por outro meio).
--
-- Script idempotente: pode ser reexecutado sem erro.

-- 1. Lista de valores aceitos no status do cartão.
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_status_check;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_status_check
  CHECK (pamcard_status IN ('tem_cartao', 'nao_tem_cartao', 'nao_necessario'));

-- 2. Número do cartão: obrigatório só com cartão; nulo nos demais casos.
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_numero_quando_tem;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_numero_quando_tem
  CHECK (
    (pamcard_status = 'tem_cartao'
      AND pamcard_numero IS NOT NULL
      AND pamcard_numero ~ '^[0-9]{10,16}$')
    OR
    (pamcard_status IN ('nao_tem_cartao', 'nao_necessario') AND pamcard_numero IS NULL)
  );

-- O índice parcial idx_solicitacoes_pamcard_pendente (0016) já filtra apenas
-- 'nao_tem_cartao', então 'nao_necessario' fica naturalmente fora da fila de
-- pendência — nenhuma alteração necessária aqui.
