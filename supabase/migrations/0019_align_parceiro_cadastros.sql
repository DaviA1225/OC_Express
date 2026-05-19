-- Migration 0019 — Alinha os cadastros do Portal de Parceiros com os do
-- sistema interno (Fase 8.4 / follow-up do Bloco 5).
--
-- Unifica `cnpj` em `documento` (aceita PF/PJ como o cadastro interno),
-- adiciona `tipo_pessoa` em `parceiro_subcontratadas` e expoe a coluna
-- `subcontratada_parceiro_id` em `parceiro_carretas` (`parceiro_veiculos` ja
-- tinha).
--
-- As colunas `contato_nome`, `contato_telefone` (em parceiro_subcontratadas) e
-- `capacidade_ton` (em parceiro_carretas) ficam dormentes — sem UI no portal,
-- mas mantidas no banco para nao perder dado eventualmente gravado.
--
-- Idempotente (regra do projeto): pode ser reexecutada sem erro.

-- 1. parceiro_subcontratadas: cnpj -> documento + tipo_pessoa ----------------

-- 1a. Renomeia cnpj -> documento, no-op se ja foi feito antes.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'parceiro_subcontratadas'
       and column_name  = 'cnpj'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'parceiro_subcontratadas'
       and column_name  = 'documento'
  ) then
    alter table public.parceiro_subcontratadas rename column cnpj to documento;
  end if;
end$$;

-- 1b. tipo_pessoa (PF/PJ) — coluna + check constraint.
alter table public.parceiro_subcontratadas
  add column if not exists tipo_pessoa text;

alter table public.parceiro_subcontratadas
  drop constraint if exists parceiro_subcontratadas_tipo_pessoa_check;
alter table public.parceiro_subcontratadas
  add constraint parceiro_subcontratadas_tipo_pessoa_check
  check (tipo_pessoa is null or tipo_pessoa in ('PF','PJ'));

-- 1c. Backfill: linhas existentes ganham tipo_pessoa derivado do tamanho do
--     documento (11 digitos = PF, 14 = PJ). Nao mexe em linhas ja preenchidas.
update public.parceiro_subcontratadas
   set tipo_pessoa = case length(regexp_replace(coalesce(documento,''), '\D', '', 'g'))
                       when 11 then 'PF'
                       when 14 then 'PJ'
                       else tipo_pessoa
                     end
 where tipo_pessoa is null
   and documento  is not null;

-- 1d. Troca o unique index — de (parceiro_id, cnpj) para (parceiro_id, documento).
drop index if exists public.uq_parceiro_subcontratadas_cnpj;
create unique index if not exists uq_parceiro_subcontratadas_documento
  on public.parceiro_subcontratadas (parceiro_id, documento)
  where documento is not null;

-- 2. parceiro_carretas: adiciona subcontratada_parceiro_id -------------------

alter table public.parceiro_carretas
  add column if not exists subcontratada_parceiro_id uuid;

alter table public.parceiro_carretas
  drop constraint if exists parceiro_carretas_subcontratada_parceiro_id_fkey;
alter table public.parceiro_carretas
  add constraint parceiro_carretas_subcontratada_parceiro_id_fkey
  foreign key (subcontratada_parceiro_id)
  references public.parceiro_subcontratadas(id)
  on delete set null;

create index if not exists idx_parceiro_carretas_subcontratada
  on public.parceiro_carretas (subcontratada_parceiro_id);
