-- 0060 — Fila de remoção no storage: anexo apagado não pode sobreviver ao
--        registro (achado 4 da auditoria LGPD)
--
-- O banco e o storage do Supabase são sistemas separados, sem transação em
-- comum. Hoje, quando uma linha de `solicitacao_anexos` some, o ARQUIVO fica:
--
--   • Exclusão explícita (useAnexos.useDeleteAnexo): o app apaga a linha e
--     depois o arquivo. Se o segundo passo falha, sobra um `console.warn` e um
--     arquivo órfão — ninguém fica sabendo.
--   • CASCADE: `solicitacao_anexos.solicitacao_id` é ON DELETE CASCADE. Apagar
--     uma solicitação leva as linhas embora e deixa 100% dos arquivos no
--     bucket, sem nada apontando para eles. Hoje o app não apaga solicitação
--     (conferido: nenhum DELETE em `solicitacoes` no front), então isso é risco
--     futuro e não dívida acumulada — mas o dia em que alguém apagar uma
--     solicitação pelo SQL Editor, os anexos dela viram órfãos silenciosos.
--
-- Um arquivo órfão não é lixo neutro: são CRLV, CNH, prints de WhatsApp —
-- dado pessoal que continua guardado depois de o usuário achar que apagou.
--
-- A correção NÃO pode ser "apagar do storage pelo trigger": Postgres não fala
-- com a Storage API. O que dá para fazer no banco é garantir que a dívida
-- fique REGISTRADA em vez de silenciosa. A partir daqui, toda linha de anexo
-- que some deixa uma pendência aqui, e o que o app conseguir apagar ele marca
-- como resolvido. O que sobrar com `removido_em IS NULL` é a lista de órfãos.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS storage_remocao_pendente (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket       text NOT NULL,
  path         text NOT NULL,
  motivo       text NOT NULL,
  solicitacao_id uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  removido_em  timestamptz,
  erro         text
);

-- Um mesmo path pode reentrar na fila se a remoção falhar e a linha for
-- recriada; o índice parcial mantém no máximo uma pendência ABERTA por path.
CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_remocao_pendente_aberta
  ON storage_remocao_pendente (bucket, path)
  WHERE removido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_storage_remocao_pendente_abertas
  ON storage_remocao_pendente (created_at)
  WHERE removido_em IS NULL;

-- ============================================================
-- Trigger: toda linha de anexo que some vira pendência
-- ============================================================
-- AFTER DELETE cobre os dois caminhos (explícito e CASCADE) — é justamente a
-- vantagem de estar no banco e não no app.

CREATE OR REPLACE FUNCTION enfileirar_remocao_anexo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO storage_remocao_pendente (bucket, path, motivo, solicitacao_id)
  VALUES ('solicitacoes-anexos', OLD.storage_path, TG_OP, OLD.solicitacao_id)
  ON CONFLICT DO NOTHING;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Rede de proteção: enfileirar é serviço de limpeza, não pode abortar a
  -- exclusão que o usuário pediu nem o CASCADE de uma solicitação.
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_anexo_enfileira_remocao ON solicitacao_anexos;
CREATE TRIGGER trg_anexo_enfileira_remocao
  AFTER DELETE ON solicitacao_anexos
  FOR EACH ROW EXECUTE FUNCTION enfileirar_remocao_anexo();

-- ============================================================
-- RLS + função de baixa
-- ============================================================
-- Leitura para quem já vê auditoria. Sem policy de escrita: a baixa passa pela
-- função SECURITY DEFINER, para o app não conseguir marcar como removido o que
-- não removeu de fato.

ALTER TABLE storage_remocao_pendente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_remocao_pendente_select ON storage_remocao_pendente;
CREATE POLICY storage_remocao_pendente_select ON storage_remocao_pendente
  FOR SELECT TO authenticated
  USING (meu_perfil_interno() IN ('admin', 'gerente', 'supervisor'));

CREATE OR REPLACE FUNCTION marcar_storage_removido(
  p_path  text,
  p_erro  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_path IS NULL THEN
    RETURN;
  END IF;
  IF p_erro IS NULL THEN
    UPDATE storage_remocao_pendente
       SET removido_em = now(), erro = NULL
     WHERE path = p_path AND removido_em IS NULL;
  ELSE
    -- Falhou: mantém aberta e guarda o motivo, para a varredura saber o porquê.
    UPDATE storage_remocao_pendente
       SET erro = left(p_erro, 500)
     WHERE path = p_path AND removido_em IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION marcar_storage_removido(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION marcar_storage_removido(text, text) TO authenticated;

COMMENT ON TABLE storage_remocao_pendente IS
  'Arquivos cujo registro em solicitacao_anexos foi apagado. removido_em NULL '
  '= ainda no bucket (orfao). Banco e storage nao compartilham transacao, '
  'entao a garantia possivel e registrar a divida, nao evita-la (0060).';

-- ============================================================
-- Como varrer os órfãos
-- ============================================================
--   SELECT bucket, path, motivo, created_at, erro
--     FROM storage_remocao_pendente
--    WHERE removido_em IS NULL
--    ORDER BY created_at;
--
-- Para cada path, apagar pelo Dashboard (Storage) ou pela Storage API e, em
-- seguida, `SELECT marcar_storage_removido('<path>')`.

NOTIFY pgrst, 'reload schema';
