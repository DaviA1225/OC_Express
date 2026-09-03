-- 0073 — Observacao da equipe PARA O PARCEIRO no agendamento
--
-- Pedido da operacao: depois de anexar comprovante, contrato e PDF da NF, a
-- equipe precisa de um espaco para escrever um recado que vai junto com os
-- documentos — "o terminal so recebe ate 16h", "levar a via impressa", "a
-- janela mudou porque o portao 3 fechou". Hoje isso sai por WhatsApp e nao
-- fica em lugar nenhum.
--
-- CUIDADO COM O NOME. A 0061 tirou de proposito o campo "observacoes internas"
-- desta tabela (virou o booleano `hora_fora_da_grade`), com o argumento de que
-- texto livre da equipe numa linha que o parceiro le pelo RLS vaza na primeira
-- vez que alguem escrever ali. Esta coluna NAO desfaz aquela decisao: ela e o
-- contrario dela — texto ENDERECADO ao parceiro. O nome
-- `observacoes_para_parceiro` (e nao `observacoes_equipe`, que soaria como o
-- `observacoes_internas` de `solicitacoes`) existe para que ninguem a confunda
-- com um bloco de rascunho da operacao. A tela reforca: rotulo "Observacao para
-- o parceiro" e a frase "o parceiro le isto no portal".
--
-- Anotacao interna que o parceiro NAO pode ler continua sem lugar aqui — e
-- segue sendo assim de proposito.
--
-- Sem policy nova: `agendamentos_parceiro_select` (0061) ja da SELECT na linha
-- inteira ao parceiro dono. E sem mudanca de trigger: o parceiro nao tem
-- INSERT nem UPDATE na tabela (escreve so pelas RPCs da 0061/0065, todas com
-- lista fixa de colunas), entao nao ha como forjar o campo na entrada.
--
-- O reagendamento (`agendamento_reagendar`) NAO copia esta coluna para a linha
-- nova, e e o certo: o recado explica a janela e os documentos DAQUELE
-- agendamento. Pedido novo comeca sem recado.
--
-- Quando o parceiro passa a ver: a tela do portal so mostra o recado quando o
-- agendamento esta `agendado`, a mesma regra dos documentos (0064) — o pacote
-- chega inteiro de uma vez, nunca em partes.
--
-- Idempotente: pode ser reexecutada sem erro.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS observacoes_para_parceiro text;

COMMENT ON COLUMN agendamentos.observacoes_para_parceiro IS
  'Recado da equipe interna ENDERECADO ao parceiro, escrito no painel junto '
  'com os documentos e lido por ele no portal quando o agendamento e '
  'concluido. Nao e campo de anotacao interna: a linha inteira e legivel pelo '
  'parceiro dono (0061).';

-- Teto de tamanho: e um recado ao lado do comprovante, nao um relatorio. O
-- front trava em 1000 no `maxLength`; o CHECK garante o mesmo para qualquer
-- outro caminho de escrita.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_obs_parceiro_tamanho'
  ) THEN
    ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_obs_parceiro_tamanho
      CHECK (observacoes_para_parceiro IS NULL
             OR char_length(observacoes_para_parceiro) <= 1000);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
