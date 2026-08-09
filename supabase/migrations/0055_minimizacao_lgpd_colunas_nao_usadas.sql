-- 0055 — Minimização LGPD: remove colunas de dado pessoal que nunca são usadas
--
-- Origem: auditoria LGPD de 09/08/2026. O art. 6º, III da LGPD (minimização)
-- limita o tratamento ao "mínimo necessário para a realização das finalidades".
-- Estas nove colunas guardam dado pessoal e NÃO têm finalidade nenhuma no
-- sistema: nenhuma aparece em formulário, listagem, relatório, PDF, exportação
-- CSV ou regra de RLS. Foram criadas na 0001/0018 espelhando a SPEC e a UI
-- nunca as implementou.
--
-- Varredura feita antes de escrever esta migration (grep em apps/interno,
-- apps/portal, packages/shared e supabase/): zero referências em código vivo.
--
-- Contagem no REMOTO antes do drop (somente leitura, 09/08/2026):
--
--   motoristas.rg                          1 preenchida / 1.206 linhas
--   motoristas.antt                        1 preenchida / 1.206 linhas
--   motoristas.subcontratada_id            0 preenchidas
--   parceiro_motoristas.rg                 0 preenchidas / 642 linhas
--   parceiro_motoristas.antt               0 preenchidas / 642 linhas
--   subcontratadas.contato_nome            0 preenchidas / 586 linhas
--   subcontratadas.contato_telefone        0 preenchidas / 586 linhas
--   parceiro_subcontratadas.contato_nome   0 preenchidas / 427 linhas
--   parceiro_subcontratadas.contato_telefone 0 preenchidas / 427 linhas
--
-- A ÚNICA linha preenchida era o motorista fictício do seed 0002 ("Pedro
-- Henrique Lima", CPF 333.666.999-57, inativo, sem solicitação vinculada) —
-- dado de teste, não dado real. Nenhum dado de produção foi perdido aqui.
-- Essa linha foi apagada do remoto em 09/08/2026, no mesmo trabalho (era o
-- último resíduo do seed: os outros 4 motoristas e as 3 subcontratadas já
-- tinham sido limpos antes).
--
-- JÁ APLICADA MANUALMENTE no remoto em 09/08/2026, pelo SQL Editor, ANTES de
-- entrar no repositório — `supabase migration list` mostrava `local 0055 /
-- remote ""` com o DDL já valendo. Quando a CI rodar o `db push` no merge, os
-- DROP ... IF EXISTS viram no-op e o único efeito é registrar a migration no
-- ledger, alinhando repositório e banco. É para isso que a regra de migration
-- idempotente do projeto existe.
--
-- RG é o caso mais grave dos nove: identificador civil coletado no schema,
-- nunca exibido, nunca usado.
--
-- ATENÇÃO — armadilha de replay: `motoristas.subcontratada_id` tinha o índice
-- `idx_motoristas_subcontratada` (0001). DROP COLUMN derruba o índice junto,
-- então o `CREATE INDEX IF NOT EXISTS ... ON motoristas(subcontratada_id)` do
-- cumulative-schema passaria a falhar num replay ("column does not exist") — e,
-- como o SQL Editor roda tudo numa transação, derrubaria o replay inteiro. A
-- linha correspondente foi removida do cumulative-schema.sql no mesmo commit.
-- As colunas `subcontratada_id` de veiculos, carretas e solicitacoes NÃO são
-- tocadas: essas estão em uso.
--
-- Script idempotente: DROP COLUMN IF EXISTS pode ser reexecutado sem erro.

-- ---------- motoristas ----------
ALTER TABLE motoristas
  DROP COLUMN IF EXISTS rg,
  DROP COLUMN IF EXISTS antt,
  DROP COLUMN IF EXISTS subcontratada_id;

-- ---------- parceiro_motoristas ----------
ALTER TABLE parceiro_motoristas
  DROP COLUMN IF EXISTS rg,
  DROP COLUMN IF EXISTS antt;

-- ---------- subcontratadas ----------
ALTER TABLE subcontratadas
  DROP COLUMN IF EXISTS contato_nome,
  DROP COLUMN IF EXISTS contato_telefone;

-- ---------- parceiro_subcontratadas ----------
-- Marcadas "colunas dormentes (Fase 8.4)" em database.types.ts: mantidas "para
-- nao perder dado" após o alinhamento com o interno. Dado que nunca existiu —
-- as 427 linhas têm as duas colunas nulas.
ALTER TABLE parceiro_subcontratadas
  DROP COLUMN IF EXISTS contato_nome,
  DROP COLUMN IF EXISTS contato_telefone;

-- PostgREST guarda o schema em cache; sem isto o app continua anunciando as
-- colunas removidas e um select antigo devolve "column ... does not exist".
NOTIFY pgrst, 'reload schema';
