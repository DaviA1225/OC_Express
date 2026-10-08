-- 0076 — Material obrigatorio fora de "recebida" tambem no RETORNO
--
-- A constraint `solicitacoes_material_obrigatorio_apos_cadastro` (0018) isentava
-- todo retorno (`OR tipo = 'retorno'`). Fazia sentido enquanto o retorno so
-- nascia no interno, que ja exige o material na criacao. Com a 0075 o parceiro
-- abre retorno pelo portal, e ele chega SEM material — como o minerio do
-- parceiro, que a equipe completa no processamento.
--
-- Com a isencao, um retorno sem material conseguia ir para "Em emissao" (a
-- acao em massa da lista nao tinha trava). E sem material o interno nao sabe se
-- a OC exige instrucao: caia no padrao "exige" e oferecia "+ Adicionar
-- instrucao" mesmo para Pedra, Milho e Areia, que dispensam.
--
-- Agora a regra vale para todos os tipos: fora de recebida/cancelada, material
-- e obrigatorio. Conferido no remoto em 08/10/2026 antes desta migration:
-- nenhuma solicitacao fora de recebida/cancelada esta sem material, entao a
-- constraint nasce VALIDADA (e nao NOT VALID como a da 0018).
--
-- Idempotente.

ALTER TABLE solicitacoes
  DROP CONSTRAINT IF EXISTS solicitacoes_material_obrigatorio_apos_cadastro;
ALTER TABLE solicitacoes
  ADD CONSTRAINT solicitacoes_material_obrigatorio_apos_cadastro
  CHECK (
    status IN ('recebida', 'cancelada')
    OR material_id IS NOT NULL
  );

COMMENT ON CONSTRAINT solicitacoes_material_obrigatorio_apos_cadastro ON solicitacoes IS
  'Fora de recebida/cancelada a solicitacao precisa de material — e ele que diz '
  'se a OC exige instrucao. Desde a 0076 vale tambem para o retorno (o parceiro '
  'abre retorno sem material desde a 0075).';
