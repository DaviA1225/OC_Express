-- 0070 — Aceite do Termo de Uso e Confidencialidade (LGPD)
--
-- Quem usa o SisLog nao e o titular dos dados que ele guarda. O titular e o
-- MOTORISTA (nome, CPF, telefone); o usuario do sistema — atendente da LHG ou
-- funcionario do parceiro — e quem MANEJA esse dado. Isso decide a natureza
-- desta tabela, e vale registrar antes que alguem a leia errado:
--
--   NAO e consentimento do art. 8. A base legal do tratamento dos dados do
--   motorista e a execucao do contrato de transporte e a obrigacao legal do
--   frete (art. 7, V e II) — nao o consentimento de ninguem. Guardar um
--   "aceite" e chama-lo de consentimento faria o sistema AFIRMAR uma base
--   legal que ele nao usa, e enfraqueceria a que ele de fato usa.
--
--   E o registro de que o usuario leu e assumiu o dever de confidencialidade
--   e uso minimo — medida de seguranca e governanca do art. 46/50, e prova de
--   que a LHG instruiu quem opera. Do lado do proprio usuario, o texto tambem
--   serve de aviso de privacidade sobre os dados DELE (nome, e-mail, trilha de
--   acesso), esses sim tratados pelo sistema.
--
-- Uma linha por usuario POR VERSAO: mudou o texto, o aceite anterior nao vale
-- para o novo, e o modal reaparece. Sem UPDATE nem DELETE — aceite e um fato
-- datado, nao um campo editavel.
--
-- Escrita so pela RPC, como em `registrar_acesso` (0059) e `eventos_portal`
-- (0021): `origem` vem de `is_interno()` no servidor, nunca do payload, senao o
-- proprio cliente escolheria de que lado ele parece estar.
--
-- SEM ip e SEM user_agent, ao contrario de `log_acesso`. Ali eles duram 1 ano e
-- servem para investigar acesso indevido; aqui a linha vive enquanto a conta
-- viver, e para provar aceite bastam QUEM, QUAL VERSAO e QUANDO. Minimizacao
-- (art. 6, III), mesma linha da 0055.
--
-- Idempotente.

-- ============================================================
-- 1. Tabela
-- ============================================================

CREATE TABLE IF NOT EXISTS termos_aceite (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Versao do texto aceito (ex.: '2026-09-01'). O app compara com a constante
  -- em `packages/shared/src/termos.ts` — se nao bater, o modal volta.
  versao     text NOT NULL,
  -- De qual app o aceite veio. Como cada pessoa usa um lado so, este campo
  -- tambem diz qual TEXTO ela leu (interno x parceiro).
  origem     text NOT NULL CHECK (origem IN ('interno', 'portal')),
  aceito_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, versao)
);

CREATE INDEX IF NOT EXISTS idx_termos_aceite_user ON termos_aceite (user_id);

COMMENT ON TABLE termos_aceite IS
  'Registro de que o usuario leu e aceitou o Termo de Uso e Confidencialidade. '
  'NAO e consentimento de titular (art. 8): e prova de instrucao ao operador '
  '(art. 46/50). Texto e versao vivem em packages/shared/src/termos.ts.';

-- ON DELETE CASCADE: excluida a conta, some o aceite junto. E o oposto do
-- `log_auditoria` (que guarda 5 anos por obrigacao fiscal) de proposito — o
-- aceite existe para regular um acesso que deixou de existir, e mante-lo seria
-- guardar dado de quem saiu sem finalidade que o justifique.

-- ============================================================
-- 2. RLS
-- ============================================================
-- SELECT: a propria linha (o app precisa saber se JA aceitou) e os perfis que
-- ja enxergam a auditoria, para conferir quem aceitou o que.
--
-- Nenhuma policy de INSERT/UPDATE/DELETE: escrita so pela RPC abaixo. Sem
-- policy, o RLS nega por padrao.

ALTER TABLE termos_aceite ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS termos_aceite_select ON termos_aceite;
CREATE POLICY termos_aceite_select ON termos_aceite
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT meu_perfil_interno()) IN ('admin', 'gerente', 'supervisor')
  );

-- ============================================================
-- 3. registrar_aceite_termos — unico caminho de escrita
-- ============================================================
-- Devolve o id da linha (nova ou ja existente). Diferente de `registrar_acesso`,
-- esta NAO e fire-and-forget: o app precisa saber que gravou antes de liberar a
-- tela, senao o modal voltaria a cada carregamento e ninguem sairia do lugar.
-- Por isso ela levanta excecao em vez de engolir erro.

CREATE OR REPLACE FUNCTION registrar_aceite_termos(p_versao text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_versao text := NULLIF(btrim(left(p_versao, 40)), '');
  v_origem text;
  v_id     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessao nao identificada.' USING ERRCODE = '42501';
  END IF;

  IF v_versao IS NULL THEN
    RAISE EXCEPTION 'Versao do termo nao informada.' USING ERRCODE = '22004';
  END IF;

  v_origem := CASE WHEN is_interno() THEN 'interno' ELSE 'portal' END;

  -- Reaceitar a mesma versao nao cria linha nova nem falha: o aceite ja
  -- registrado continua valendo, com a data original. Duas abas abertas
  -- clicando "Aceito" nao podem virar erro na cara do usuario.
  INSERT INTO termos_aceite (user_id, versao, origem)
  VALUES (v_user, v_versao, v_origem)
  ON CONFLICT (user_id, versao) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM termos_aceite
     WHERE user_id = v_user AND versao = v_versao;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION registrar_aceite_termos(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION registrar_aceite_termos(text) TO authenticated;

COMMENT ON FUNCTION registrar_aceite_termos(text) IS
  'Registra o aceite do termo pelo usuario logado. `origem` vem do servidor '
  '(is_interno()), nunca do payload.';

NOTIFY pgrst, 'reload schema';
