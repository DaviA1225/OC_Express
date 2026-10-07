-- 0074 — Layout preferido por usuário (modo ERP, fase 1)
--
-- O SisLog vai migrar aos poucos para um layout de ERP (barra de módulos fixa,
-- barra de status, atalhos de teclado). A equipe está acostumada com o visual
-- atual, então o novo layout entra OPT-IN: cada pessoa liga para si, e o
-- clássico continua sendo o padrão de todo mundo.
--
-- A escolha mora no cadastro, e não no navegador como a densidade: ela tem de
-- seguir a pessoa entre os computadores do pátio e do escritório.
--
-- Na fase 1 só admin e analista podem ligar o modo ERP — o grupo piloto que
-- vai dar retorno. A trava fica no servidor (a função abaixo), não só na tela.
--
-- Idempotente.

ALTER TABLE perfis_usuarios
  ADD COLUMN IF NOT EXISTS layout_preferido text NOT NULL DEFAULT 'classico';

ALTER TABLE perfis_usuarios DROP CONSTRAINT IF EXISTS perfis_usuarios_layout_preferido_check;
ALTER TABLE perfis_usuarios ADD CONSTRAINT perfis_usuarios_layout_preferido_check
  CHECK (layout_preferido IN ('classico', 'erp'));

-- ============================================================
-- RPC: o usuário troca só o PRÓPRIO layout
-- ============================================================
-- O UPDATE em perfis_usuarios é admin-only (0025), para ninguém escalar o
-- próprio `perfil` pela API. Mesmo desenho do `atualizar_meu_nome`: a função
-- toca uma coluna só, da própria linha.
--
-- Voltar ao clássico é sempre permitido, para qualquer perfil — se alguém for
-- rebaixado de analista com o ERP ligado, precisa conseguir sair dele.

CREATE OR REPLACE FUNCTION definir_meu_layout(p_layout text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_layout IS NULL OR p_layout NOT IN ('classico', 'erp') THEN
    RAISE EXCEPTION 'layout invalido: %', p_layout USING ERRCODE = 'check_violation';
  END IF;

  IF p_layout = 'erp' AND COALESCE(meu_perfil_interno(), '') NOT IN ('admin', 'analista') THEN
    RAISE EXCEPTION 'forbidden: o modo ERP esta em piloto (admin e analista)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE perfis_usuarios
     SET layout_preferido = p_layout
   WHERE user_id = auth.uid() AND ativo = true;
END;
$$;

REVOKE ALL ON FUNCTION definir_meu_layout(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION definir_meu_layout(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
