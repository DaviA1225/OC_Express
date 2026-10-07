/// <reference types="vite/client" />
// Compressão de anexos no navegador, antes do upload.
//
// POR QUE EXISTE: o projeto está no plano Free do Supabase (1 GB de storage) e
// estourou em 2026-10. A conta, por bucket, mostrou onde está o peso: não nas
// fotos (média de 137 kB, já chegam pequenas), e sim nos PDFS ESCANEADOS — CNH,
// CRLV e ANTT digitalizados. 313 PDFs acima de 300 kB somavam 273 MB, quase
// metade do bucket de anexos. Um escaneamento a 300-600 dpi com imagem sem
// compressão vira, refeito a ~150 dpi em JPEG, uma fração do tamanho e continua
// legível (inclusive o QR do CRLV).
//
// REGRAS QUE NÃO PODEM QUEBRAR:
//   • Nunca piora: se o resultado não ficar bem menor, sobe o ORIGINAL.
//   • Nunca bloqueia: qualquer falha (navegador antigo, PDF protegido, falta de
//     memória) devolve o original. Comprimir é economia, não requisito.
//   • PDF pequeno não é tocado: abaixo do limiar ele é quase sempre um PDF
//     DIGITAL (CRLV-e, NF), com texto selecionável — rasterizar só o pioraria.
//
// O pdf.js (~1 MB) é importado sob demanda, só quando chega um PDF grande.

const IMG_LIMIAR_BYTES = 300 * 1024
const IMG_LADO_MAX = 2000
const IMG_QUALIDADE = 0.8

const PDF_LIMIAR_BYTES = 400 * 1024
const PDF_DPI = 150
const PDF_LADO_MAX = 2200
const PDF_QUALIDADE = 0.72
const PDF_MAX_PAGINAS = 20

/** Só aceita o resultado se economizar pelo menos 30%. */
const GANHO_MINIMO = 0.7

export interface ResultadoCompressao {
  file: File
  comprimido: boolean
  bytesAntes: number
  bytesDepois: number
}

function manter(file: File): ResultadoCompressao {
  return { file, comprimido: false, bytesAntes: file.size, bytesDepois: file.size }
}

function trocarExtensao(nome: string, ext: string): string {
  const semExt = nome.replace(/\.[^.]+$/, '')
  return `${semExt || 'arquivo'}.${ext}`
}

function canvasParaBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade))
}

async function comprimirImagem(file: File): Promise<ResultadoCompressao> {
  // GIF pode ser animado e SVG é vetor: nenhum dos dois ganha virando JPEG.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return manter(file)
  if (file.size < IMG_LIMIAR_BYTES) return manter(file)

  // `from-image` aplica a rotação do EXIF — foto de celular não sai deitada.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const escala = Math.min(1, IMG_LADO_MAX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) return manter(file)
    // Fundo branco: PNG com transparência viraria preto no JPEG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await canvasParaBlob(canvas, IMG_QUALIDADE)
    if (!blob || blob.size > file.size * GANHO_MINIMO) return manter(file)
    const novo = new File([blob], trocarExtensao(file.name, 'jpg'), { type: 'image/jpeg' })
    return { file: novo, comprimido: true, bytesAntes: file.size, bytesDepois: novo.size }
  } finally {
    bitmap.close()
  }
}

async function comprimirPdf(file: File): Promise<ResultadoCompressao> {
  if (file.size < PDF_LIMIAR_BYTES) return manter(file)

  const [pdfjs, workerUrl, { PDFDocument }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => m.default),
    import('pdf-lib'),
  ])
  // Worker servido como asset do próprio app: a CSP só aceita worker de 'self'.
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const tarefa = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // Sem wasm: o portal não tem 'wasm-unsafe-eval' na CSP. O pdf.js cai nos
    // decodificadores em JS, mais lentos e suficientes para um upload.
    useWasm: false,
  })
  try {
    const origem = await tarefa.promise
    if (origem.numPages > PDF_MAX_PAGINAS) return manter(file)

    const destino = await PDFDocument.create()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return manter(file)

    for (let n = 1; n <= origem.numPages; n++) {
      const pagina = await origem.getPage(n)
      // Tamanho físico da página em pontos (1/72"): a página nova fica do
      // mesmo tamanho, só a imagem dentro dela muda de resolução.
      const emPontos = pagina.getViewport({ scale: 1 })
      let escala = PDF_DPI / 72
      escala = Math.min(escala, PDF_LADO_MAX / Math.max(emPontos.width, emPontos.height))
      const viewport = pagina.getViewport({ scale: escala })

      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await pagina.render({ canvas, canvasContext: ctx, viewport }).promise
      pagina.cleanup()

      const blob = await canvasParaBlob(canvas, PDF_QUALIDADE)
      if (!blob) return manter(file)
      const jpg = await destino.embedJpg(await blob.arrayBuffer())
      const nova = destino.addPage([emPontos.width, emPontos.height])
      nova.drawImage(jpg, { x: 0, y: 0, width: emPontos.width, height: emPontos.height })
    }

    const bytes = await destino.save()
    if (bytes.byteLength > file.size * GANHO_MINIMO) return manter(file)
    const novo = new File([bytes as BlobPart], file.name, { type: 'application/pdf' })
    return { file: novo, comprimido: true, bytesAntes: file.size, bytesDepois: novo.size }
  } finally {
    // No pdf.js 6 quem libera o worker é a tarefa, não o documento.
    await tarefa.destroy()
  }
}

/**
 * Devolve uma versão menor do arquivo quando vale a pena, ou o próprio arquivo.
 * Nunca lança.
 */
export async function comprimirAnexo(file: File): Promise<ResultadoCompressao> {
  try {
    if (file.type.startsWith('image/')) return await comprimirImagem(file)
    if (file.type === 'application/pdf') return await comprimirPdf(file)
  } catch (err) {
    console.warn('[compressao] mantido o original', file.name, err)
  }
  return manter(file)
}
