/**
 * Helpers de montagem de filtros do PostgREST.
 *
 * Motivo de existir: a cláusula `or=(...)` é montada como STRING, e o PostgREST
 * separa os filtros por vírgula de topo. Um termo de busca digitado pelo
 * usuário ("SILVA, JOÃO", "TRANSPORTES (MS)") entrava cru nessa string e
 * quebrava o parser — a query inteira voltava 400 e a tela ficava em erro.
 *
 * A regra do PostgREST: valores com vírgula, ponto, parênteses ou aspas
 * precisam vir entre aspas duplas, com `"` e `\` internos escapados por
 * barra invertida.
 *
 * Cuidado com a ORDEM do escape (as duas camadas usam a mesma barra):
 *   1. LIKE   — `%` e `_` são curingas; viram `\%` e `\_` para casar literal.
 *   2. String — a barra da etapa 1 é significativa para o parser do PostgREST,
 *      então precisa ser dobrada, junto com as aspas.
 * Inverter isso faz a barra do passo 1 ser comida pelo parser e o `%` volta a
 * ser curinga.
 */

/** Escapa os curingas do LIKE/ILIKE para que casem como caractere literal. */
export function escapeLikeWildcards(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&')
}

/**
 * Serializa um valor para dentro de `or=(...)`/`and=(...)`, sempre entre aspas.
 * Aspas sempre (e não "só quando tem caractere especial") porque o custo é zero
 * e a versão condicional é a que alguém esquece de acionar depois.
 */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`
}

/**
 * Monta um filtro `coluna.ilike."%termo%"` pronto para entrar numa lista `or`.
 * Use SEMPRE isto em vez de interpolar o termo na mão.
 */
export function ilikeFilter(column: string, term: string): string {
  return `${column}.ilike.${quotePostgrestValue(`%${escapeLikeWildcards(term)}%`)}`
}

/**
 * Padrão `%termo%` para os métodos dedicados do supabase-js (`.ilike(col, p)`),
 * que enviam o valor como parâmetro próprio e NÃO precisam das aspas do `or`.
 */
export function ilikePattern(term: string): string {
  return `%${escapeLikeWildcards(term)}%`
}
