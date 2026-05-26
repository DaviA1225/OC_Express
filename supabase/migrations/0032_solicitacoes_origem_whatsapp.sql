-- 0032 — Adiciona 'whatsapp' aos valores aceitos por solicitacoes.origem
--
-- A coluna `origem` foi criada na 0016 com CHECK IN ('interno','parceiro','email').
-- Com a entrada do agente de IA do WhatsApp (docs/AGENT_CONTEXT.md), precisamos
-- de uma 4ª categoria para distinguir o canal no filtro "Origem" da listagem e
-- na auditoria. Reaproveitar 'email' deixaria o filtro mentiroso (mensagens de
-- WhatsApp apareceriam ao filtrar e-mail).
--
-- O CHECK original foi criado inline na 0016, com nome auto-gerado pelo
-- Postgres (`solicitacoes_origem_check`). O DO block abaixo localiza e dropa
-- qualquer CHECK em `solicitacoes` cuja definição mencione `origem IN`,
-- independente do nome — isso mantém a migration reexecutável em ambientes
-- onde o nome possa variar. Depois recria com nome canônico e os 4 valores.
--
-- Script idempotente: pode ser reexecutado sem erro.

DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'solicitacoes'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%origem%IN%'
  LOOP
    EXECUTE format('ALTER TABLE solicitacoes DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_origem_check
  CHECK (origem IN ('interno', 'parceiro', 'email', 'whatsapp'));

COMMENT ON COLUMN solicitacoes.origem IS
  'Canal pelo qual a solicitação entrou no sistema: ''interno'' (equipe LHG '
  'cadastrando manualmente), ''parceiro'' (portal externo da Fase 8), ''email'' '
  '(triagem manual de e-mail) ou ''whatsapp'' (agente de IA via Meta Cloud API).';
