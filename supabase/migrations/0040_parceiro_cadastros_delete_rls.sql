-- 0040 — Portal: policy de DELETE nos cadastros do parceiro
--
-- A 0018 (secao 8) criou apenas SELECT/INSERT/UPDATE do parceiro nas tabelas
-- parceiro_motoristas/veiculos/carretas/subcontratadas — faltou DELETE. Com a
-- RLS ligada e sem policy de DELETE, o `DELETE` do PostgREST nao casa nenhuma
-- linha e volta 0 apagadas SEM erro: o portal mostrava "excluido" mas nada saia
-- (no-op). Esta migration adiciona a policy de DELETE, no mesmo molde da que a
-- 0039 ja deu para parceiro_pamcards.
--
-- Seguranca: registros EM USO continuam protegidos pelas FKs de solicitacoes
-- (parceiro_motorista_id/veiculo_id/carreta_id/subcontratada_id, sem ON DELETE
-- => RESTRICT), que barram a exclusao com SQLSTATE 23503 — o front ja traduz
-- isso ("Esse registro esta em uso e nao pode ser removido."). So registros
-- nunca referenciados sao de fato apagados.
--
-- Idempotente (regra do projeto): pode ser reexecutada sem erro.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'parceiro_motoristas','parceiro_veiculos','parceiro_carretas','parceiro_subcontratadas'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_parceiro_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (parceiro_id = get_current_parceiro_id())', t || '_parceiro_delete', t);
  END LOOP;
END $$;
