-- 0051 — RLS: avaliar os helpers UMA vez por query, não uma vez por linha
--
-- Medição em 2026-07-27, como usuário interno admin (mediana de 7 execuções):
--
--   contar solicitacoes (3.767 linhas) ......... 1.110 ms
--   ler 1.000 linhas de log_auditoria .......... 8.180 ms
--   contar log_auditoria (44.000 linhas) ....... 8.238 ms
--   ler 2.269 carretas ......................... 	352 ms
--
-- Um COUNT puro em 44 mil linhas custa ~20 ms no Postgres. Custar 8 SEGUNDOS dá
-- ~0,19 ms por linha — a assinatura de uma função chamada A CADA LINHA fazendo
-- lookup em tabela. É o que acontece: as policies chamam `is_interno()`,
-- `meu_perfil_interno()`, `get_current_parceiro_id()` e `auth.uid()` direto no
-- USING/WITH CHECK, e o Postgres avalia essas expressões por linha candidata.
-- Bate com o `pg_stat`: `perfis_usuarios` acumulava 305 MILHÕES de seq scans
-- numa tabela de 28 linhas.
--
-- As funções já estão corretamente STABLE (0018/0025) — o problema não é a
-- volatilidade delas. É que uma expressão STABLE no USING ainda é avaliada por
-- linha; para virar InitPlan (avaliada uma vez e reaproveitada) ela precisa
-- estar dentro de um subselect. É a otimização documentada de RLS do Supabase.
--
-- Como esta migration faz: em vez de reescrever ~30 policies à mão — o jeito
-- mais fácil de esquecer uma ou de ressuscitar uma versão antiga (aconteceu na
-- 0047, que recriou uma policy que a 0043 havia renomeado) — ela varre
-- `pg_policies`, que é o ESTADO VIVO, e envolve as chamadas com ALTER POLICY.
-- Nenhuma condição de acesso é adicionada, removida ou alterada: só a forma de
-- avaliar muda. `(SELECT f())` devolve exatamente o que `f()` devolvia.
--
-- Rastreabilidade e rollback: cada policy alterada é registrada em
-- `rls_initplan_report` com o texto ORIGINAL do USING/WITH CHECK. A tabela
-- existe para conferência pós-deploy e serve de receita de reversão, caso
-- alguma expressão precise voltar. Ela é removida pela 0052.
--
-- Idempotente: o lookbehind `(?<!SELECT )` impede re-encapsular o que já está
-- encapsulado, então reexecutar não gera `(SELECT (SELECT f()))`.

-- ============================================================
-- 1. Relatório (conferência + receita de rollback)
-- ============================================================
CREATE TABLE IF NOT EXISTS rls_initplan_report (
  id          bigserial PRIMARY KEY,
  tabela      text NOT NULL,
  policy      text NOT NULL,
  qual_antes  text,
  qual_depois text,
  check_antes text,
  check_depois text,
  aplicado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rls_initplan_report ENABLE ROW LEVEL SECURITY;
-- Sem policy: ninguém lê pela API com chave anon/authenticated. Só service_role
-- (que ignora RLS) enxerga — é artefato de manutenção, não dado de aplicação.

-- ============================================================
-- 2. Reescrita
-- ============================================================
DO $do$
DECLARE
  r            record;
  v_novo_qual  text;
  v_novo_check text;
  v_sql        text;
  -- `\m` = início de palavra: evita casar o sufixo de um nome maior.
  c_padrao     text := '(?<!SELECT )\m(is_interno|meu_perfil_interno|is_admin_parceiro|get_current_parceiro_id|auth\.uid)\(\)';
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
     ORDER BY tablename, policyname
  LOOP
    v_novo_qual  := regexp_replace(r.qual,       c_padrao, '(SELECT \1())', 'g');
    v_novo_check := regexp_replace(r.with_check, c_padrao, '(SELECT \1())', 'g');

    CONTINUE WHEN v_novo_qual IS NOT DISTINCT FROM r.qual
              AND v_novo_check IS NOT DISTINCT FROM r.with_check;

    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF v_novo_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_novo_qual);
    END IF;
    IF v_novo_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_novo_check);
    END IF;

    EXECUTE v_sql;

    INSERT INTO rls_initplan_report (tabela, policy, qual_antes, qual_depois, check_antes, check_depois)
    VALUES (r.tablename, r.policyname, r.qual, v_novo_qual, r.with_check, v_novo_check);
  END LOOP;
END
$do$;

COMMENT ON TABLE rls_initplan_report IS
  'Conferencia da migration 0051: policies cujas chamadas de helper passaram a '
  'ser avaliadas por InitPlan. Guarda o texto original do USING/WITH CHECK como '
  'receita de reversao. Removida pela 0052.';

NOTIFY pgrst, 'reload schema';
