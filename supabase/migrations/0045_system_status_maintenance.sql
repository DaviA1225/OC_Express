-- 0045 — Kill switch / modo manutenção compartilhado (interno + portal)
--
-- Cria uma tabela de linha única `system_status` que os dois apps leem no boot
-- (e periodicamente) para decidir se exibem a tela de manutenção em vez do app.
-- É um GATE DE UI cooperativo, não um bloqueio no nível de dados: serve para
-- congelar a operação durante um deploy sem revelar que é upgrade. As RLS/policies
-- de cada tabela continuam sendo a segurança de verdade.
--
-- Design das permissões (importante):
--   * SELECT liberado para anon + authenticated  -> precisa ser lido ANTES do
--     login (tela pública) e por qualquer sessão ativa.
--   * NENHUMA policy de INSERT/UPDATE/DELETE       -> nem operador logado nem o
--     parceiro conseguem ligar/desligar. Só o service_role (que ignora RLS) ou
--     o SQL Editor do Dashboard alteram a flag. É o "cofre" do interruptor.
--
-- Toggle da manutenção (rodar no SQL Editor / Dashboard):
--   UPDATE public.system_status SET maintenance = true  WHERE id = 1;  -- congela
--   UPDATE public.system_status SET maintenance = false WHERE id = 1;  -- libera
--
-- Idempotente (regra do projeto): pode ser reexecutada sem erro.

CREATE TABLE IF NOT EXISTS public.system_status (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- linha única
  maintenance boolean NOT NULL DEFAULT false,
  -- mensagem opcional exibida na tela de bloqueio; se NULL, o app usa o texto
  -- neutro padrão ("Sistema temporariamente indisponível...").
  message     text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Semente da linha única (não sobrescreve se já existir).
INSERT INTO public.system_status (id, maintenance, message)
VALUES (1, false, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_status ENABLE ROW LEVEL SECURITY;

-- Leitura pública (pré-login e sessões ativas). Sem policies de escrita: a flag
-- só muda via service_role / SQL Editor.
DROP POLICY IF EXISTS system_status_select_todos ON public.system_status;
CREATE POLICY system_status_select_todos
  ON public.system_status
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.system_status TO anon, authenticated;

-- PostgREST: recarrega o schema cache para enxergar a tabela nova sem esperar.
NOTIFY pgrst, 'reload schema';
