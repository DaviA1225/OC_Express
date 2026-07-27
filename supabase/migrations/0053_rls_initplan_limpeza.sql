-- 0053 — Remove a tabela de conferência da 0051
--
-- A `rls_initplan_report` cumpriu o papel: permitiu conferir, uma a uma, as 79
-- policies reescritas pela 0051 (nenhuma condição de acesso mudou — só a forma
-- de avaliar), e a 0052 confirmou que sobraram ZERO policies em `public` com
-- chamada de helper fora de subselect. Com isso ela vira artefato de
-- manutenção parado num schema que o PostgREST expõe, e sai.
--
-- Como reverter a 0051, se algum dia for preciso: a transformação é mecânica e
-- não depende da tabela. O inverso de `(SELECT f())` é `f()`:
--
--   DO $$
--   DECLARE r record; q text; c text;
--   BEGIN
--     FOR r IN SELECT * FROM (
--       SELECT schemaname, tablename, policyname, qual, with_check
--         FROM pg_policies WHERE schemaname = 'public'
--     ) s LOOP                                   -- materializa antes de alterar
--       q := regexp_replace(r.qual,       '\(\s*SELECT (\w+(?:\.\w+)?)\(\)[^)]*\)', '\1()', 'g');
--       c := regexp_replace(r.with_check, '\(\s*SELECT (\w+(?:\.\w+)?)\(\)[^)]*\)', '\1()', 'g');
--       ...ALTER POLICY conforme a 0051...
--     END LOOP;
--   END $$;
--
-- Repare no `SELECT * FROM (...) s`: a 0051 varreu `pg_policies` e fez ALTER
-- dentro do mesmo laço, e o cursor preguiçoso sobre o catálogo devolveu cada
-- policy duas vezes. Não causou dano (a reescrita é determinística e o
-- lookbehind impede encapsular de novo), mas inflou a contagem do relatório de
-- 79 para 158. Materialize a lista antes de alterar.
--
-- Idempotente: DROP ... IF EXISTS.

DROP TABLE IF EXISTS rls_initplan_report;

NOTIFY pgrst, 'reload schema';
