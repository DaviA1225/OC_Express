/**
 * Versão do SisLog, em um lugar só.
 *
 * Estava duplicada em dois `const APP_VERSION` do app interno (a barra lateral
 * e o rodapé do login), o que garante divergência com o tempo: alguém sobe uma
 * e esquece a outra, e o suporte passa a receber duas respostas para "qual
 * versão você está usando?".
 *
 * NÃO confundir com `TERMOS_VERSAO` (`./termos`). São coisas diferentes de
 * propósito: esta muda a cada release; aquela só quando o texto do termo muda,
 * e mudá-la faz todo mundo aceitar de novo. Amarrar uma na outra obrigaria a
 * operação inteira a reaceitar o termo a cada correção de bug.
 */
export const SISLOG_VERSAO = '1.5.1'
