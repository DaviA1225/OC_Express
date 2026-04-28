from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from app.database import supabase
from app.models import OrdemCreate, OrdemOut, OrdemPDFRequest
from app.pdf_generator import gerar_pdf

router = APIRouter(prefix="/ordens", tags=["Ordens de Carregamento"])


def _enrich(ordem: dict) -> dict:
    """Adiciona nome da subcontratada e motorista ao dict da ordem."""
    if ordem.get("subcontratada_id"):
        sub = (
            supabase.table("subcontratadas")
            .select("nome")
            .eq("id", ordem["subcontratada_id"])
            .single()
            .execute()
        )
        ordem["subcontratada_nome"] = sub.data.get("nome") if sub.data else None

    if ordem.get("motorista_id"):
        mot = (
            supabase.table("motoristas")
            .select("nome")
            .eq("id", ordem["motorista_id"])
            .single()
            .execute()
        )
        ordem["motorista_nome"] = mot.data.get("nome") if mot.data else None

    return ordem


@router.get("/", response_model=list[OrdemOut])
def listar_ordens():
    res = supabase.table("ordens").select("*").order("numero", desc=True).execute()
    return [_enrich(o) for o in res.data]


@router.get("/{ordem_id}", response_model=OrdemOut)
def buscar_ordem(ordem_id: str):
    res = supabase.table("ordens").select("*").eq("id", ordem_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Ordem não encontrada")
    return _enrich(res.data)


@router.post("/", response_model=OrdemOut, status_code=201)
def criar_ordem(payload: OrdemCreate):
    data = payload.model_dump()
    data["validade_inicio"] = str(data["validade_inicio"])
    data["validade_fim"] = str(data["validade_fim"])
    res = supabase.table("ordens").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Erro ao criar ordem")
    return _enrich(res.data[0])


@router.put("/{ordem_id}", response_model=OrdemOut)
def atualizar_ordem(ordem_id: str, payload: OrdemCreate):
    data = payload.model_dump()
    data["validade_inicio"] = str(data["validade_inicio"])
    data["validade_fim"] = str(data["validade_fim"])
    res = supabase.table("ordens").update(data).eq("id", ordem_id).execute()
    if not res.data:
        raise HTTPException(404, "Ordem não encontrada")
    return _enrich(res.data[0])


@router.delete("/{ordem_id}", status_code=204)
def deletar_ordem(ordem_id: str):
    supabase.table("ordens").delete().eq("id", ordem_id).execute()


# ── Geração de PDF ──────────────────────────────────────────────────────────

@router.post("/pdf/preview", summary="Gerar PDF a partir de dados (sem salvar)")
def gerar_pdf_preview(payload: OrdemPDFRequest):
    """Recebe os dados diretamente e retorna o PDF — ideal para preview rápido."""
    pdf_bytes = gerar_pdf(payload.model_dump())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="OC_{payload.numero}.pdf"'},
    )


@router.get("/{ordem_id}/pdf", summary="Gerar PDF de uma OC salva no banco")
def gerar_pdf_por_id(ordem_id: str):
    """Busca a OC no banco e retorna o PDF."""
    res = supabase.table("ordens").select("*").eq("id", ordem_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Ordem não encontrada")

    ordem = _enrich(res.data)

    pdf_data = {
        "numero": ordem["numero"],
        "filial": ordem["filial"],
        "subcontratada": ordem.get("subcontratada_nome", ""),
        "motorista": ordem.get("motorista_nome", ""),
        "cavalo_placa": ordem["cavalo_placa"],
        "ultima_carreta": ordem.get("ultima_carreta", ""),
        "carregamento": ordem["carregamento"],
        "destino": ordem["destino"],
        "instrucao": ordem.get("instrucao", ""),
        "descarga": ordem.get("descarga", ""),
        "material": ordem["material"],
        "autorizado_por": ordem["autorizado_por"],
        "validade_inicio": ordem["validade_inicio"],
        "validade_fim": ordem["validade_fim"],
    }

    pdf_bytes = gerar_pdf(pdf_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="OC_{ordem["numero"]}.pdf"'},
    )
