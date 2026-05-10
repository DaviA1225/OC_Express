-- =============================================
-- SisLog — Realtime: habilitar publicação para colaboração ao vivo
-- =============================================
-- Garante que solicitacoes e cargas_retorno disparam eventos via supabase_realtime
-- para que mudanças apareçam em todas as sessões abertas em tempo real.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'solicitacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE solicitacoes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cargas_retorno'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cargas_retorno;
  END IF;
END $$;
