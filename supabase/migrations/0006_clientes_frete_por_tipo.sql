-- Substitui frete_ton por dois campos separados (caçamba e graneleiro).
-- Copia o valor existente para ambos os tipos como ponto de partida — o usuário
-- ajusta caso a caso depois. A coluna antiga permanece para histórico.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS frete_cacamba numeric,
  ADD COLUMN IF NOT EXISTS frete_graneleiro numeric;

UPDATE clientes
   SET frete_cacamba    = COALESCE(frete_cacamba,    frete_ton),
       frete_graneleiro = COALESCE(frete_graneleiro, frete_ton)
 WHERE frete_ton IS NOT NULL;
