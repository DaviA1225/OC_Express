-- 0026 — Bucket ocs-pdf privado (endurecimento pós-testes / TODO.md)
--
-- O PDF da OC contém dado sensível (nome/CPF do motorista, placas, cliente).
-- Até aqui o bucket `ocs-pdf` era PÚBLICO (0001) e o front guardava a URL
-- pública permanente em `solicitacoes.pdf_url` — qualquer pessoa com o link
-- (ou adivinhando o nome do arquivo) abria o PDF sem login, para sempre.
--
-- Esta migration torna o bucket privado e restringe o acesso direto ao time
-- interno. O front passa a:
--   - guardar o PATH do arquivo em pdf_url (não mais a URL pública);
--   - gerar signed URL curto (1h) no "Abrir PDF" interno;
--   - gerar signed URL de 7 dias no momento de enviar pelo WhatsApp.
-- Signed URLs são pré-assinados: funcionam para o destinatário externo (sem
-- login) só durante a validade, e deixam de ser permanentes/adivinháveis.
--
-- Parceiros do portal NÃO acessam PDFs de OC (a view portal_solicitacoes não
-- expõe pdf_url), por isso as policies exigem apenas is_interno().
--
-- Script idempotente: pode ser reexecutado sem erro.

-- 1. Tornar o bucket privado ---------------------------------------------------
-- ATENÇÃO: em alguns projetos o role do editor SQL não é owner de
-- `storage.buckets` e este UPDATE levanta `insufficient_privilege`, o que
-- ABORTARIA a transação inteira (as policies abaixo nunca aplicariam). Por isso
-- envolvemos num bloco que tolera a falta de privilégio. Se cair no NOTICE,
-- ajuste o bucket para privado pelo Dashboard (Storage → ocs-pdf → Make private)
-- ou via Storage API: supabase.storage.updateBucket('ocs-pdf', { public: false }).
DO $$
BEGIN
  UPDATE storage.buckets SET public = false WHERE id = 'ocs-pdf';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem privilégio para alterar storage.buckets via SQL. Torne o bucket ocs-pdf privado pelo Dashboard ou Storage API.';
END $$;

-- 2. Policies do storage: somente time interno --------------------------------
-- (as policies da 0001 eram `bucket_id = 'ocs-pdf'` para qualquer authenticated)
DROP POLICY IF EXISTS "ocs_pdf_select" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_insert" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_update" ON storage.objects;
DROP POLICY IF EXISTS "ocs_pdf_delete" ON storage.objects;

CREATE POLICY "ocs_pdf_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ocs-pdf' AND is_interno());
CREATE POLICY "ocs_pdf_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ocs-pdf' AND is_interno());
CREATE POLICY "ocs_pdf_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ocs-pdf' AND is_interno())
  WITH CHECK (bucket_id = 'ocs-pdf' AND is_interno());
CREATE POLICY "ocs_pdf_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ocs-pdf' AND is_interno());
