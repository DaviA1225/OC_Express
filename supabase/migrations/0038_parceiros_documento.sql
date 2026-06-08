-- 0038 — Parceiro: documento unificado (aceita CPF ou CNPJ)
--
-- Ate aqui o cadastro de parceiro so aceitava CNPJ (coluna `cnpj`, UNIQUE NOT
-- NULL). Passamos a aceitar tambem PF (CPF) — ha parceiros que operam como
-- pessoa fisica / autonomo. Replica exatamente o que a 0019 fez em
-- `parceiro_subcontratadas`: renomeia `cnpj` -> `documento` e adiciona
-- `tipo_pessoa` (PF/PJ).
--
-- A coluna segue UNIQUE NOT NULL: todo parceiro tem um documento. O front
-- valida CPF/CNPJ (isValidDocumento) e deriva o tipo_pessoa.
--
-- Idempotente (regra do projeto): pode ser reexecutada sem erro.

-- 1. Renomeia cnpj -> documento, no-op se ja foi feito antes.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'parceiros'
       and column_name  = 'cnpj'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'parceiros'
       and column_name  = 'documento'
  ) then
    alter table public.parceiros rename column cnpj to documento;
  end if;
end$$;

-- 2. tipo_pessoa (PF/PJ) — coluna + check constraint.
alter table public.parceiros
  add column if not exists tipo_pessoa text;

alter table public.parceiros
  drop constraint if exists parceiros_tipo_pessoa_check;
alter table public.parceiros
  add constraint parceiros_tipo_pessoa_check
  check (tipo_pessoa is null or tipo_pessoa in ('PF','PJ'));

-- 3. Backfill: linhas existentes ganham tipo_pessoa derivado do tamanho do
--    documento (11 digitos = PF, 14 = PJ). Nao mexe em linhas ja preenchidas.
update public.parceiros
   set tipo_pessoa = case length(regexp_replace(coalesce(documento,''), '\D', '', 'g'))
                       when 11 then 'PF'
                       when 14 then 'PJ'
                       else tipo_pessoa
                     end
 where tipo_pessoa is null
   and documento  is not null;

-- O indice UNIQUE de `cnpj` (parceiros_cnpj_key, criado em 0018) acompanha o
-- rename da coluna automaticamente — segue garantindo documento unico. Nao ha
-- nada a recriar aqui.
