-- 0028 — Aperta o UPDATE do parceiro em solicitacoes: só cancelamento
--
-- A policy `solicitacoes_parceiro_cancel` (migration 0018) deixava o parceiro
-- dar UPDATE na própria solicitação enquanto `status='recebida'`, mas o
-- WITH CHECK só validava origem + parceiro_id — NÃO restringia o status novo
-- nem as colunas. Na prática, um parceiro com acesso direto à API podia:
--   - editar campos da própria solicitação ainda pendente (placa, cliente…);
--   - forçar o status para qualquer valor (ex.: 'oc_gerada', 'finalizada'),
--     fingindo progresso que a LHG não fez.
-- O portal nunca expôs isso (só oferece "Cancelar"), mas era uma brecha de
-- defense-in-depth.
--
-- Aqui o WITH CHECK passa a exigir `status = 'cancelada'`: combinado com o
-- USING (`status = 'recebida'`), a ÚNICA transição que o parceiro consegue é
-- recebida → cancelada. Qualquer outro UPDATE (editar campo mantendo recebida,
-- ou forçar outro status) é rejeitado (42501). O cancelamento do portal
-- (`update({ status: 'cancelada' })`) continua funcionando. O time interno usa
-- a policy `solicitacoes_interno_update` (is_interno()), intacta.
--
-- Script idempotente: pode ser reexecutado sem erro.

DROP POLICY IF EXISTS solicitacoes_parceiro_cancel ON solicitacoes;

CREATE POLICY solicitacoes_parceiro_cancel ON solicitacoes FOR UPDATE TO authenticated
  USING (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'recebida'
  )
  WITH CHECK (
    origem = 'parceiro'
    AND parceiro_id = get_current_parceiro_id()
    AND status = 'cancelada'
  );
