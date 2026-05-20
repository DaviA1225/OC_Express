-- Migration 0020 — Anexos acessiveis pelo Portal de Parceiros.
--
-- Hoje as policies de `solicitacao_anexos` e do bucket de storage
-- `solicitacoes-anexos` aceitam qualquer usuario autenticado (heranca do
-- Bloco 2.3, lockdown adiado). Esta migration:
--
-- 1. Cria duas funcoes auxiliares `SECURITY DEFINER` (a leitura cruzada de
--    `solicitacoes` so funciona com privilegio elevado: a tabela nao tem
--    SELECT para parceiros).
-- 2. Restringe a tabela `solicitacao_anexos` a `is_interno()` ou a anexos
--    de solicitacoes que pertencam ao parceiro logado.
-- 3. Restringe o bucket `solicitacoes-anexos` no storage com a mesma logica
--    (path convencional: `{solicitacao_id}/{ts}_{filename}`).
--
-- Idempotente: pode ser reexecutada.

-- 1. Helpers SECURITY DEFINER -------------------------------------------------

CREATE OR REPLACE FUNCTION solicitacao_pertence_ao_parceiro_logado(p_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes
     WHERE id = p_id
       AND origem = 'parceiro'
       AND parceiro_id = get_current_parceiro_id()
  );
$$;

CREATE OR REPLACE FUNCTION storage_anexo_pertence_ao_parceiro_logado(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes
     WHERE id::text = split_part(p_name, '/', 1)
       AND origem = 'parceiro'
       AND parceiro_id = get_current_parceiro_id()
  );
$$;

-- 2. Tabela solicitacao_anexos -----------------------------------------------

DROP POLICY IF EXISTS solicitacao_anexos_select ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_insert ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_update ON solicitacao_anexos;
DROP POLICY IF EXISTS solicitacao_anexos_delete ON solicitacao_anexos;

CREATE POLICY solicitacao_anexos_select ON solicitacao_anexos
  FOR SELECT TO authenticated
  USING (is_interno() OR solicitacao_pertence_ao_parceiro_logado(solicitacao_id));

CREATE POLICY solicitacao_anexos_insert ON solicitacao_anexos
  FOR INSERT TO authenticated
  WITH CHECK (is_interno() OR solicitacao_pertence_ao_parceiro_logado(solicitacao_id));

-- Update so para interno (parceiro nao edita metadados de anexos).
CREATE POLICY solicitacao_anexos_update ON solicitacao_anexos
  FOR UPDATE TO authenticated
  USING (is_interno())
  WITH CHECK (is_interno());

CREATE POLICY solicitacao_anexos_delete ON solicitacao_anexos
  FOR DELETE TO authenticated
  USING (is_interno() OR solicitacao_pertence_ao_parceiro_logado(solicitacao_id));

-- 3. Storage bucket solicitacoes-anexos --------------------------------------

DROP POLICY IF EXISTS "solicitacoes_anexos_select" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_insert" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_update" ON storage.objects;
DROP POLICY IF EXISTS "solicitacoes_anexos_delete" ON storage.objects;

CREATE POLICY "solicitacoes_anexos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'solicitacoes-anexos' AND (
      is_interno() OR storage_anexo_pertence_ao_parceiro_logado(name)
    )
  );

CREATE POLICY "solicitacoes_anexos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'solicitacoes-anexos' AND (
      is_interno() OR storage_anexo_pertence_ao_parceiro_logado(name)
    )
  );

CREATE POLICY "solicitacoes_anexos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'solicitacoes-anexos' AND is_interno())
  WITH CHECK (bucket_id = 'solicitacoes-anexos' AND is_interno());

CREATE POLICY "solicitacoes_anexos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'solicitacoes-anexos' AND (
      is_interno() OR storage_anexo_pertence_ao_parceiro_logado(name)
    )
  );
