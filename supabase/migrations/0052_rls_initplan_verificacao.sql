-- 0052 — Verificação da 0051 (somente leitura sobre as policies)
--
-- Duas coisas a acertar depois da 0051:
--
-- 1. O relatório saiu com linhas DUPLICADAS. O `FOR r IN SELECT ... FROM
--    pg_policies` é avaliado de forma preguiçosa, e como o laço fazia ALTER
--    POLICY no meio da varredura, o cursor sobre o catálogo devolveu policies
--    repetidas. O estado final ficou correto (a reescrita é determinística e o
--    lookbehind impede encapsular duas vezes — o segundo ALTER reaplicou
--    exatamente o mesmo texto), mas a CONTAGEM do relatório ficou inflada.
--    Se um dia precisar varrer e alterar catálogo no mesmo laço, materialize
--    antes: `FOR r IN SELECT * FROM (SELECT ... ) s` não basta; use um array ou
--    tabela temporária.
--
-- 2. Faltava a prova de COMPLETUDE. Teste verde e query rápida mostram que os
--    caminhos quentes foram corrigidos, não que TODA policy foi coberta. Aqui a
--    varredura roda de novo, sem alterar nada, e conta quantas ainda têm chamada
--    de helper fora de subselect. O esperado é zero.
--
-- Esta migration NÃO altera policy nenhuma. A tabela de relatório é removida
-- pela 0053 (a 0051 dizia "removida pela 0052" — a verificação entrou no meio).
--
-- Idempotente: limpa e regrava o próprio resumo a cada execução.

-- Remove as duplicatas do relatório, mantendo a primeira ocorrência de cada
-- (tabela, policy).
DELETE FROM rls_initplan_report a
 USING rls_initplan_report b
 WHERE a.tabela = b.tabela
   AND a.policy = b.policy
   AND a.qual_antes IS NOT DISTINCT FROM b.qual_antes
   AND a.id > b.id;

-- Resumo da verificação, gravado como uma linha especial.
DELETE FROM rls_initplan_report WHERE tabela = '_verificacao';

DO $do$
DECLARE
  v_pendentes int;
  v_alteradas int;
  c_padrao text := '(?<!SELECT )\m(is_interno|meu_perfil_interno|is_admin_parceiro|get_current_parceiro_id|auth\.uid)\(\)';
BEGIN
  SELECT count(*) INTO v_pendentes
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') ~ c_padrao OR COALESCE(with_check, '') ~ c_padrao);

  SELECT count(*) INTO v_alteradas
    FROM rls_initplan_report
   WHERE tabela <> '_verificacao';

  INSERT INTO rls_initplan_report (tabela, policy, qual_antes, qual_depois)
  VALUES (
    '_verificacao',
    'resumo',
    format('policies distintas alteradas pela 0051: %s', v_alteradas),
    format('policies em public ainda com helper fora de subselect: %s', v_pendentes)
  );
END
$do$;

NOTIFY pgrst, 'reload schema';
