-- 0042 — Seguranca: fixa o search_path da funcao audit_trigger()
--
-- Contexto: audit_trigger() (definida em 0001) e SECURITY DEFINER e esta
-- anexada a ~20 tabelas (todas as core + parceiro_* + pendencias + pamcards).
-- Ela foi criada SEM `SET search_path`, o que a torna vulneravel a
-- search_path hijacking: uma funcao DEFINER roda com o privilegio do dono
-- (postgres), e sem search_path fixo um papel que consiga criar objetos num
-- schema a frente no path poderia sequestrar referencias nao-qualificadas
-- (log_auditoria, to_jsonb) e executar codigo com privilegio elevado. E o
-- mesmo apontamento que o linter do Supabase faz como
-- `function_search_path_mutable`.
--
-- Correcao: fixar o search_path. Todas as DEMAIS funcoes do projeto ja usam
-- `SET search_path = public, pg_temp` — esta era a unica que escapou.
--
-- ALTER FUNCTION ... SET search_path e naturalmente idempotente (regra do
-- projeto): reexecutar apenas reaplica o mesmo valor, sem erro.

ALTER FUNCTION audit_trigger() SET search_path = public, pg_temp;
