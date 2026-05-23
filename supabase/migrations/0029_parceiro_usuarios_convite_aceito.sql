-- 0029 — Marca quando o convite do parceiro_usuario foi aceito
--
-- Hoje o admin do parceiro convida um operador e não tem visibilidade de se
-- a pessoa já clicou no link e definiu a senha — `parceiro_usuarios.ativo` é
-- só "o admin desligou ou não", e `auth.users.last_sign_in_at` fica fora da
-- visão do parceiro (sem SELECT nas tabelas do schema auth).
--
-- Solução: coluna `convite_aceito_em timestamptz` nullable em
-- `parceiro_usuarios`, populada pelo próprio convidado via RPC quando ele
-- termina o fluxo de /aceitar-convite (depois do updateUser({password})
-- retornar OK). A UI então mostra "Aguardando" enquanto NULL e "Ativo" depois.
--
-- Backfill: para usuários que JÁ logaram pelo menos uma vez antes desta
-- migration, copia `auth.users.last_sign_in_at` (o melhor proxy disponível).
-- Para o cofundador/admin original do parceiro que foi seedado manualmente
-- sem passar pelo convite, isso garante que ele apareça como "Ativo" e não
-- "Aguardando" perpetuamente.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, UPDATE só onde NULL, CREATE OR REPLACE.

-- ============================================================
-- 1. Coluna nova
-- ============================================================

ALTER TABLE parceiro_usuarios
  ADD COLUMN IF NOT EXISTS convite_aceito_em timestamptz;

COMMENT ON COLUMN parceiro_usuarios.convite_aceito_em IS
  'Quando o convidado abriu o link e definiu a senha pela primeira vez. NULL = ainda pendente.';

-- ============================================================
-- 2. Backfill — para quem já logou alguma vez
-- ============================================================
-- Só roda em linhas onde a coluna ainda está NULL (idempotente).
-- Lê `auth.users.last_sign_in_at` — não precisa estar exatamente no momento
-- do aceite; é o melhor proxy para usuários pré-existentes.

UPDATE parceiro_usuarios pu
SET convite_aceito_em = au.last_sign_in_at
FROM auth.users au
WHERE pu.user_id = au.id
  AND pu.convite_aceito_em IS NULL
  AND au.last_sign_in_at IS NOT NULL;

-- ============================================================
-- 3. RPC marcar_meu_convite_aceito
-- ============================================================
-- SECURITY DEFINER porque o caller (parceiro_usuario recém-logado) tem
-- policy de UPDATE em parceiro_usuarios só para o próprio parceiro_id +
-- não-escalonamento de perfil — não dá pra autoaprovar via UPDATE direto
-- sem expandir a policy. Aqui o SECURITY DEFINER faz exatamente uma coisa
-- segura: marca a própria linha (filtra por auth.uid()) e só se ainda NULL.
--
-- Não recebe parâmetros: o caller é sempre "eu mesmo". Idempotente: chamar
-- duas vezes não muda nada (WHERE convite_aceito_em IS NULL).

CREATE OR REPLACE FUNCTION marcar_meu_convite_aceito()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE parceiro_usuarios
  SET convite_aceito_em = v_now
  WHERE user_id = v_uid
    AND convite_aceito_em IS NULL;

  -- Retorna o valor atual (após o UPDATE) — útil pro cliente confirmar.
  -- Se o UPDATE não pegou nada (já marcado, ou usuário não é parceiro),
  -- devolve o que já estava lá (ou NULL).
  RETURN (
    SELECT convite_aceito_em FROM parceiro_usuarios WHERE user_id = v_uid LIMIT 1
  );
END;
$$;

-- Permitir invocar via PostgREST.
GRANT EXECUTE ON FUNCTION marcar_meu_convite_aceito() TO authenticated;
