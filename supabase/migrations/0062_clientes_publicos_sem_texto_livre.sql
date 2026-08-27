-- 0062 — Tira `observacoes_agendamento` de `clientes_publicos`
--
-- A 0061 acrescentou quatro colunas de agendamento a esta view para o portal
-- decidir se oferece o pedido e qual antecedencia exigir. Tres delas sao fatos
-- estruturados do terminal (exige agendamento, nome, antecedencia). A quarta,
-- `observacoes_agendamento`, e TEXTO LIVRE que a equipe interna escreve — o
-- campo cujo placeholder e "Regras que a equipe precisa lembrar na hora de
-- agendar".
--
-- Descoberto ao verificar a 0061 no remoto: `clientes_publicos` responde a role
-- `anon`, isto e, a qualquer pessoa de posse da anon key — que viaja no bundle
-- do front e portanto e publica. Colocar texto livre da operacao ali e o mesmo
-- erro que a 0061 evitou de proposito ao trocar "observacoes internas" por um
-- booleano em `agendamentos`: campo de prosa da equipe nao vai para onde quem
-- nao e da equipe le.
--
-- Nenhum app perde funcao: quem usa `observacoes_agendamento` e so o interno
-- (painel de trabalho e cadastro), e ele le `clientes` direto, nao a view.
--
-- ATENCAO, fora do escopo desta migration: a view inteira ser legivel por
-- `anon` e anterior a 0061 — ja expunha a lista de clientes de minerio (razao
-- social, cidade, UF) a quem tivesse a anon key. Isso continua valendo e merece
-- decisao propria: se nada precisa ler a view sem sessao, o certo e
-- `REVOKE ALL ON clientes_publicos FROM anon`. Nao fazemos aqui porque mudaria
-- um acesso pre-existente sem rastrear todos os consumidores.
--
-- CREATE OR REPLACE VIEW nao aceita REMOVER coluna: por isso o DROP + CREATE.
-- Idempotente.

DROP VIEW IF EXISTS clientes_publicos;

CREATE VIEW clientes_publicos
WITH (security_invoker = false) AS
SELECT id, razao_social, cidade, uf,
       requer_agendamento, terminal_nome, antecedencia_minima_horas
FROM clientes
WHERE ativo = true
  AND cliente_minerio = true;

GRANT SELECT ON clientes_publicos TO authenticated;

COMMENT ON VIEW clientes_publicos IS
  'Clientes ativos de minerio com colunas seguras para o Portal de Parceiros. '
  'Clientes de retorno (cliente_minerio=false) sao filtrados — so a LHG carrega '
  'retorno. Inclui os campos ESTRUTURADOS de agendamento (0061); o texto livre '
  '`observacoes_agendamento` fica de fora de proposito (0062).';

NOTIFY pgrst, 'reload schema';
