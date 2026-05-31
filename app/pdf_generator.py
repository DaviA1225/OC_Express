"""
Gerador de PDF para Ordem de Carregamento usando ReportLab.
Layout baseado no arquivo 'OC Modelo1.xlsx'.
"""
from datetime import date
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

LARANJA = colors.HexColor("#FF3300")
AMARELO = colors.HexColor("#FFFFA7")
CINZA_CLARO = colors.HexColor("#F0F0F0")
VERMELHO = colors.HexColor("#CC0000")
BRANCO = colors.white
PRETO = colors.black


def _fmt_date(d) -> str:
    if isinstance(d, date):
        return d.strftime("%d/%m/%Y")
    if isinstance(d, str) and d:
        try:
            y, m, day = d.split("-")
            return f"{day}/{m}/{y}"
        except Exception:
            pass
    return str(d) if d else ""


def _style(name="Normal", **kwargs) -> ParagraphStyle:
    base = getSampleStyleSheet()[name]
    return ParagraphStyle(name + "_custom", parent=base, **kwargs)


def gerar_pdf(data: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )

    story = []

    # ── 1. Cabeçalho da empresa ──────────────────────────────────────────────
    h_empresa = _style(fontSize=20, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=0)
    h_cnpj = _style(fontSize=9, fontName="Helvetica", alignment=TA_CENTER, spaceAfter=2)

    story.append(Paragraph("OC EXPRESS TRANSPORTES", h_empresa))
    story.append(Paragraph("CNPJ 50.438.766/0003-92", h_cnpj))
    story.append(Spacer(1, 3 * mm))

    # ── 2. Título laranja "ORDEM DE CARREGAMENTO" ───────────────────────────
    titulo_style = _style(
        fontSize=20,
        fontName="Helvetica-Bold",
        alignment=TA_CENTER,
        textColor=BRANCO,
        backColor=LARANJA,
        spaceBefore=0,
        spaceAfter=0,
        leading=28,
    )
    titulo_data = [[Paragraph("ORDEM DE CARREGAMENTO", titulo_style)]]
    titulo_table = Table(titulo_data, colWidths=[doc.width])
    titulo_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LARANJA),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(titulo_table)
    story.append(Spacer(1, 3 * mm))

    # ── 3. Número da OC ─────────────────────────────────────────────────────
    numero_style = _style(fontSize=12, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    asterisk_style = _style(fontSize=12, fontName="Helvetica-Bold", textColor=VERMELHO)
    numero_data = [[
        Paragraph('<font color="#FF0000">*</font> N° OC:', numero_style),
        Paragraph(f"<b>{data.get('numero', '')}</b>", numero_style),
    ]]
    numero_table = Table(numero_data, colWidths=[doc.width * 0.85, doc.width * 0.15])
    numero_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "RIGHT"),
        ("ALIGN", (1, 0), (1, 0), "LEFT"),
    ]))
    story.append(numero_table)
    story.append(Spacer(1, 2 * mm))

    # ── 4. Tabela de campos ─────────────────────────────────────────────────
    lbl = lambda txt: Paragraph(f"<b>{txt}</b>", _style(fontSize=10, fontName="Helvetica-Bold"))
    val = lambda txt: Paragraph(str(txt or ""), _style(fontSize=10, fontName="Helvetica-Bold"))
    ast = lambda: Paragraph('<font color="#FF0000"><b>*</b></font>', _style(fontSize=10, fontName="Helvetica-Bold", alignment=TA_CENTER))
    vazio = Paragraph("", _style())

    W = doc.width
    # Larguras: label | ast | valor | label2 | ast2 | valor2
    COL = [W * 0.18, W * 0.03, W * 0.29, W * 0.18, W * 0.03, W * 0.29]
    COL_FULL = [W * 0.18, W * 0.03, W * 0.79]

    # Composição veicular na ordem física exigida pela ANTT:
    #   Cavalo → 1ª Carreta → Dolly → Última Carreta.
    # 1ª Carreta e Dolly são opcionais — omitidas quando vazias. As placas são
    # pareadas duas por linha mantendo a sequência (esquerda→direita, cima→baixo).
    placas = [("Cavalo", True, data.get("cavalo_placa", ""))]
    if str(data.get("primeira_carreta") or "").strip():
        placas.append(("1ª Carreta", False, str(data.get("primeira_carreta")).strip()))
    if str(data.get("dolly") or "").strip():
        placas.append(("Dolly", False, str(data.get("dolly")).strip()))
    placas.append(("Última Carreta", True, data.get("ultima_carreta", "")))

    def _cell_ast(with_ast):
        return ast() if with_ast else vazio

    # Monta as linhas dinamicamente e registra os índices para os SPANs/cinza.
    campos_data = []
    span_full_rows = []   # valor com colspan 2→5 (linha sem coluna direita)
    cinza_right_rows = []  # linha com label à direita (col 3) em cinza

    def add_full(label, value, with_ast=False):
        idx = len(campos_data)
        campos_data.append([lbl(label), _cell_ast(with_ast), val(value), "", "", ""])
        span_full_rows.append(idx)

    add_full("Filial", data.get("filial", ""))
    add_full("Subcontratada", data.get("subcontratada", ""), with_ast=True)
    add_full("Motorista", data.get("motorista", ""), with_ast=True)

    for i in range(0, len(placas), 2):
        left = placas[i]
        right = placas[i + 1] if i + 1 < len(placas) else None
        idx = len(campos_data)
        row = [lbl(left[0]), _cell_ast(left[1]), val(left[2])]
        if right is not None:
            row += [lbl(right[0]), _cell_ast(right[1]), val(right[2])]
            cinza_right_rows.append(idx)
        else:
            row += ["", "", ""]
            span_full_rows.append(idx)
        campos_data.append(row)

    idx = len(campos_data)
    campos_data.append([lbl("Carregamento"), vazio, val(data.get("carregamento", "")),
                        lbl("Destino"), vazio, val(data.get("destino", ""))])
    cinza_right_rows.append(idx)

    idx = len(campos_data)
    campos_data.append([lbl("Instrução"), vazio, val(data.get("instrucao", "")),
                        lbl("Descarga"), vazio, val(data.get("descarga", ""))])
    cinza_right_rows.append(idx)

    add_full("Material", data.get("material", ""))
    add_full("Autorizado", data.get("autorizado_por", "DAVI ASAF SILVA"))
    add_full(
        "Validade",
        f"{_fmt_date(data.get('validade_inicio'))}   a   {_fmt_date(data.get('validade_fim'))}",
    )

    campos_table = Table(campos_data, colWidths=COL)
    campos_style = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        # Coluna de labels (esquerda) com fundo cinza
        ("BACKGROUND", (0, 0), (0, -1), CINZA_CLARO),
    ]
    for idx in cinza_right_rows:
        campos_style.append(("BACKGROUND", (3, idx), (3, idx), CINZA_CLARO))
    for idx in span_full_rows:
        campos_style.append(("SPAN", (2, idx), (5, idx)))
    campos_table.setStyle(TableStyle(campos_style))
    story.append(campos_table)
    story.append(Spacer(1, 5 * mm))

    # ── 5. Seção IMPORTANTE ─────────────────────────────────────────────────
    imp_titulo_style = _style(
        fontSize=17,
        fontName="Helvetica-Bold",
        alignment=TA_CENTER,
        textColor=BRANCO,
        backColor=LARANJA,
        leading=26,
    )
    imp_titulo_data = [[Paragraph("IMPORTANTE — LEIA COM ATENÇÃO", imp_titulo_style)]]
    imp_titulo_table = Table(imp_titulo_data, colWidths=[doc.width])
    imp_titulo_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LARANJA),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(imp_titulo_table)

    destaque = _style(
        fontSize=11,
        fontName="Helvetica-Bold",
        textColor=VERMELHO,
        spaceAfter=2,
        leftIndent=5,
    )
    normal_imp = _style(
        fontSize=10,
        fontName="Helvetica-Bold",
        spaceAfter=2,
        leftIndent=5,
    )

    notas = [
        (True,  "Após descarregar, enviar Foto do comprovante para baixa do MDFE."),
        (True,  "ENVIAR COMPROVANTE DE DESCARGA PARA O NÚMERO (67) 99632-9066"),
        (False, " "),
        (False, "1° Obrigatório: Uso de EPIS (capacete, calça, colete e botina)."),
        (False, "     Caçambas limpas para evitar contaminação do minério."),
        (False, "2° Proibido: Acompanhantes dentro do pátio de carregamento."),
        (False, "     Erguer báscula dentro dos pátios."),
        (False, "3° Confira seus dados (*) na OC e as placas da composição (cavalo, carretas e dolly)."),
        (False, "4° Antes de deixar a Mina, certifique-se:"),
        (False, "     Nota Fiscal, CTE e MDFE estejam emitidos corretamente."),
        (False, "5° Certifique-se: recebimento valor do frete assim como o pedágio."),
        (False, "6° Organize seu agendamento de descarga com nossa filial mais próxima."),
    ]

    notas_paragrafos = [
        [Paragraph(texto, destaque if é_destaque else normal_imp)]
        for é_destaque, texto in notas
    ]

    notas_table = Table(notas_paragrafos, colWidths=[doc.width])
    notas_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMARELO),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E000")),
    ]))
    story.append(notas_table)

    # ── 6. Rodapé ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    rodape_style = _style(fontSize=8, textColor=colors.grey, alignment=TA_CENTER)
    story.append(Paragraph("Documento gerado eletronicamente — OC Express Transportes", rodape_style))

    doc.build(story)
    return buf.getvalue()
