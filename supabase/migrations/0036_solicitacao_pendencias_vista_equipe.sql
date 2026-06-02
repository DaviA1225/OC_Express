-- 0036 — Pendência: marcar quando a equipe já viu a resposta do parceiro
--
-- A 0035 fechou o loop, mas o aviso de "parceiro respondeu" vivia só no sino
-- (NotificationsBell), que cada usuário apaga individualmente (localStorage) —
-- então um colega podia limpar e os outros não ficavam sabendo que ainda havia
-- uma resposta sem tratamento. Esta coluna torna o sinal COMPARTILHADO: a
-- resposta resolvida aparece como "pop" no card da solicitação até alguém da
-- equipe marcar como vista. Aí some para todos, porque é estado real no banco
-- (e não um dismiss por usuário).
--
-- vista_equipe_em NULL  = parceiro resolveu e a equipe ainda não tratou.
-- vista_equipe_em SET   = a equipe já viu/retomou — pop some.
--
-- Só o time interno escreve aqui (policy pendencias_interno_all, 0035). O portal
-- nunca toca nesta coluna.
--
-- Script idempotente: pode ser reexecutado sem erro.

ALTER TABLE solicitacao_pendencias
  ADD COLUMN IF NOT EXISTS vista_equipe_em timestamptz;

COMMENT ON COLUMN solicitacao_pendencias.vista_equipe_em IS
  'Quando alguem da equipe interna marcou a resposta do parceiro como vista. '
  'NULL = resolvida mas ainda nao tratada (mostra pop no card). So interno escreve.';
