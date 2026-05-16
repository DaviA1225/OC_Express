-- 0016 — Pamcard e origem da solicitação (SPEC-PATCH-PAMCARD)
--
-- Substitui a coluna booleana `pamcard` (criada em 0001, nunca usada pelo app)
-- pelo modelo completo de status + número do cartão, e adiciona `origem` para
-- distinguir solicitações internas, de parceiros e de e-mail.
--
-- Decisão: a coluna `pamcard_status` usa DEFAULT 'nao_tem_cartao' (e não
-- 'tem_cartao' como no SPEC). Isso garante que as linhas já existentes — e
-- qualquer INSERT que não preencha o campo — satisfaçam a constraint abaixo
-- (não há número de cartão para elas). O padrão de UX "Tem cartão" do
-- formulário de Nova Solicitação é aplicado na camada do front-end.
--
-- Script idempotente: pode ser reexecutado sem erro.

ALTER TABLE solicitacoes DROP COLUMN IF EXISTS pamcard;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS pamcard_status text NOT NULL DEFAULT 'nao_tem_cartao'
    CHECK (pamcard_status IN ('tem_cartao', 'nao_tem_cartao')),
  ADD COLUMN IF NOT EXISTS pamcard_numero text,
  ADD COLUMN IF NOT EXISTS pamcard_providenciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pamcard_providenciado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'interno'
    CHECK (origem IN ('interno', 'parceiro', 'email'));

-- Quando há cartão, o número é obrigatório e contém apenas 10 a 16 dígitos.
-- Quando não há cartão, o número deve ser nulo.
ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_pamcard_numero_quando_tem;

ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_pamcard_numero_quando_tem
  CHECK (
    (pamcard_status = 'tem_cartao'
      AND pamcard_numero IS NOT NULL
      AND pamcard_numero ~ '^[0-9]{10,16}$')
    OR
    (pamcard_status = 'nao_tem_cartao' AND pamcard_numero IS NULL)
  );

-- Índice parcial para a consulta mais frequente:
-- "solicitações com cartão ainda pendente de providência".
CREATE INDEX IF NOT EXISTS idx_solicitacoes_pamcard_pendente
  ON solicitacoes (pamcard_status, pamcard_providenciado_em)
  WHERE pamcard_status = 'nao_tem_cartao' AND pamcard_providenciado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_origem ON solicitacoes (origem);

-- A trigger de auditoria (audit_trigger, definida em 0001) usa to_jsonb(NEW)/
-- to_jsonb(OLD) e captura a linha inteira — as colunas novas são auditadas
-- automaticamente, sem necessidade de alteração.
