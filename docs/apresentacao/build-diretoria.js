/* SisLog LHG — apresentação executiva para a diretoria da mineradora.
   Identidade LHG: grafite + laranja #FF5100 como acento. */
const pptxgen = require('pptxgenjs')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const sharp = require('sharp')
const fa = require('react-icons/fa')

// ---------- paleta ----------
const INK = '1D1E1B', SLATE = '2A2F36', PAPER = 'FFFFFF'
const MIST = 'F4F6F8', LINE = 'E2E6EA'
const ORANGE = 'FF5100', ORANGE_DK = 'C44612', GREEN = '15803D', RED = 'B23B30'
const INKTX = '20242A', MUT = '5B6470', MUT2 = '8A929C'
const HEAD = 'Bahnschrift', BODY = 'Segoe UI'
const W = 13.3, H = 7.5, M = 0.7
const RECT = 'rect', OVAL = 'ellipse', RREC = 'roundRect'

const pres = new pptxgen()
pres.defineLayout({ name: 'WIDE', width: W, height: H })
pres.layout = 'WIDE'
pres.author = 'LHG Logistica'
pres.title = 'SisLog LHG — Apresentacao executiva'

// ---------- icones ----------
const cache = {}
async function ic(Comp, color) {
  const key = Comp.name + color
  if (cache[key]) return cache[key]
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: '256' }))
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  cache[key] = 'image/png;base64,' + png.toString('base64')
  return cache[key]
}

// ---------- helpers ----------
function tab(s, color = ORANGE) { s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.16, h: H, fill: { color }, line: { type: 'none' } }) }
function bar(s, x, y, w, h, color) { s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color }, line: { type: 'none' } }) }
function box(s, x, y, w, h, fill, ln) { s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: ln ? { color: ln, width: 1 } : { type: 'none' } }) }
function T(s, t, o) { s.addText(t, Object.assign({ fontFace: BODY, margin: 0 }, o)) }
function footer(s, n) {
  T(s, [{ text: 'SisLog LHG', options: { bold: true, color: INKTX } }, { text: '   ·   LHG Logística / OC Express', options: { color: MUT2 } }],
    { x: M, y: H - 0.46, w: 9, h: 0.3, fontSize: 9, valign: 'middle' })
  T(s, String(n).padStart(2, '0') + ' / 13', { x: W - 1.9, y: H - 0.46, w: 1.2, h: 0.3, align: 'right', fontSize: 9, color: MUT2, valign: 'middle' })
}
function head(s, kicker, title) {
  tab(s)
  T(s, kicker.toUpperCase(), { x: M, y: 0.5, w: 11.9, h: 0.3, fontSize: 12, bold: true, color: ORANGE, charSpacing: 2 })
  T(s, title, { x: M, y: 0.82, w: 11.9, h: 0.8, fontFace: HEAD, fontSize: 31, bold: true, color: INKTX })
}
async function iconChip(s, Comp, x, y, d, circle, iconColor) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: circle }, line: { type: 'none' } })
  const pad = d * 0.27
  s.addImage({ data: await ic(Comp, iconColor), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad })
}
// grade de 4 cards (claro ou escuro)
async function fourCards(s, y, cards, dark) {
  const cw = 2.92, gx = 0.28, ch = 2.7, x0 = M
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (cw + gx)
    box(s, x, y, cw, ch, dark ? SLATE : MIST, dark ? '3A4048' : LINE)
    bar(s, x, y, cw, 0.08, ORANGE)
    await iconChip(s, cards[i][0], x + (cw - 0.95) / 2, y + 0.42, 0.95, dark ? ORANGE : INK, dark ? INK : ORANGE)
    T(s, cards[i][1], { x: x + 0.2, y: y + 1.6, w: cw - 0.4, h: 0.5, align: 'center', fontFace: HEAD, fontSize: 16, bold: true, color: dark ? PAPER : INKTX })
    T(s, cards[i][2], { x: x + 0.28, y: y + 2.08, w: cw - 0.56, h: 0.6, align: 'center', fontSize: 11, color: dark ? 'C9CDD2' : MUT, lineSpacingMultiple: 1.05 })
  }
}

// ============================================================ S1 — Capa
async function s1() {
  const s = pres.addSlide(); s.background = { color: INK }
  bar(s, 0, 0, 0.28, H, ORANGE)
  bar(s, W - 3.6, H - 0.9, 3.6, 0.9, ORANGE)
  T(s, 'PLATAFORMA DE OPERAÇÃO LOGÍSTICA', { x: 1.0, y: 1.3, w: 11, h: 0.4, fontSize: 14, bold: true, color: 'C9CDD2', charSpacing: 3 })
  T(s, [{ text: 'SisLog', options: { color: PAPER } }, { text: ' LHG', options: { color: ORANGE } }], { x: 0.95, y: 1.9, w: 11.5, h: 1.5, fontFace: HEAD, fontSize: 72, bold: true })
  T(s, 'Emissão, rastreabilidade e gestão das Ordens de Carregamento\ndo transporte de minério.', { x: 1.0, y: 3.7, w: 10.8, h: 1.1, fontSize: 20, color: 'E7E9EC', lineSpacingMultiple: 1.1 })
  const seals = ['Rastreável', 'Integrado', 'Auditado']; let x = 1.0
  for (const t of seals) { const w = 0.42 + t.length * 0.135; s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.55, w, h: 0.5, rectRadius: 0.06, fill: { color: SLATE }, line: { color: '3A4048', width: 1 } }); T(s, t, { x, y: 5.55, w, h: 0.5, align: 'center', valign: 'middle', fontSize: 13, bold: true, color: PAPER }); x += w + 0.25 }
  T(s, 'Apresentação à diretoria', { x: 1.0, y: 6.65, w: 10, h: 0.3, fontSize: 11, color: '9AA0A7' })
}

// ============================================================ S2 — Contexto
async function s2() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'O contexto', 'Cada carregamento vira uma Ordem de Carregamento')
  const rows = [
    [fa.FaTable, 'Preenchimento manual', 'Cada OC digitada campo a campo numa planilha — lento e repetitivo, dezenas de vezes ao dia.'],
    [fa.FaExclamationTriangle, 'Erro sem trava', 'Placa, CPF ou material trocados só aparecem no caminhão — retrabalho e atraso.'],
    [fa.FaEyeSlash, 'Sem rastreabilidade', 'Onde está cada OC? Acompanhamento por conversa e memória, não por sistema.'],
    [fa.FaFileExcel, 'Dado isolado', 'A planilha vive numa máquina — sem histórico, sem visão da equipe, sem indicadores.'],
  ]
  const colW = 5.75, gap = 0.4, x0 = M, rowH = 1.5, y0 = 1.9
  for (let i = 0; i < rows.length; i++) {
    const col = i % 2, r = Math.floor(i / 2), x = x0 + col * (colW + gap), y = y0 + r * (rowH + 0.22)
    box(s, x, y, colW, rowH, MIST, LINE)
    bar(s, x, y, 0.07, rowH, RED)
    await iconChip(s, rows[i][0], x + 0.28, y + 0.4, 0.7, 'FBE3DF', RED)
    T(s, rows[i][1], { x: x + 1.2, y: y + 0.24, w: colW - 1.45, h: 0.4, fontSize: 15, bold: true, color: INKTX })
    T(s, rows[i][2], { x: x + 1.2, y: y + 0.66, w: colW - 1.45, h: 0.75, fontSize: 11.5, color: MUT, lineSpacingMultiple: 1.0 })
  }
  T(s, 'O SisLog substitui esse fluxo por uma plataforma única, rápida e rastreável.', { x: M, y: 6.55, w: 11.9, h: 0.4, align: 'center', fontFace: HEAD, fontSize: 16, bold: true, color: INKTX })
  footer(s, 2)
}

// ============================================================ S3 — A solução
async function s3() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'A solução', 'Uma plataforma para emitir, acompanhar e auditar cada OC')
  const cards = [
    [fa.FaDesktop, 'Sistema interno', 'A equipe LHG emite as OCs, acompanha o status e audita cada operação.'],
    [fa.FaNetworkWired, 'Portal de parceiros', 'A transportadora parceira envia solicitações num ambiente isolado e seguro.'],
    [fa.FaRobot, 'Agente WhatsApp com IA', 'A mensagem de WhatsApp vira solicitação automaticamente, com leitura inteligente.'],
  ]
  const cw = 3.83, gap = 0.2, y = 2.1, ch = 3.4, x0 = M
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (cw + gap)
    box(s, x, y, cw, ch, MIST, LINE)
    bar(s, x, y, cw, 0.08, ORANGE)
    await iconChip(s, cards[i][0], x + (cw - 1.0) / 2, y + 0.5, 1.0, INK, ORANGE)
    T(s, cards[i][1], { x: x + 0.2, y: y + 1.72, w: cw - 0.4, h: 0.5, align: 'center', fontFace: HEAD, fontSize: 18, bold: true, color: INKTX })
    T(s, cards[i][2], { x: x + 0.35, y: y + 2.25, w: cw - 0.7, h: 1.0, align: 'center', fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.1 })
  }
  T(s, 'Três superfícies, uma só base de dados — sempre em sincronia.', { x: M, y: 6.05, w: 11.9, h: 0.4, align: 'center', fontSize: 13, italic: true, color: MUT })
  footer(s, 3)
}

// ============================================================ S4 — Fluxo integrado
async function s4() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'Integração', 'Um fluxo único, do cadastro ao painel')
  const nodes = [[fa.FaDatabase, 'Cadastros'], [fa.FaClipboardList, 'Solicitação'], [fa.FaFilePdf, 'OC em PDF'], [fa.FaWhatsapp, 'WhatsApp'], [fa.FaChartLine, 'Painel & Status']]
  const n = nodes.length, cw = 2.05, gap = (W - 2 * M - n * cw) / (n - 1), y = 2.55, x0 = M
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap)
    box(s, x, y, cw, 2.0, MIST, LINE)
    bar(s, x, y, cw, 0.07, ORANGE)
    await iconChip(s, nodes[i][0], x + (cw - 0.95) / 2, y + 0.32, 0.95, INK, ORANGE)
    T(s, nodes[i][1], { x, y: y + 1.42, w: cw, h: 0.45, align: 'center', fontSize: 14, bold: true, color: INKTX })
    if (i < n - 1) s.addImage({ data: await ic(fa.FaChevronRight, 'FF5100'), x: x + cw + gap / 2 - 0.16, y: y + 0.82, w: 0.32, h: 0.32 })
  }
  const fy = 5.35, reinf = [[fa.FaSyncAlt, 'Tempo real', 'O que a equipe altera aparece para todos na hora.'], [fa.FaLayerGroup, 'Fonte única', 'Um só lugar para dados, OCs e histórico.'], [fa.FaUsers, 'Multiusuário', 'A equipe inteira trabalha junta, sem versão solta.']]
  const rw = 3.93, rg = 0.3
  for (let i = 0; i < 3; i++) {
    const x = M + i * (rw + rg)
    await iconChip(s, reinf[i][0], x, fy, 0.7, 'FFE7DA', ORANGE_DK)
    T(s, reinf[i][1], { x: x + 0.9, y: fy - 0.05, w: rw - 0.9, h: 0.35, fontSize: 14, bold: true, color: INKTX })
    T(s, reinf[i][2], { x: x + 0.9, y: fy + 0.32, w: rw - 0.9, h: 0.7, fontSize: 11, color: MUT, lineSpacingMultiple: 1.0 })
  }
  footer(s, 4)
}

// ============================================================ S5 — Agilidade
async function s5() {
  const s = pres.addSlide(); s.background = { color: INK }
  bar(s, 0, 0, 0.16, H, ORANGE)
  T(s, 'AGILIDADE DA OPERAÇÃO', { x: M, y: 0.55, w: 11, h: 0.3, fontSize: 12, bold: true, color: ORANGE, charSpacing: 2 })
  T(s, 'Menos tempo por OC, mais OCs por atendente', { x: M, y: 0.87, w: 11.9, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: PAPER })
  const cy = 2.1
  T(s, '≈ 10 min', { x: M, y: cy, w: 4.0, h: 1.1, fontFace: HEAD, fontSize: 46, bold: true, color: '9AA0A7', align: 'center' })
  T(s, 'por OC na planilha', { x: M, y: cy + 1.05, w: 4.0, h: 0.4, fontSize: 13, color: '9AA0A7', align: 'center' })
  s.addImage({ data: await ic(fa.FaArrowRight, 'FF5100'), x: M + 4.25, y: cy + 0.3, w: 0.7, h: 0.7 })
  T(s, '≈ 1 min', { x: M + 5.1, y: cy, w: 4.0, h: 1.1, fontFace: HEAD, fontSize: 46, bold: true, color: ORANGE, align: 'center' })
  T(s, 'por OC no SisLog', { x: M + 5.1, y: cy + 1.05, w: 4.0, h: 0.4, fontSize: 13, color: 'E7E9EC', align: 'center' })
  const stats = [['≈ 90%', 'menos tempo\nem cada OC'], ['≈ 4 h', 'liberadas por dia\ncom 30 OCs/dia'], ['0', 'redigitação de\ncadastros']]
  const cw = 3.66, g = 0.36, x0 = M, yy = 4.55, ch = 1.95
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (cw + g)
    box(s, x, yy, cw, ch, SLATE, '3A4048')
    bar(s, x, yy, cw, 0.08, ORANGE)
    T(s, stats[i][0], { x, y: yy + 0.25, w: cw, h: 0.9, align: 'center', fontFace: HEAD, fontSize: 44, bold: true, color: PAPER })
    T(s, stats[i][1], { x: x + 0.2, y: yy + 1.2, w: cw - 0.4, h: 0.7, align: 'center', fontSize: 13, color: 'C9CDD2', lineSpacingMultiple: 1.0 })
  }
  T(s, 'Estimativa operacional. Menos gargalo na emissão = caminhão liberado mais cedo.', { x: M, y: 6.75, w: 11.9, h: 0.35, fontSize: 10, italic: true, color: '8A929C' })
}

// ============================================================ S6 — Rastreabilidade
async function s6() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'Rastreabilidade', 'Cada OC tem estado e linha do tempo')
  const steps = ['Recebida', 'Em emissão', 'Instrução', 'OC gerada', 'OC enviada', 'Finalizada']
  const n = steps.length, cw = 1.72, gap = (W - 2 * M - n * cw) / (n - 1), y = 2.2, x0 = M
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap), fill = i === n - 1 ? GREEN : ORANGE
    if (i < n - 1) bar(s, x + cw / 2, y + 0.235, cw + gap, 0.03, 'E0A98C')
    s.addShape(pres.shapes.OVAL, { x: x + (cw - 0.5) / 2, y, w: 0.5, h: 0.5, fill: { color: fill }, line: { type: 'none' } })
    T(s, String(i + 1), { x: x + (cw - 0.5) / 2, y, w: 0.5, h: 0.5, align: 'center', valign: 'middle', fontFace: HEAD, fontSize: 18, bold: true, color: PAPER })
    T(s, steps[i], { x: x - 0.1, y: y + 0.62, w: cw + 0.2, h: 0.5, align: 'center', fontSize: 12, bold: true, color: INKTX })
  }
  const fy = 4.05, cards = [
    [fa.FaStream, 'Linha do tempo', 'Quem avançou cada etapa e quando — histórico completo por OC.'],
    [fa.FaClock, 'Alerta de SLA', 'OC parada há muito tempo acende em vermelho para atendimento prioritário.'],
    [fa.FaSearch, 'Conferência de viagem', 'Localize qualquer OC por número, motorista, CPF, placa ou cliente.'],
  ]
  const cw2 = 3.93, g = 0.3
  for (let i = 0; i < 3; i++) {
    const x = M + i * (cw2 + g)
    box(s, x, fy, cw2, 2.05, MIST, LINE)
    await iconChip(s, cards[i][0], x + 0.35, fy + 0.35, 0.85, INK, ORANGE)
    T(s, cards[i][1], { x: x + 1.4, y: fy + 0.42, w: cw2 - 1.6, h: 0.45, fontSize: 15, bold: true, color: INKTX })
    T(s, cards[i][2], { x: x + 1.4, y: fy + 0.9, w: cw2 - 1.6, h: 1.0, fontSize: 11.5, color: MUT, lineSpacingMultiple: 1.05 })
  }
  footer(s, 6)
}

// ============================================================ S7 — Painel & BI
async function s7() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'Painel & indicadores', 'Visão da operação em tempo real')
  await fourCards(s, 2.1, [
    [fa.FaChartLine, 'Dashboard', 'Volume, finalizadas, tempo médio e a fila de pendências, num olhar.'],
    [fa.FaHourglassHalf, 'Tempo por etapa (TMA)', 'Quanto cada OC leva para sair de cada status — onde está o gargalo.'],
    [fa.FaTrophy, 'Rankings', 'Tops de clientes, motoristas, veículos, subcontratadas e atendentes.'],
    [fa.FaFileCsv, 'Export para Excel', 'Todo relatório sai em CSV; visão segmentada interno × parceiros.'],
  ], false)
  T(s, 'A gestão enxerga a operação de carregamento que serve à mina — sem pedir planilha a ninguém.', { x: M, y: 5.35, w: 11.9, h: 0.5, align: 'center', fontFace: HEAD, fontSize: 17, bold: true, color: INKTX })
  footer(s, 7)
}

// ============================================================ S8 — Confiabilidade do dado
async function s8() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'Confiabilidade', 'Dado certo na primeira vez')
  await fourCards(s, 2.1, [
    [fa.FaCheckDouble, 'Validação automática', 'CPF, CNPJ, placa e telefone conferidos no preenchimento.'],
    [fa.FaEquals, 'Padronização', 'Nada de o mesmo cliente escrito de cinco jeitos entre planilhas.'],
    [fa.FaBoxes, 'Cadastros reutilizáveis', 'Motorista, veículo e cliente cadastrados uma vez, usados sempre.'],
    [fa.FaFilePdf, 'OC idêntica ao modelo', 'O PDF é gerado no padrão oficial, sem digitação de layout.'],
  ], false)
  T(s, 'Menos correção, menos OC refeita, menos caminhão parado por erro de documento.', { x: M, y: 5.35, w: 11.9, h: 0.5, align: 'center', fontFace: HEAD, fontSize: 17, bold: true, color: INKTX })
  footer(s, 8)
}

// ============================================================ S9 — Governança & segurança
async function s9() {
  const s = pres.addSlide(); s.background = { color: INK }
  bar(s, 0, 0, 0.16, H, ORANGE)
  T(s, 'GOVERNANÇA & SEGURANÇA', { x: M, y: 0.55, w: 11, h: 0.3, fontSize: 12, bold: true, color: ORANGE, charSpacing: 2 })
  T(s, 'Controle e conformidade de nível corporativo', { x: M, y: 0.87, w: 11.9, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: PAPER })
  await fourCards(s, 2.2, [
    [fa.FaHistory, 'Auditoria completa', 'Quem fez o quê e quando, em cada OC e cadastro — rastreável.'],
    [fa.FaUserShield, 'Permissões por perfil', 'Cada pessoa acessa só o que o seu papel permite.'],
    [fa.FaLock, 'Acesso protegido', 'Autenticação forte (2FA) e proteção anti-força-bruta no login.'],
    [fa.FaPowerOff, 'Continuidade & padrões', 'Modo manutenção controlado e acessibilidade (WCAG AA).'],
  ], true)
  T(s, 'Dados sensíveis isolados por regras no banco; conformidade pensada desde a base.', { x: M, y: 5.4, w: 11.9, h: 0.4, align: 'center', fontSize: 12, italic: true, color: 'C9CDD2' })
  footer(s, 9)
}

// ============================================================ S10 — Portal de parceiros
async function s10() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'Ecossistema', 'Portal de parceiros — entrada estruturada e isolada')
  const px = M, pw = 5.78, gap = 0.34, py = 2.0, ph = 4.3
  box(s, px, py, pw, ph, MIST, LINE)
  await iconChip(s, fa.FaNetworkWired, px + 0.4, py + 0.4, 1.0, INK, ORANGE)
  T(s, 'Como funciona', { x: px + 1.55, y: py + 0.5, w: pw - 1.8, h: 0.5, fontFace: HEAD, fontSize: 20, bold: true, color: INKTX })
  T(s, 'A transportadora parceira cria a solicitação no portal e ela cai direto na inbox da LHG.', { x: px + 1.55, y: py + 1.0, w: pw - 1.8, h: 0.7, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.05 })
  let yy = py + 2.0
  for (const t of ['Ambiente isolado — o parceiro vê só os próprios dados', 'Entrada de pedidos padronizada, sem WhatsApp solto', 'A base interna da LHG nunca é exposta']) {
    s.addImage({ data: await ic(fa.FaCheckCircle, 'FF5100'), x: px + 0.45, y: yy + 0.03, w: 0.26, h: 0.26 })
    T(s, t, { x: px + 0.85, y: yy - 0.05, w: pw - 1.2, h: 0.5, fontSize: 12.5, color: INKTX })
    yy += 0.66
  }
  const qx = px + pw + gap
  box(s, qx, py, pw, ph, INK, null)
  bar(s, qx, py, 0.08, ph, ORANGE)
  await iconChip(s, fa.FaShieldAlt, qx + 0.4, py + 0.4, 1.0, ORANGE, INK)
  T(s, 'Por que importa', { x: qx + 1.55, y: py + 0.5, w: pw - 1.8, h: 0.5, fontFace: HEAD, fontSize: 20, bold: true, color: PAPER })
  T(s, 'Abre uma porta de entrada de carga sem abrir mão do controle nem da segurança dos dados.', { x: qx + 1.55, y: py + 1.0, w: pw - 1.8, h: 0.7, fontSize: 12.5, color: 'C9CDD2', lineSpacingMultiple: 1.05 })
  yy = py + 2.0
  for (const t of ['Mais capacidade de atendimento à mina', 'Menos digitação para a equipe interna', 'Rastreabilidade também do que vem do parceiro']) {
    s.addImage({ data: await ic(fa.FaCheckCircle, 'FF5100'), x: qx + 0.45, y: yy + 0.03, w: 0.26, h: 0.26 })
    T(s, t, { x: qx + 0.85, y: yy - 0.05, w: pw - 1.2, h: 0.5, fontSize: 12.5, color: PAPER })
    yy += 0.66
  }
  footer(s, 10)
}

// ============================================================ S11 — Agente IA
async function s11() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'Inovação', 'Agente de WhatsApp com IA')
  const steps = [
    ['1', 'Recebe a mensagem', 'O solicitante manda o pedido de carregamento pelo WhatsApp, como já faz hoje.'],
    ['2', 'Lê com inteligência', 'A IA (Claude) extrai motorista, placa, cliente e material do texto.'],
    ['3', 'Cria a solicitação', 'A OC entra no sistema sozinha, sem ninguém digitar — 24 horas por dia.'],
  ]
  const x0 = M, y0 = 2.1, rh = 1.25, w = 8.0
  for (let i = 0; i < steps.length; i++) {
    const y = y0 + i * (rh + 0.12)
    s.addShape(pres.shapes.OVAL, { x: x0, y: y + 0.12, w: 0.78, h: 0.78, fill: { color: ORANGE }, line: { type: 'none' } })
    T(s, steps[i][0], { x: x0, y: y + 0.12, w: 0.78, h: 0.78, align: 'center', valign: 'middle', fontFace: HEAD, fontSize: 30, bold: true, color: PAPER })
    T(s, steps[i][1], { x: x0 + 1.05, y: y + 0.12, w: w - 1.0, h: 0.4, fontSize: 16, bold: true, color: INKTX })
    T(s, steps[i][2], { x: x0 + 1.05, y: y + 0.55, w: w - 1.0, h: 0.6, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.05 })
    if (i < steps.length - 1) bar(s, x0 + 0.37, y + 0.9, 0.04, 0.47, 'F1C9B2')
  }
  const px = 9.35, pw = 3.25, py = 2.1, ph = 4.05
  box(s, px, py, pw, ph, INK, null)
  bar(s, px, py, 0.08, ph, ORANGE)
  await iconChip(s, fa.FaRobot, px + (pw - 0.9) / 2, py + 0.5, 0.9, ORANGE, INK)
  T(s, 'Da mensagem à OC', { x: px + 0.25, y: py + 1.6, w: pw - 0.5, h: 0.4, align: 'center', fontFace: HEAD, fontSize: 17, bold: true, color: PAPER })
  T(s, 'Operação 24/7, sem depender de alguém na tela — e sem digitação manual.', { x: px + 0.3, y: py + 2.1, w: pw - 0.6, h: 1.5, align: 'center', fontSize: 12.5, color: 'C9CDD2', lineSpacingMultiple: 1.15 })
  footer(s, 11)
}

// ============================================================ S12 — Valor para a mineradora
async function s12() {
  const s = pres.addSlide(); s.background = { color: PAPER }
  head(s, 'Por que importa', 'O que a mineradora ganha')
  const rows = [
    [fa.FaTruck, 'Caminhão liberado mais cedo', 'OC emitida em segundos reduz a espera no pátio e acelera o giro da frota.'],
    [fa.FaStream, 'Rastreabilidade dos carregamentos', 'Cada carga tem estado, histórico e responsável — nada se perde.'],
    [fa.FaCheckDouble, 'Menos erro no documento', 'Validação e padronização reduzem retrabalho e divergência.'],
    [fa.FaChartLine, 'Visibilidade da operação', 'Indicadores e relatórios da operação que serve à mina, em tempo real.'],
  ]
  let y = 2.0
  for (const r of rows) {
    box(s, M, y, 11.9, 1.0, MIST, LINE)
    await iconChip(s, r[0], M + 0.25, y + 0.2, 0.6, 'FFE7DA', ORANGE_DK)
    T(s, r[1], { x: M + 1.05, y: y + 0.15, w: 5.0, h: 0.7, valign: 'middle', fontFace: HEAD, fontSize: 16, bold: true, color: INKTX })
    T(s, r[2], { x: M + 6.1, y: y + 0.15, w: 5.6, h: 0.7, valign: 'middle', fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.05 })
    y += 1.12
  }
  footer(s, 12)
}

// ============================================================ S13 — Fechamento
async function s13() {
  const s = pres.addSlide(); s.background = { color: INK }
  bar(s, 0, 0, 0.28, H, ORANGE)
  T(s, 'EM RESUMO', { x: M, y: 0.9, w: 11, h: 0.4, fontSize: 13, bold: true, color: ORANGE, charSpacing: 3 })
  T(s, [{ text: 'Carregamento ', options: { color: PAPER } }, { text: 'rápido, rastreável e auditado.', options: { color: ORANGE } }], { x: M, y: 1.3, w: 11.9, h: 1.0, fontFace: HEAD, fontSize: 40, bold: true })
  const wins = [
    [fa.FaBolt, 'Rápido', '≈ 90% menos tempo por OC — de minutos para segundos.'],
    [fa.FaStream, 'Rastreável', 'Estado, linha do tempo e SLA em cada carregamento.'],
    [fa.FaCheckDouble, 'Confiável', 'Validação e padronização: dado certo na primeira vez.'],
    [fa.FaHistory, 'Auditado', 'Quem fez o quê e quando, com governança por perfil.'],
  ]
  const cw = 2.92, gx = 0.28, y = 2.95, ch = 2.5, x0 = M
  for (let i = 0; i < wins.length; i++) {
    const x = x0 + i * (cw + gx)
    box(s, x, y, cw, ch, SLATE, '3A4048')
    await iconChip(s, wins[i][0], x + (cw - 0.9) / 2, y + 0.35, 0.9, ORANGE, INK)
    T(s, wins[i][1], { x: x + 0.2, y: y + 1.35, w: cw - 0.4, h: 0.4, align: 'center', fontFace: HEAD, fontSize: 17, bold: true, color: PAPER })
    T(s, wins[i][2], { x: x + 0.22, y: y + 1.78, w: cw - 0.44, h: 0.65, align: 'center', fontSize: 11.5, color: 'C9CDD2', lineSpacingMultiple: 1.05 })
  }
  T(s, 'SisLog LHG  ·  LHG Logística / OC Express Transportes', { x: M, y: 6.65, w: 11.9, h: 0.35, fontSize: 12, bold: true, color: '9AA0A7' })
}

async function main() {
  await s1(); await s2(); await s3(); await s4(); await s5(); await s6(); await s7()
  await s8(); await s9(); await s10(); await s11(); await s12(); await s13()
  await pres.writeFile({ fileName: 'SisLog-LHG-Diretoria.pptx' })
  console.log('OK: SisLog-LHG-Diretoria.pptx')
}
main().catch((e) => { console.error(e); process.exit(1) })
