-- 0024 — Busca global sem acento (unaccent)
--
-- A busca global (apps/interno/.../useGlobalSearch.ts) usava ilike direto nas
-- colunas de texto. No Postgres o ilike é case-insensitive mas SENSÍVEL a
-- acento: buscar "jose" não encontrava "josé", "graos" não achava "grãos".
--
-- Solução: um wrapper IMMUTABLE de unaccent + colunas geradas `*_unaccent`
-- nas tabelas pesquisáveis. O cliente desacentua o termo e filtra por essas
-- colunas, então a comparação fica sem acento dos dois lados.
--
-- Idempotente: extensão IF NOT EXISTS, função CREATE OR REPLACE, colunas via
-- ADD COLUMN IF NOT EXISTS. Reexecutável sem erro.

-- ============================================================
-- 1. Extensão unaccent (schema padrão de extensões no Supabase)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ============================================================
-- 2. Wrapper IMMUTABLE de unaccent
-- ============================================================
-- O unaccent() nativo é STABLE (o dicionário pode mudar), então não pode ser
-- usado em coluna gerada STORED. Fixar o dicionário explicitamente e qualificar
-- tudo pelo schema o torna determinístico o suficiente para ser IMMUTABLE.
CREATE OR REPLACE FUNCTION public.imm_unaccent(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, txt)
$$;

-- ============================================================
-- 3. Colunas geradas *_unaccent nas tabelas pesquisáveis
-- ============================================================
-- Colunas geradas STORED: herdam a RLS da própria tabela (sem policy nova) e
-- são mantidas pelo Postgres a cada INSERT/UPDATE. veiculos/carretas usam só
-- placa (sem acento) e seguem com ilike direto — não precisam de coluna nova.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS razao_social_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(razao_social)) STORED;

ALTER TABLE subcontratadas
  ADD COLUMN IF NOT EXISTS razao_social_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(razao_social)) STORED;

ALTER TABLE motoristas
  ADD COLUMN IF NOT EXISTS nome_completo_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(nome_completo)) STORED;

ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS nome_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(nome)) STORED;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS solicitante_nome_unaccent text
  GENERATED ALWAYS AS (public.imm_unaccent(solicitante_nome)) STORED;
