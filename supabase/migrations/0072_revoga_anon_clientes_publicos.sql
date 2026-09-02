-- 0072 — `clientes_publicos` deixa de responder ao anon
--
-- A view listava a carteira de clientes de minerio da LHG (razao social, cidade
-- e UF) para qualquer pessoa de posse da anon key — que viaja no bundle do
-- front e e, portanto, publica. Conferido no remoto em 01/09/2026, antes desta
-- migration: `GET /rest/v1/clientes_publicos` com a anon key devolveu 200 e as
-- linhas.
--
-- Ninguem perde funcao. Os tres consumidores da view
-- (`SolicitacaoForm`, `SolicitacoesListPage`, `SolicitacaoDetailPage`) ficam
-- todos dentro do `ProtectedRoute` do portal e rodam autenticados. A 0062 ja
-- havia anotado que este era o passo certo, e so nao o deu porque mudaria um
-- acesso pre-existente sem antes rastrear os consumidores. Rastreados.
--
-- POR QUE O ANON TINHA ACESSO, se nenhuma migration deu GRANT a ele: vem dos
-- DEFAULT PRIVILEGES do schema `public` do Supabase, que se aplicam a objetos
-- NOVOS. Isso tem uma consequencia que este arquivo precisa deixar gritada:
--
--   TODA VEZ que a view for recriada (DROP + CREATE, como a 0062 precisou fazer
--   para remover uma coluna), o anon RECUPERA o SELECT sozinho. O REVOKE tem
--   que vir junto, na mesma migration que recria a view. No schema cumulativo
--   ele fica imediatamente depois do CREATE VIEW pelo mesmo motivo.
--
-- NAO mexemos nos default privileges do schema. Seria a correcao de raiz
-- ("nenhum objeto novo nasce legivel pelo anon"), mas vale para TUDO que for
-- criado dali em diante, e ha coisa que o anon precisa mesmo ler antes do login
-- — `system_status`, do modo manutencao, e o caso vivo. Mudanca desse alcance
-- merece decisao propria, nao um efeito colateral desta.
--
-- Idempotente: revogar o que ja foi revogado e no-op.

REVOKE ALL ON clientes_publicos FROM anon;

-- `public` e o pseudo-papel que alcanca todo mundo: se um dia alguem der GRANT
-- ali, o REVOKE do anon sozinho nao adiantaria nada. Mesmo cuidado que as RPCs
-- do portal ja tomam (`REVOKE ALL ON FUNCTION ... FROM public, anon`).
REVOKE ALL ON clientes_publicos FROM public;

GRANT SELECT ON clientes_publicos TO authenticated;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos de minerio com colunas seguras para o Portal de Parceiros. '
  'Clientes de retorno (cliente_minerio=false) sao filtrados — so a LHG carrega '
  'retorno. Inclui os campos ESTRUTURADOS de agendamento (0061); o texto livre '
  '`observacoes_agendamento` fica de fora de proposito (0062). Legivel apenas '
  'por `authenticated` (0072) — ao recriar a view, repetir o REVOKE do anon.';

-- Conferencia: a view precisa continuar legivel por quem tem sessao, senao o
-- portal perde o seletor de cliente e ninguem consegue abrir solicitacao.
DO $$
DECLARE
  v_anon boolean;
  v_auth boolean;
BEGIN
  v_anon := has_table_privilege('anon', 'clientes_publicos', 'SELECT');
  v_auth := has_table_privilege('authenticated', 'clientes_publicos', 'SELECT');

  IF v_anon THEN
    RAISE EXCEPTION 'anon ainda le clientes_publicos — o REVOKE nao pegou.';
  END IF;

  IF NOT v_auth THEN
    RAISE EXCEPTION 'authenticated perdeu o SELECT em clientes_publicos — o portal quebraria.';
  END IF;

  RAISE NOTICE 'clientes_publicos: anon sem acesso, authenticated com SELECT.';
END $$;

NOTIFY pgrst, 'reload schema';
