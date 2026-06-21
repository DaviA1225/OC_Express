/* Gera a apresentacao "SisLog LHG — do Excel manual a emissao em 1 clique".
   Identidade corporativa LHG: grafite + laranja #FF5100 como acento. */
const pptxgen = require('pptxgenjs')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const sharp = require('sharp')
const fa = require('react-icons/fa')

// ---------- paleta ----------
const INK = '1D1E1B'      // grafite near-black (dominante em slides escuros)
const SLATE = '2A2F36'    // painel escuro
const PAPER = 'FFFFFF'
const MIST = 'F4F6F8'     // painel claro
const MIST2 = 'ECEFF2'
const LINE = 'E2E6EA'
const ORANGE = 'FF5100'   // acento LHG
const ORANGE_DK = 'C44612'
const GREEN = '15803D'
const RED = 'B23B30'      // negativo discreto (metodo antigo)
const INKTX = '20242A'    // texto sobre claro
const MUT = '5B6470'      // texto secundario
const MUT2 = '8A929C'     // texto terciario

const HEAD = 'Bahnschrift'   // industrial/logistica (Windows)
const BODY = 'Segoe UI'      // corpo limpo (Windows)

const W = 13.3, H = 7.5, M = 0.7

const pres = new pptxgen()
pres.defineLayout({ name: 'WIDE', width: W, height: H })
pres.layout = 'WIDE'
pres.author = 'LHG Logistica'
pres.title = 'SisLog LHG — Vantagens do sistema'

// ---------- icones ----------
const iconCache = {}
async function ic(Comp, color) {
  const key = Comp.name + color
  if (iconCache[key]) return iconCache[key]
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color: '#' + color, size: '256' }),
  )
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const data = 'image/png;base64,' + png.toString('base64')
  iconCache[key] = data
  return data
}

// ---------- helpers de layout ----------
function tab(slide, color = ORANGE) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.16, h: H, fill: { color }, line: { type: 'none' } })
}
function footer(slide, n) {
  slide.addText(
    [
      { text: 'SisLog LHG', options: { bold: true, color: INKTX } },
      { text: '   ·   Sistema de Ordens de Carregamento', options: { color: MUT2 } },
    ],
    { x: M, y: H - 0.46, w: 9, h: 0.3, fontFace: BODY, fontSize: 9, margin: 0, valign: 'middle' },
  )
  slide.addText(String(n).padStart(2, '0') + ' / 12', {
    x: W - 1.9, y: H - 0.46, w: 1.2, h: 0.3, align: 'right',
    fontFace: BODY, fontSize: 9, color: MUT2, margin: 0, valign: 'middle',
  })
}
function head(slide, kicker, title) {
  tab(slide)
  slide.addText(kicker.toUpperCase(), {
    x: M, y: 0.5, w: 11.9, h: 0.3, fontFace: BODY, fontSize: 12, bold: true,
    color: ORANGE, charSpacing: 2, margin: 0,
  })
  slide.addText(title, {
    x: M, y: 0.82, w: 11.9, h: 0.75, fontFace: HEAD, fontSize: 31, bold: true,
    color: INKTX, margin: 0,
  })
}
async function iconChip(slide, Comp, x, y, d, circle, iconColor) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: circle }, line: { type: 'none' } })
  const pad = d * 0.27
  slide.addImage({ data: await ic(Comp, iconColor), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad })
}

// =================================================================
// SLIDE 1 — Capa
// =================================================================
async function s1() {
  const s = pres.addSlide()
  s.background = { color: INK }
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.28, h: H, fill: { color: ORANGE }, line: { type: 'none' } })
  // bloco laranja decorativo (canto inf. direito)
  s.addShape(pres.shapes.RECTANGLE, { x: W - 3.6, y: H - 0.9, w: 3.6, h: 0.9, fill: { color: ORANGE }, line: { type: 'none' } })
  s.addText('LHG LOGÍSTICA  ·  OC EXPRESS', {
    x: 1.0, y: 1.35, w: 10, h: 0.4, fontFace: BODY, fontSize: 14, bold: true, color: 'C9CDD2', charSpacing: 3, margin: 0,
  })
  s.addText([
    { text: 'SisLog', options: { color: PAPER } },
    { text: ' LHG', options: { color: ORANGE } },
  ], { x: 0.95, y: 1.95, w: 11.5, h: 1.5, fontFace: HEAD, fontSize: 72, bold: true, margin: 0 })
  s.addText('Do Excel preenchido célula a célula\nà emissão da Ordem de Carregamento em poucos cliques.', {
    x: 1.0, y: 3.7, w: 10.8, h: 1.1, fontFace: BODY, fontSize: 20, color: 'E7E9EC', lineSpacingMultiple: 1.1, margin: 0,
  })
  // 3 selos rapidos
  const seals = ['Mais rápido', 'Integrado', 'Sem retrabalho']
  let x = 1.0
  for (const t of seals) {
    const w = 0.42 + t.length * 0.135
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.55, w, h: 0.5, rectRadius: 0.06, fill: { color: SLATE }, line: { color: '3A4048', width: 1 } })
    s.addText(t, { x, y: 5.55, w, h: 0.5, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 13, bold: true, color: PAPER, margin: 0 })
    x += w + 0.25
  }
  s.addText('Apresentação executiva  ·  Ganhos de agilidade na operação', {
    x: 1.0, y: 6.65, w: 10, h: 0.3, fontFace: BODY, fontSize: 11, color: '9AA0A7', margin: 0,
  })
}

// =================================================================
// SLIDE 2 — Como é hoje (o problema)
// =================================================================
async function s2() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Como é hoje', 'Emitir uma OC pela planilha consome tempo e gera erro')
  const rows = [
    [fa.FaTable, 'Preenchimento manual', 'Abrir a planilha OC Modelo1.xlsx e digitar ~12 campos, célula por célula, em toda OC.'],
    [fa.FaRedo, 'Tudo redigitado', 'Motorista, placas, cliente e material são digitados de novo a cada solicitação.'],
    [fa.FaExclamationTriangle, 'Sem validação', 'Erro de placa, CPF ou CNPJ passa direto — só aparece depois, já no caminhão.'],
    [fa.FaShareSquare, 'Exporta e anexa à mão', 'Salvar PDF, abrir o WhatsApp e anexar manualmente, uma OC de cada vez.'],
    [fa.FaQuestionCircle, 'Sem status', 'Ninguém sabe em que pé está cada OC; acompanhamento por conversa e memória.'],
    [fa.FaUserLock, 'Arquivo isolado', 'A planilha vive na máquina de uma pessoa — sem histórico nem visão da equipe.'],
  ]
  const colW = 5.75, gap = 0.4, x0 = M
  const rowH = 1.5, y0 = 1.85
  for (let i = 0; i < rows.length; i++) {
    const col = i % 2, r = Math.floor(i / 2)
    const x = x0 + col * (colW + gap)
    const y = y0 + r * (rowH + 0.18)
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: colW, h: rowH, fill: { color: MIST }, line: { color: LINE, width: 1 } })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h: rowH, fill: { color: RED }, line: { type: 'none' } })
    await iconChip(s, rows[i][0], x + 0.28, y + 0.28, 0.7, 'FBE3DF', RED)
    s.addText(rows[i][1], { x: x + 1.2, y: y + 0.22, w: colW - 1.45, h: 0.4, fontFace: BODY, fontSize: 15, bold: true, color: INKTX, margin: 0 })
    s.addText(rows[i][2], { x: x + 1.2, y: y + 0.62, w: colW - 1.45, h: 0.8, fontFace: BODY, fontSize: 11.5, color: MUT, lineSpacingMultiple: 1.0, margin: 0 })
  }
  footer(s, 2)
}

// =================================================================
// SLIDE 3 — Antes x Depois
// =================================================================
async function s3() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Antes × Depois', 'A mesma OC, dois mundos diferentes')
  const colW = 5.78, gap = 0.34, y0 = 1.78, x1 = M, x2 = M + colW + gap
  const bandH = 0.6
  // cabecalhos das colunas
  s.addShape(pres.shapes.RECTANGLE, { x: x1, y: y0, w: colW, h: bandH, fill: { color: '6B7280' }, line: { type: 'none' } })
  s.addShape(pres.shapes.RECTANGLE, { x: x2, y: y0, w: colW, h: bandH, fill: { color: ORANGE }, line: { type: 'none' } })
  s.addText('ANTES  ·  Excel manual', { x: x1, y: y0, w: colW, h: bandH, align: 'center', valign: 'middle', fontFace: HEAD, fontSize: 17, bold: true, color: PAPER, margin: 0 })
  s.addText('DEPOIS  ·  SisLog LHG', { x: x2, y: y0, w: colW, h: bandH, align: 'center', valign: 'middle', fontFace: HEAD, fontSize: 17, bold: true, color: PAPER, margin: 0 })
  const antes = [
    'Digitar ~12 campos, célula por célula',
    'Redigitar motorista, placa e cliente sempre',
    'Sem conferência de placa / CPF / CNPJ',
    'Exportar PDF e anexar no zap na mão',
    'Sem status: não se sabe onde a OC está',
    'Planilha na máquina de uma pessoa',
  ]
  const depois = [
    'Selecionar dados já cadastrados em segundos',
    'Autocomplete: motorista e veículo num clique',
    'Validação automática de placa, CPF e CNPJ',
    'PDF gerado e enviado por WhatsApp pelo sistema',
    'Status e linha do tempo de cada solicitação',
    'Tudo na nuvem, multiusuário e auditado',
  ]
  const rh = 0.6, ty = y0 + bandH + 0.14
  const xIcon = fa.FaTimes, cIcon = fa.FaCheck
  for (let i = 0; i < 6; i++) {
    const y = ty + i * (rh + 0.08)
    // antes
    s.addShape(pres.shapes.RECTANGLE, { x: x1, y, w: colW, h: rh, fill: { color: MIST2 }, line: { type: 'none' } })
    await iconChip(s, xIcon, x1 + 0.18, y + (rh - 0.4) / 2, 0.4, 'D9DCE0', '6B7280')
    s.addText(antes[i], { x: x1 + 0.72, y, w: colW - 0.9, h: rh, valign: 'middle', fontFace: BODY, fontSize: 12.5, color: '49505A', margin: 0 })
    // depois
    s.addShape(pres.shapes.RECTANGLE, { x: x2, y, w: colW, h: rh, fill: { color: 'FFF3EC' }, line: { type: 'none' } })
    await iconChip(s, cIcon, x2 + 0.18, y + (rh - 0.4) / 2, 0.4, 'FFE0CC', ORANGE_DK)
    s.addText(depois[i], { x: x2 + 0.72, y, w: colW - 0.9, h: rh, valign: 'middle', fontFace: BODY, fontSize: 12.5, bold: true, color: INKTX, margin: 0 })
  }
  footer(s, 3)
}

// =================================================================
// SLIDE 4 — Ganho de tempo (numeros)
// =================================================================
async function s4() {
  const s = pres.addSlide()
  s.background = { color: INK }
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.16, h: H, fill: { color: ORANGE }, line: { type: 'none' } })
  s.addText('GANHO DE TEMPO', { x: M, y: 0.55, w: 11, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: ORANGE, charSpacing: 2, margin: 0 })
  s.addText('De minutos digitando a segundos selecionando', { x: M, y: 0.87, w: 11.9, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: PAPER, margin: 0 })

  // comparativo grande de tempo
  const cy = 2.1
  s.addText('≈ 10 min', { x: M, y: cy, w: 4.0, h: 1.1, fontFace: HEAD, fontSize: 46, bold: true, color: '9AA0A7', align: 'center', margin: 0 })
  s.addText('por OC no Excel', { x: M, y: cy + 1.05, w: 4.0, h: 0.4, fontFace: BODY, fontSize: 13, color: '9AA0A7', align: 'center', margin: 0 })
  s.addImage({ data: await ic(fa.FaArrowRight, 'FF5100'), x: M + 4.25, y: cy + 0.3, w: 0.7, h: 0.7 })
  s.addText('≈ 1 min', { x: M + 5.1, y: cy, w: 4.0, h: 1.1, fontFace: HEAD, fontSize: 46, bold: true, color: ORANGE, align: 'center', margin: 0 })
  s.addText('por OC no SisLog', { x: M + 5.1, y: cy + 1.05, w: 4.0, h: 0.4, fontFace: BODY, fontSize: 13, color: 'E7E9EC', align: 'center', margin: 0 })

  // 3 cards de stat
  const stats = [
    ['≈ 90%', 'menos tempo gasto\nem cada OC'],
    ['≈ 4 h', 'liberadas por dia\ncom 30 OCs/dia'],
    ['0', 'cadastros redigitados\na cada solicitação'],
  ]
  const cw = 3.66, g = 0.36, x0 = M, yy = 4.55, ch = 1.95
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (cw + g)
    s.addShape(pres.shapes.RECTANGLE, { x, y: yy, w: cw, h: ch, fill: { color: SLATE }, line: { color: '3A4048', width: 1 } })
    s.addShape(pres.shapes.RECTANGLE, { x, y: yy, w: cw, h: 0.08, fill: { color: ORANGE }, line: { type: 'none' } })
    s.addText(stats[i][0], { x, y: yy + 0.25, w: cw, h: 0.9, align: 'center', fontFace: HEAD, fontSize: 44, bold: true, color: PAPER, margin: 0 })
    s.addText(stats[i][1], { x: x + 0.2, y: yy + 1.2, w: cw - 0.4, h: 0.7, align: 'center', fontFace: BODY, fontSize: 13, color: 'C9CDD2', lineSpacingMultiple: 1.0, margin: 0 })
  }
  s.addText('Estimativa operacional baseada no fluxo atual de preenchimento manual. O ganho cresce com o volume diário de OCs.', {
    x: M, y: 6.75, w: 11.9, h: 0.35, fontFace: BODY, fontSize: 10, italic: true, color: '8A929C', margin: 0,
  })
}

// =================================================================
// SLIDE 5 — Cadastros reutilizaveis
// =================================================================
async function s5() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Cadastros', 'Cadastra uma vez, reutiliza em toda OC')
  const items = [
    [fa.FaIdCard, 'Motoristas'],
    [fa.FaTruck, 'Veículos'],
    [fa.FaTrailer, 'Carretas'],
    [fa.FaBuilding, 'Clientes'],
    [fa.FaBoxes, 'Materiais'],
    [fa.FaHandshake, 'Subcontratadas'],
    [fa.FaNetworkWired, 'Parceiros'],
  ]
  // grade 2 colunas a esquerda
  const cw = 2.95, ch = 0.78, gx = 0.25, gy = 0.2, x0 = M, y0 = 2.0
  for (let i = 0; i < items.length; i++) {
    const col = i % 2, r = Math.floor(i / 2)
    const x = x0 + col * (cw + gx)
    const y = y0 + r * (ch + gy)
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.05, fill: { color: MIST }, line: { color: LINE, width: 1 } })
    await iconChip(s, items[i][0], x + 0.16, y + 0.15, ch - 0.3, 'FFE7DA', ORANGE_DK)
    s.addText(items[i][1], { x: x + 0.78, y, w: cw - 0.9, h: ch, valign: 'middle', fontFace: BODY, fontSize: 14.5, bold: true, color: INKTX, margin: 0 })
  }
  // painel direito — como funciona
  const px = 7.35, pw = 5.25, py = 2.0, ph = 4.2
  s.addShape(pres.shapes.RECTANGLE, { x: px, y: py, w: pw, h: ph, fill: { color: INK }, line: { type: 'none' } })
  s.addShape(pres.shapes.RECTANGLE, { x: px, y: py, w: 0.08, h: ph, fill: { color: ORANGE }, line: { type: 'none' } })
  s.addText('Por que isso acelera tudo', { x: px + 0.4, y: py + 0.3, w: pw - 0.7, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: PAPER, margin: 0 })
  const props = [
    ['Autocomplete', 'Digite as primeiras letras e selecione — nada de redigitar dados.'],
    ['Quick-create', 'Faltou um cadastro? Crie na hora, sem sair da solicitação.'],
    ['Padronizado', 'Os mesmos dados para todos: placa, CPF e nomes sempre certos.'],
    ['Ativa / inativa', 'Mantém o histórico sem poluir as listas do dia a dia.'],
  ]
  let yy = py + 0.95
  for (const [t, d] of props) {
    s.addImage({ data: await ic(fa.FaCheckCircle, 'FF5100'), x: px + 0.4, y: yy + 0.04, w: 0.28, h: 0.28 })
    s.addText(t, { x: px + 0.82, y: yy - 0.04, w: pw - 1.1, h: 0.32, fontFace: BODY, fontSize: 14, bold: true, color: PAPER, margin: 0 })
    s.addText(d, { x: px + 0.82, y: yy + 0.28, w: pw - 1.2, h: 0.5, fontFace: BODY, fontSize: 11.5, color: 'C9CDD2', lineSpacingMultiple: 1.0, margin: 0 })
    yy += 0.82
  }
  footer(s, 5)
}

// =================================================================
// SLIDE 6 — Criar solicitacao em segundos
// =================================================================
async function s6() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Solicitações', 'Criar uma solicitação em segundos')
  const steps = [
    ['1', 'Abra de qualquer tela', 'O atalho Ctrl+N abre a Nova Solicitação na hora, sem navegar por menus.'],
    ['2', 'Selecione o que já existe', 'Motorista, veículo, cliente e material por busca com autocomplete.'],
    ['3', 'Falta cadastro? Crie na hora', 'O quick-create adiciona o registro sem fechar a solicitação.'],
    ['4', 'Confirme', 'A solicitação entra na fila com status — pronta para virar OC.'],
  ]
  const x0 = M, y0 = 2.0, rh = 1.05, w = 8.0
  for (let i = 0; i < steps.length; i++) {
    const y = y0 + i * (rh + 0.12)
    s.addShape(pres.shapes.OVAL, { x: x0, y: y + 0.12, w: 0.78, h: 0.78, fill: { color: ORANGE }, line: { type: 'none' } })
    s.addText(steps[i][0], { x: x0, y: y + 0.12, w: 0.78, h: 0.78, align: 'center', valign: 'middle', fontFace: HEAD, fontSize: 30, bold: true, color: PAPER, margin: 0 })
    s.addText(steps[i][1], { x: x0 + 1.05, y: y + 0.12, w: w - 1.0, h: 0.4, fontFace: BODY, fontSize: 16, bold: true, color: INKTX, margin: 0 })
    s.addText(steps[i][2], { x: x0 + 1.05, y: y + 0.52, w: w - 1.0, h: 0.45, fontFace: BODY, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.0, margin: 0 })
    if (i < steps.length - 1) {
      s.addShape(pres.shapes.RECTANGLE, { x: x0 + 0.37, y: y + 0.9, w: 0.04, h: 0.34, fill: { color: 'F1C9B2' }, line: { type: 'none' } })
    }
  }
  // callout lateral
  const px = 9.35, pw = 3.25, py = 2.0, ph = 4.55
  s.addShape(pres.shapes.RECTANGLE, { x: px, y: py, w: pw, h: ph, fill: { color: MIST }, line: { color: LINE, width: 1 } })
  await iconChip(s, fa.FaKeyboard, px + (pw - 0.9) / 2, py + 0.45, 0.9, 'FFE7DA', ORANGE_DK)
  s.addText('Pensado para a rotina', { x: px + 0.25, y: py + 1.5, w: pw - 0.5, h: 0.4, align: 'center', fontFace: HEAD, fontSize: 17, bold: true, color: INKTX, margin: 0 })
  s.addText('Menos cliques e menos rolagem em cada solicitação — desenhado para equipes que processam até 30 atendimentos por dia.', {
    x: px + 0.3, y: py + 2.0, w: pw - 0.6, h: 2.0, align: 'center', fontFace: BODY, fontSize: 13, color: MUT, lineSpacingMultiple: 1.15, margin: 0,
  })
  footer(s, 6)
}

// =================================================================
// SLIDE 7 — PDF automatico
// =================================================================
async function s7() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Geração da OC', 'O PDF da OC, idêntico ao modelo, gerado sozinho')
  // mock de documento a esquerda
  const dx = M, dy = 2.0, dw = 4.0, dh = 4.5
  s.addShape(pres.shapes.RECTANGLE, { x: dx, y: dy, w: dw, h: dh, fill: { color: PAPER }, line: { color: LINE, width: 1.5 }, shadow: { type: 'outer', color: '000000', blur: 8, offset: 3, angle: 135, opacity: 0.12 } })
  s.addShape(pres.shapes.RECTANGLE, { x: dx, y: dy, w: dw, h: 0.7, fill: { color: INK }, line: { type: 'none' } })
  s.addText('ORDEM DE CARREGAMENTO', { x: dx + 0.25, y: dy, w: dw - 1, h: 0.7, valign: 'middle', fontFace: HEAD, fontSize: 13, bold: true, color: PAPER, margin: 0 })
  s.addText('Nº', { x: dx + dw - 0.95, y: dy, w: 0.8, h: 0.7, align: 'right', valign: 'middle', fontFace: HEAD, fontSize: 12, bold: true, color: ORANGE, margin: 0 })
  const lines = ['Filial', 'Subcontratada', 'Motorista', 'Cavalo / Carreta', 'Cliente / Destino', 'Material', 'Validade']
  let ly = dy + 0.95
  for (const l of lines) {
    s.addText(l, { x: dx + 0.25, y: ly, w: 1.7, h: 0.3, fontFace: BODY, fontSize: 10, color: MUT2, margin: 0 })
    s.addShape(pres.shapes.RECTANGLE, { x: dx + 1.9, y: ly + 0.18, w: dw - 2.2, h: 0.02, fill: { color: LINE }, line: { type: 'none' } })
    ly += 0.48
  }
  s.addShape(pres.shapes.RECTANGLE, { x: dx, y: dy + dh - 0.12, w: dw, h: 0.12, fill: { color: ORANGE }, line: { type: 'none' } })
  // beneficios a direita
  const bx = 5.2, bw = 7.4
  const benefits = [
    [fa.FaFilePdf, 'Zero digitação de layout', 'O sistema monta a OC no padrão oficial — você não formata nada.'],
    [fa.FaCloudUploadAlt, 'Salva na nuvem com segurança', 'Cada OC fica guardada em bucket privado, acessível só por quem deve.'],
    [fa.FaLink, 'Link seguro temporário', 'Compartilhe por link que expira — sem expor o arquivo para sempre.'],
    [fa.FaWhatsapp, 'Envio por WhatsApp', 'Mensagem pronta com o link da OC, direto do sistema.'],
  ]
  let by = 2.0
  for (const [Ic, t, d] of benefits) {
    await iconChip(s, Ic, bx, by, 0.85, 'FFE7DA', ORANGE_DK)
    s.addText(t, { x: bx + 1.1, y: by + 0.02, w: bw - 1.1, h: 0.4, fontFace: BODY, fontSize: 16, bold: true, color: INKTX, margin: 0 })
    s.addText(d, { x: bx + 1.1, y: by + 0.44, w: bw - 1.1, h: 0.5, fontFace: BODY, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.0, margin: 0 })
    by += 1.14
  }
  footer(s, 7)
}

// =================================================================
// SLIDE 8 — Sistema integrado (fluxo)
// =================================================================
async function s8() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Integração', 'Tudo conectado, numa fonte única de verdade')
  const nodes = [
    [fa.FaDatabase, 'Cadastros'],
    [fa.FaClipboardList, 'Solicitação'],
    [fa.FaFilePdf, 'OC em PDF'],
    [fa.FaWhatsapp, 'WhatsApp'],
    [fa.FaChartLine, 'Status & painel'],
  ]
  const n = nodes.length
  const cw = 2.05, gap = (W - 2 * M - n * cw) / (n - 1), y = 2.55, x0 = M
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap)
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cw, h: 2.0, fill: { color: MIST }, line: { color: LINE, width: 1 } })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cw, h: 0.07, fill: { color: ORANGE }, line: { type: 'none' } })
    await iconChip(s, nodes[i][0], x + (cw - 0.95) / 2, y + 0.32, 0.95, INK, ORANGE)
    s.addText(nodes[i][1], { x, y: y + 1.42, w: cw, h: 0.45, align: 'center', fontFace: BODY, fontSize: 14, bold: true, color: INKTX, margin: 0 })
    if (i < n - 1) {
      s.addImage({ data: await ic(fa.FaChevronRight, 'FF5100'), x: x + cw + gap / 2 - 0.16, y: y + 0.82, w: 0.32, h: 0.32 })
    }
  }
  // faixa inferior com 3 reforcos
  const fy = 5.3
  const reinf = [
    [fa.FaSyncAlt, 'Tempo real', 'O que um atendente altera aparece para todos na hora.'],
    [fa.FaLayerGroup, 'Fonte única', 'Um só lugar para dados, OCs e histórico — sem planilhas soltas.'],
    [fa.FaUsers, 'Multiusuário', 'A equipe inteira trabalha junta, sem versão duplicada de arquivo.'],
  ]
  const rw = 3.93, rg = 0.3
  for (let i = 0; i < 3; i++) {
    const x = M + i * (rw + rg)
    await iconChip(s, reinf[i][0], x, fy, 0.7, 'FFE7DA', ORANGE_DK)
    s.addText(reinf[i][1], { x: x + 0.9, y: fy - 0.05, w: rw - 0.9, h: 0.35, fontFace: BODY, fontSize: 14, bold: true, color: INKTX, margin: 0 })
    s.addText(reinf[i][2], { x: x + 0.9, y: fy + 0.32, w: rw - 0.9, h: 0.7, fontFace: BODY, fontSize: 11, color: MUT, lineSpacingMultiple: 1.0, margin: 0 })
  }
  footer(s, 8)
}

// =================================================================
// SLIDE 9 — Acompanhamento e gestao
// =================================================================
async function s9() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Gestão', 'Visão e controle da operação inteira')
  const cards = [
    [fa.FaChartLine, 'Dashboard em tempo real', 'Volume de OCs, tempo médio, finalizadas e pendentes — num olhar só.'],
    [fa.FaStream, 'Status & linha do tempo', 'Cada solicitação mostra exatamente em que etapa está e quando mudou.'],
    [fa.FaSearch, 'Busca global (Ctrl+K)', 'Encontre qualquer OC, cliente ou motorista de qualquer tela, na hora.'],
    [fa.FaClipboardCheck, 'Auditoria & relatórios', 'Quem fez o quê e quando, com relatórios por cliente, motorista e período.'],
  ]
  const cw = 5.78, ch = 1.95, gx = 0.34, gy = 0.3, x0 = M, y0 = 1.95
  for (let i = 0; i < cards.length; i++) {
    const col = i % 2, r = Math.floor(i / 2)
    const x = x0 + col * (cw + gx)
    const y = y0 + r * (ch + gy)
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cw, h: ch, fill: { color: MIST }, line: { color: LINE, width: 1 } })
    await iconChip(s, cards[i][0], x + 0.35, y + 0.35, 0.9, INK, ORANGE)
    s.addText(cards[i][1], { x: x + 1.45, y: y + 0.38, w: cw - 1.7, h: 0.45, fontFace: BODY, fontSize: 16.5, bold: true, color: INKTX, margin: 0 })
    s.addText(cards[i][2], { x: x + 1.45, y: y + 0.86, w: cw - 1.7, h: 0.9, fontFace: BODY, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.05, margin: 0 })
  }
  footer(s, 9)
}

// =================================================================
// SLIDE 10 — Menos erros, mais controle
// =================================================================
async function s10() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Confiabilidade', 'Dado certo na primeira vez')
  const cards = [
    [fa.FaCheckDouble, 'Validações automáticas', 'CPF, CNPJ, placa e telefone conferidos no preenchimento.'],
    [fa.FaEquals, 'Padronização', 'Nada de “mesmo cliente escrito de cinco jeitos” entre planilhas.'],
    [fa.FaUserShield, 'Permissões por perfil', 'Cada pessoa enxerga e edita só o que o seu papel permite.'],
    [fa.FaHistory, 'Histórico auditável', 'Toda ação fica registrada — rastreabilidade total da operação.'],
  ]
  const cw = 2.92, gx = 0.28, y = 2.1, ch = 2.7, x0 = M
  for (let i = 0; i < cards.length; i++) {
    const x = x0 + i * (cw + gx)
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cw, h: ch, fill: { color: MIST }, line: { color: LINE, width: 1 } })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cw, h: 0.08, fill: { color: ORANGE }, line: { type: 'none' } })
    await iconChip(s, cards[i][0], x + (cw - 1.0) / 2, y + 0.4, 1.0, 'FFE7DA', ORANGE_DK)
    s.addText(cards[i][1], { x: x + 0.2, y: y + 1.55, w: cw - 0.4, h: 0.55, align: 'center', fontFace: BODY, fontSize: 14.5, bold: true, color: INKTX, margin: 0 })
    s.addText(cards[i][2], { x: x + 0.25, y: y + 2.0, w: cw - 0.5, h: 0.6, align: 'center', fontFace: BODY, fontSize: 11, color: MUT, lineSpacingMultiple: 1.0, margin: 0 })
  }
  s.addText('Menos correção, menos OC refeita, menos caminhão parado por erro de cadastro.', {
    x: M, y: 5.55, w: 11.9, h: 0.5, align: 'center', fontFace: HEAD, fontSize: 18, bold: true, color: INKTX, margin: 0,
  })
  footer(s, 10)
}

// =================================================================
// SLIDE 11 — Alem da emissao
// =================================================================
async function s11() {
  const s = pres.addSlide()
  s.background = { color: PAPER }
  head(s, 'Vai além', 'O sistema cresce junto com a operação')
  const px = M, pw = 5.78, gap = 0.34, py = 2.0, ph = 4.3
  // Portal
  s.addShape(pres.shapes.RECTANGLE, { x: px, y: py, w: pw, h: ph, fill: { color: MIST }, line: { color: LINE, width: 1 } })
  await iconChip(s, fa.FaNetworkWired, px + 0.4, py + 0.4, 1.0, INK, ORANGE)
  s.addText('Portal de Parceiros', { x: px + 1.55, y: py + 0.5, w: pw - 1.8, h: 0.5, fontFace: HEAD, fontSize: 20, bold: true, color: INKTX, margin: 0 })
  s.addText('Transportadora parceira cria a solicitação no portal e ela cai direto na inbox da LHG.', { x: px + 1.55, y: py + 1.0, w: pw - 1.8, h: 0.6, fontFace: BODY, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.0, margin: 0 })
  const pa = ['Ambiente isolado e seguro — vê só os próprios dados', 'Menos digitação para a equipe interna', 'Entrada de pedidos padronizada, sem WhatsApp solto']
  let yy = py + 2.0
  for (const t of pa) {
    s.addImage({ data: await ic(fa.FaCheckCircle, 'FF5100'), x: px + 0.45, y: yy + 0.03, w: 0.26, h: 0.26 })
    s.addText(t, { x: px + 0.85, y: yy - 0.05, w: pw - 1.2, h: 0.5, valign: 'top', fontFace: BODY, fontSize: 12.5, color: INKTX, margin: 0 })
    yy += 0.66
  }
  // Agente IA
  const qx = px + pw + gap
  s.addShape(pres.shapes.RECTANGLE, { x: qx, y: py, w: pw, h: ph, fill: { color: INK }, line: { type: 'none' } })
  s.addShape(pres.shapes.RECTANGLE, { x: qx, y: py, w: 0.08, h: ph, fill: { color: ORANGE }, line: { type: 'none' } })
  await iconChip(s, fa.FaRobot, qx + 0.4, py + 0.4, 1.0, ORANGE, PAPER)
  s.addText('Agente de WhatsApp com IA', { x: qx + 1.55, y: py + 0.5, w: pw - 1.8, h: 0.5, fontFace: HEAD, fontSize: 20, bold: true, color: PAPER, margin: 0 })
  s.addText('A mensagem do WhatsApp vira solicitação sozinha, com leitura inteligente dos dados.', { x: qx + 1.55, y: py + 1.0, w: pw - 1.8, h: 0.6, fontFace: BODY, fontSize: 12.5, color: 'C9CDD2', lineSpacingMultiple: 1.0, margin: 0 })
  const qa = ['Recebe o pedido e extrai motorista, placa e material', 'Cria a solicitação sem digitação manual', 'Operação 24/7, sem depender de alguém na tela']
  yy = py + 2.0
  for (const t of qa) {
    s.addImage({ data: await ic(fa.FaCheckCircle, 'FF5100'), x: qx + 0.45, y: yy + 0.03, w: 0.26, h: 0.26 })
    s.addText(t, { x: qx + 0.85, y: yy - 0.05, w: pw - 1.2, h: 0.5, valign: 'top', fontFace: BODY, fontSize: 12.5, color: PAPER, margin: 0 })
    yy += 0.66
  }
  footer(s, 11)
}

// =================================================================
// SLIDE 12 — Fechamento
// =================================================================
async function s12() {
  const s = pres.addSlide()
  s.background = { color: INK }
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.28, h: H, fill: { color: ORANGE }, line: { type: 'none' } })
  s.addText('EM RESUMO', { x: M, y: 0.9, w: 11, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: ORANGE, charSpacing: 3, margin: 0 })
  s.addText([
    { text: 'Mais OCs, ', options: { color: PAPER } },
    { text: 'menos cliques.', options: { color: ORANGE } },
  ], { x: M, y: 1.3, w: 11.9, h: 1.0, fontFace: HEAD, fontSize: 44, bold: true, margin: 0 })

  const wins = [
    [fa.FaBolt, 'Mais rápido', '≈ 90% menos tempo por OC — de minutos para segundos.'],
    [fa.FaLayerGroup, 'Integrado', 'Cadastros, solicitação, PDF e WhatsApp num fluxo só.'],
    [fa.FaCheckDouble, 'Sem retrabalho', 'Validação e padronização: dado certo na primeira vez.'],
    [fa.FaChartLine, 'Sob controle', 'Status, painel e auditoria de toda a operação.'],
  ]
  const cw = 2.92, gx = 0.28, y = 2.95, ch = 2.5, x0 = M
  for (let i = 0; i < wins.length; i++) {
    const x = x0 + i * (cw + gx)
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cw, h: ch, fill: { color: SLATE }, line: { color: '3A4048', width: 1 } })
    await iconChip(s, wins[i][0], x + (cw - 0.9) / 2, y + 0.35, 0.9, ORANGE, INK)
    s.addText(wins[i][1], { x: x + 0.2, y: y + 1.35, w: cw - 0.4, h: 0.4, align: 'center', fontFace: HEAD, fontSize: 17, bold: true, color: PAPER, margin: 0 })
    s.addText(wins[i][2], { x: x + 0.22, y: y + 1.78, w: cw - 0.44, h: 0.65, align: 'center', fontFace: BODY, fontSize: 11.5, color: 'C9CDD2', lineSpacingMultiple: 1.05, margin: 0 })
  }
  s.addText('SisLog LHG  ·  LHG Logística / OC Express Transportes', {
    x: M, y: 6.65, w: 11.9, h: 0.35, fontFace: BODY, fontSize: 12, bold: true, color: '9AA0A7', margin: 0,
  })
}

async function main() {
  await s1(); await s2(); await s3(); await s4(); await s5(); await s6()
  await s7(); await s8(); await s9(); await s10(); await s11(); await s12()
  await pres.writeFile({ fileName: 'SisLog-LHG-Vantagens.pptx' })
  console.log('OK: SisLog-LHG-Vantagens.pptx')
}
main().catch((e) => { console.error(e); process.exit(1) })
