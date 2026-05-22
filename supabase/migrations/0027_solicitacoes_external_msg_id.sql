-- 0027 — Idempotência WhatsApp: solicitacoes.external_msg_id (TODO.md)
--
-- Pré-requisito para o futuro agente de IA do WhatsApp (docs/AGENT_CONTEXT.md):
-- ao reprocessar a mesma mensagem (retry, reenvio, replay do webhook), o agente
-- grava o ID externo da mensagem aqui e o índice único impede a 2ª inserção,
-- evitando solicitações duplicadas. Coluna nullable: solicitações criadas pela
-- equipe interna ou pelo portal seguem com external_msg_id = NULL.
--
-- Índice único PARCIAL (WHERE NOT NULL): unicidade só vale para valores
-- preenchidos; vários NULL convivem normalmente. Não exposto ao portal — a view
-- portal_solicitacoes não inclui esta coluna (metadado interno).
--
-- Script idempotente: pode ser reexecutado sem erro.

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS external_msg_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacoes_external_msg_id
  ON solicitacoes (external_msg_id)
  WHERE external_msg_id IS NOT NULL;

COMMENT ON COLUMN solicitacoes.external_msg_id IS
  'ID da mensagem externa (ex.: WhatsApp) que originou a solicitação. Único '
  'quando preenchido — chave de idempotência para o agente de IA não duplicar '
  'mensagens reprocessadas. NULL para origem interna/portal.';
