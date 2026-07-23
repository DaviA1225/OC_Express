-- 0046 — Pendência interna: permite pendência em solicitação SEM parceiro
--
-- A 0035 criou `solicitacao_pendencias` só para o loop com o parceiro:
-- `parceiro_id` era NOT NULL e o trigger `pendencia_preencher_insert()` abortava
-- o insert quando a solicitação não tinha parceiro (origem interna). Agora a
-- equipe também precisa marcar pendência em solicitações de origem INTERNA —
-- apenas como alerta/flag que a própria equipe abre e resolve (não há parceiro
-- no loop). Para isso, `parceiro_id` passa a aceitar NULL.
--
-- O trigger não muda: ele já faz `SELECT parceiro_id INTO NEW.parceiro_id FROM
-- solicitacoes ...`, que para uma solicitação interna resulta em NULL — antes o
-- NOT NULL abortava, agora é aceito.
--
-- Segurança: as policies do parceiro casam por
-- `parceiro_id = get_current_parceiro_id()`. Com `parceiro_id` NULL essa
-- comparação nunca é verdadeira (NULL = x → NULL, tratado como falso pela RLS),
-- então o parceiro continua SEM enxergar pendências internas. O time interno
-- (policy `pendencias_interno_all`) segue com acesso total.
--
-- Idempotente: DROP NOT NULL é no-op se a coluna já for anulável.

ALTER TABLE solicitacao_pendencias
  ALTER COLUMN parceiro_id DROP NOT NULL;

COMMENT ON COLUMN solicitacao_pendencias.parceiro_id IS
  'Denormalizado da solicitacao (trigger). NULL quando a solicitacao e de origem '
  'interna (pendencia que a propria equipe abre e resolve). Chave do RLS do '
  'parceiro — NULL nunca casa, entao o parceiro nao ve pendencias internas.';

NOTIFY pgrst, 'reload schema';
