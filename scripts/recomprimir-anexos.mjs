#!/usr/bin/env node
// Recomprime os PDFs escaneados JÁ SALVOS no bucket `solicitacoes-anexos`.
//
// O PR #94 passou a comprimir no upload, mas isso só freia o crescimento: o
// storage do plano Free já estava acima de 1 GB. Este script aplica a mesma
// regra do `packages/shared/src/compressao.ts` ao legado — PDF > 400 kB
// refeito a ~150 dpi em JPEG, só troca se economizar >= 30% — rodando no Node
// (canvas do @napi-rs no lugar do DOM).
//
// Uso:
//   node scripts/recomprimir-anexos.mjs                      # ENSAIO: mede, não grava nada
//   node scripts/recomprimir-anexos.mjs --aplicar --backup <pasta>
//
// --aplicar SOBRESCREVE o arquivo no bucket (mesmo path) e atualiza
// `solicitacao_anexos.size_bytes`. Exige --backup: o original de cada arquivo
// trocado é gravado em <pasta>/<path> ANTES do upload. São CNH/CRLV com dado
// pessoal — apagar a pasta depois de conferir.
//
// Credenciais: SUPABASE_URL e SUPABASE_SERVICE_KEY do .env da raiz (mesmo
// esquema do pentest-rls.mjs).

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const { createCanvas } = require('@napi-rs/canvas')
const { PDFDocument } = require('pdf-lib')
const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)

// Mesmos números de packages/shared/src/compressao.ts.
const PDF_LIMIAR_BYTES = 400 * 1024
const PDF_DPI = 150
const PDF_LADO_MAX = 2200
const PDF_QUALIDADE = 72 // 0..100 no @napi-rs (0.72 no navegador)
const PDF_MAX_PAGINAS = 20
const GANHO_MINIMO = 0.7

const BUCKET = 'solicitacoes-anexos'

// ── argumentos e credenciais ────────────────────────────────────────────────

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const iBackup = args.indexOf('--backup')
const backupDir = iBackup >= 0 ? args[iBackup + 1] : null
if (aplicar && !backupDir) {
  console.error('--aplicar exige --backup <pasta> (o original é guardado antes de sobrescrever).')
  process.exit(2)
}

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = loadEnvFile(resolve(repoRoot, '.env'))
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY
if (!URL_ || !KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(2)
}
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

// ── compressão (espelho do compressao.ts) ───────────────────────────────────

async function comprimirPdf(bytes) {
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(bytes), useWasm: false, verbosity: 0 })
  try {
    const origem = await tarefa.promise
    if (origem.numPages > PDF_MAX_PAGINAS) return { motivo: `${origem.numPages} páginas` }
    const destino = await PDFDocument.create()
    for (let n = 1; n <= origem.numPages; n++) {
      const pagina = await origem.getPage(n)
      const pts = pagina.getViewport({ scale: 1 })
      const escala = Math.min(PDF_DPI / 72, PDF_LADO_MAX / Math.max(pts.width, pts.height))
      const vp = pagina.getViewport({ scale: escala })
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await pagina.render({ canvas, canvasContext: ctx, viewport: vp }).promise
      pagina.cleanup()
      const jpg = await destino.embedJpg(canvas.toBuffer('image/jpeg', PDF_QUALIDADE))
      destino.addPage([pts.width, pts.height]).drawImage(jpg, { x: 0, y: 0, width: pts.width, height: pts.height })
    }
    const out = await destino.save()
    if (out.byteLength > bytes.byteLength * GANHO_MINIMO) return { motivo: 'ganho < 30%' }

    // Prova de vida: o resultado abre e tem o mesmo número de páginas.
    const conf = pdfjs.getDocument({ data: new Uint8Array(out), useWasm: false, verbosity: 0 })
    const reaberto = await conf.promise
    const ok = reaberto.numPages === origem.numPages
    await conf.destroy()
    if (!ok) return { motivo: 'reabertura divergiu' }
    return { bytes: out }
  } finally {
    await tarefa.destroy()
  }
}

// ── candidatos ──────────────────────────────────────────────────────────────

async function candidatos() {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('solicitacao_anexos')
      .select('id, storage_path, size_bytes')
      .eq('mime_type', 'application/pdf')
      .gte('size_bytes', PDF_LIMIAR_BYTES)
      .order('size_bytes', { ascending: false })
      .range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const kb = (n) => `${(n / 1024).toFixed(0)} kB`
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`

const lista = await candidatos()
console.log(`${aplicar ? 'APLICANDO' : 'ENSAIO (nada é gravado)'} — ${lista.length} PDFs >= ${kb(PDF_LIMIAR_BYTES)}`)

let antes = 0, depois = 0, trocados = 0
const pulados = {}
const falhas = []

for (const [i, a] of lista.entries()) {
  const tag = `[${i + 1}/${lista.length}]`
  try {
    const { data: blob, error } = await db.storage.from(BUCKET).download(a.storage_path)
    if (error) throw new Error(`download: ${error.message}`)
    const original = new Uint8Array(await blob.arrayBuffer())
    const r = await comprimirPdf(original)
    if (!r.bytes) {
      pulados[r.motivo] = (pulados[r.motivo] ?? 0) + 1
      continue
    }
    antes += original.byteLength
    depois += r.bytes.byteLength
    trocados++

    if (aplicar) {
      const destinoBackup = join(backupDir, a.storage_path)
      mkdirSync(dirname(destinoBackup), { recursive: true })
      writeFileSync(destinoBackup, original)

      const { error: upErr } = await db.storage
        .from(BUCKET)
        .update(a.storage_path, r.bytes, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw new Error(`upload: ${upErr.message}`)
      const { error: dbErr } = await db
        .from('solicitacao_anexos')
        .update({ size_bytes: r.bytes.byteLength })
        .eq('id', a.id)
      if (dbErr) throw new Error(`size_bytes: ${dbErr.message}`)
    }
    console.log(`${tag} ${kb(original.byteLength)} -> ${kb(r.bytes.byteLength)}`)
  } catch (err) {
    falhas.push(a.id)
    console.log(`${tag} FALHA ${a.id}: ${err.message}`)
  }
}

console.log('')
console.log(`Trocados: ${trocados} · ${mb(antes)} -> ${mb(depois)} · economia ${mb(antes - depois)}`)
console.log(`Mantidos: ${JSON.stringify(pulados)}`)
console.log(`Falhas: ${falhas.length}${falhas.length ? ' — ids: ' + falhas.join(', ') : ''}`)
