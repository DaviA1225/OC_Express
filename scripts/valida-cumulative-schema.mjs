// Valida supabase/cumulative-schema.sql — o arquivo que, até 2026-08-09, nada
// no CI verificava.
//
// Por que existe: o cumulative é um replay idempotente de TODAS as migrations,
// mantido à mão. Ele já ficou parado na 0047 enquanto o banco estava na 0054, e
// o problema não era estar velho — era CONTRADIZER o estado vivo: replayar
// desfazia o CHECK da 0054, a otimização de RLS da 0051 e o audit_trigger
// enxuto da 0049/0050. O dry-run do CI cobre só `supabase/migrations/`, então
// um bloco defasado ou quebrado só aparecia na hora em que alguém replayasse —
// provavelmente num remoto vivo, e dentro de UMA transação, derrubando tudo.
//
// Este script não executa SQL (não há Postgres no CI deste repo). Ele checa os
// quatro modos de falha que já morderam ou que a estrutura do arquivo permite:
//
//   1. Aspas-dólar ímpares — uma tag $$/$do$/$f$ sem par faz o resto do arquivo
//      virar string. O erro aparece longe da causa e é péssimo de achar.
//   2. Cabeçalho desatualizado — "migrations 0001 → NNNN" tem que cobrir a
//      migration mais alta que existe em disco. É o sintoma exato do episódio
//      da 0047.
//   3. Drift de objeto — toda tabela/função/view criada numa migration precisa
//      existir no cumulative, senão reconstruir o banco por ele deixa o objeto
//      de fora.
//   4. Policy depois da varredura da 0051 — aquela seção age sobre `pg_policies`
//      (estado vivo), não sobre uma lista. Policy criada DEPOIS dela fica
//      avaliando os helpers por linha. O sintoma não é erro: é lentidão meses
//      depois (142 ms -> 8,2 s num COUNT de log_auditoria, medido na 0051).
//
// Uso:  node scripts/valida-cumulative-schema.mjs
//       npm run schema:check
//       node scripts/valida-cumulative-schema.mjs <caminho-alternativo.sql>
//
// O argumento opcional existe para poder apontar o script a uma cópia
// deliberadamente quebrada e conferir que ele REPROVA. Um verificador que
// nunca foi visto falhando não é evidência de nada.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const CUMULATIVE = process.argv[2] ?? join(RAIZ, 'supabase', 'cumulative-schema.sql')
const DIR_MIGRATIONS = join(RAIZ, 'supabase', 'migrations')

// Marcador da seção da 0051. Se alguém renomear a seção, o check 4 falha
// dizendo isso em vez de passar em silêncio — um check que não acha o que
// deveria checar precisa gritar, não relaxar.
const MARCADOR_0051 = '0051 (+0052/0053)'

// Objetos criados e derrubados dentro do próprio conjunto de migrations: não
// se espera que sobrevivam no cumulative.
const EFEMEROS = new Set(['rls_initplan_report'])

const falhas = []
const cum = readFileSync(CUMULATIVE, 'utf8')
const linhasCum = cum.split('\n')

const migrations = readdirSync(DIR_MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()

// ---------------------------------------------------------------- 1. $$ ----
console.log('=== 1. aspas-dolar balanceadas ===')
const tags = cum.match(/\$[A-Za-z_]*\$/g) ?? []
const contagem = new Map()
for (const t of tags) contagem.set(t, (contagem.get(t) ?? 0) + 1)

for (const [tag, n] of [...contagem].sort()) {
  const impar = n % 2 !== 0
  console.log(`    ${tag.padEnd(8)} ${String(n).padStart(4)}${impar ? '   <-- IMPAR' : ''}`)
  if (impar) falhas.push(`aspas-dolar impares: ${tag} aparece ${n}x`)
}
if (contagem.size === 0) falhas.push('nenhuma aspa-dolar encontrada — arquivo suspeito')

// ---------------------------------------------------------- 2. cabecalho ----
console.log('\n=== 2. cabecalho cobre a migration mais alta ===')
const maiorMigration = migrations
  .map((f) => Number.parseInt(f.slice(0, 4), 10))
  .filter((n) => Number.isFinite(n))
  .reduce((a, b) => Math.max(a, b), 0)

const mCabecalho = cum.match(/migrations\s+0001\s*(?:→|->)\s*(\d{4})/)
if (!mCabecalho) {
  falhas.push('cabecalho nao declara o intervalo "migrations 0001 → NNNN"')
  console.log('    FALHA: intervalo nao encontrado no cabecalho')
} else {
  const declarado = Number.parseInt(mCabecalho[1], 10)
  const ok = declarado === maiorMigration
  console.log(`    cabecalho diz 0001 → ${String(declarado).padStart(4, '0')} | maior em disco: ${String(maiorMigration).padStart(4, '0')}${ok ? '' : '   <-- DIVERGE'}`)
  if (!ok) {
    falhas.push(`cabecalho declara ate ${declarado} mas existe a migration ${maiorMigration}`)
  }
}

// ------------------------------------------------------------- 3. drift ----
console.log('\n=== 3. objetos de migration presentes no cumulative ===')
const PADROES = [
  [/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi, 'tabela'],
  [/CREATE OR REPLACE FUNCTION\s+([a-z_][a-z0-9_]*)/gi, 'funcao'],
  [/CREATE OR REPLACE VIEW\s+([a-z_][a-z0-9_]*)/gi, 'view'],
]

let ausentes = 0
let conferidos = 0
for (const arquivo of migrations) {
  const txt = readFileSync(join(DIR_MIGRATIONS, arquivo), 'utf8')
  for (const [padrao, tipo] of PADROES) {
    for (const [, nome] of txt.matchAll(padrao)) {
      const alvo = nome.toLowerCase()
      if (EFEMEROS.has(alvo)) continue
      conferidos++
      if (!new RegExp(`\\b${alvo}\\b`).test(cum)) {
        console.log(`    FALTA  ${arquivo}: ${tipo} ${alvo}`)
        falhas.push(`${arquivo}: ${tipo} "${alvo}" nao aparece no cumulative`)
        ausentes++
      }
    }
  }
}
console.log(`    ${conferidos} objeto(s) conferido(s), ${ausentes} ausente(s)`)

// ------------------------------------------------- 4. ordem das policies ----
console.log('\n=== 4. nenhuma policy depois da varredura da 0051 ===')
const idx0051 = linhasCum.findIndex((l) => l.includes(MARCADOR_0051))
if (idx0051 === -1) {
  falhas.push(`marcador da secao 0051 ("${MARCADOR_0051}") nao encontrado — o check 4 nao pode rodar`)
  console.log('    FALHA: marcador da secao 0051 nao encontrado')
} else {
  const depois = []
  for (let i = idx0051 + 1; i < linhasCum.length; i++) {
    if (/^\s*CREATE POLICY/i.test(linhasCum[i])) depois.push(i + 1)
  }
  if (depois.length > 0) {
    console.log(`    FALHA: CREATE POLICY nas linhas ${depois.join(', ')} — depois da varredura`)
    falhas.push(
      `${depois.length} CREATE POLICY depois da secao 0051 (linhas ${depois.join(', ')}). ` +
        'Mova o bloco para ANTES dela, senao a policy avalia os helpers por linha.',
    )
  } else {
    console.log(`    OK: secao 0051 na linha ${idx0051 + 1}, nenhuma policy depois dela`)
  }
}

// ---------------------------------------------------------------- saida ----
console.log(`\nmigrations: ${migrations.length}   cumulative: ${linhasCum.length} linhas`)
if (falhas.length > 0) {
  console.error(`\nFALHOU — ${falhas.length} problema(s):`)
  for (const f of falhas) console.error(`  • ${f}`)
  console.error('\nContexto: supabase/cumulative-schema.sql tem que poder ser replayado')
  console.error('num remoto vivo. Ele roda em UMA transacao: um erro derruba tudo.')
  process.exit(1)
}
console.log('\nOK — cumulative-schema.sql consistente com as migrations.')
