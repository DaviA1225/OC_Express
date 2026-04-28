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

    campos_data = [
        # Filial
        [lbl("Filial"), vazio, val(data.get("filial", "")), "", "", ""],
        # Subcontratada
        [lbl("Subcontratada"), ast(), val(data.get("subcontratada", "")), "", "", ""],
        # Motorista
        [lbl("Motorista"), ast(), val(data.get("motorista", "")), "", "", ""],
        # Cavalo | Última Carreta
        [lbl("Cavalo"), ast(), val(data.get("cavalo_placa", "")),
         lbl("Última Carreta"), ast(), val(data.get("ultima_carreta", ""))],
        # Carregamento | Destino
        [lbl("Carregamento"), vazio, val(data.get("carregamento", "")),
         lbl("Destino"), vazio, val(data.get("destino", ""))],
        # Instrução | Descarga
        [lbl("Instrução"), vazio, val(data.get("instrucao", "")),
         lbl("Descarga"), vazio, val(data.get("descarga", ""))],
        # Material
        [lbl("Material"), vazio, val(data.get("material", "")), "", "", ""],
        # Autorizado
        [lbl("Autorizado"), vazio, val(data.get("autorizado_por", "DAVI ASAF SILVA")), "", "", ""],
        # Validade
        [lbl("Validade"), vazio,
         val(f"{_fmt_date(data.get('validade_inicio'))}   a   {_fmt_date(data.get('validade_fim'))}"),
         "", "", ""],
    ]

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
        # Labels com fundo cinza
        ("BACKGROUND", (0, 0), (0, -1), CINZA_CLARO),
        ("BACKGROUND", (3, 3), (3, 5), CINZA_CLARO),
        # Filial: colspan 3→6
        ("SPAN", (2, 0), (5, 0)),
        # Subcontratada: colspan 3→6
        ("SPAN", (2, 1), (5, 1)),
        # Motorista: colspan 3→6
        ("SPAN", (2, 2), (5, 2)),
        # Material: colspan 3→6
        ("SPAN", (2, 6), (5, 6)),
        # Autorizado: colspan 3→6
        ("SPAN", (2, 7), (5, 7)),
        # Validade: colspan 3→6
        ("SPAN", (2, 8), (5, 8)),
    ]
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
        (False, "3° Confira seus dados (*) na OC assim como cavalo e última carreta."),
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
