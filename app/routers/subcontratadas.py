from fastapi import APIRouter, HTTPException
from postgrest.exceptions import APIError
from app.database import supabase
from app.models import SubcontratadaCreate, SubcontratadaOut

router = APIRouter(prefix="/subcontratadas", tags=["Subcontratadas"])


@router.get("/", response_model=list[SubcontratadaOut])
def listar_subcontratadas():
    res = supabase.table("subcontratadas").select("*").order("nome").execute()
    return res.data


@router.get("/{sub_id}", response_model=SubcontratadaOut)
def buscar_subcontratada(sub_id: str):
    res = supabase.table("subcontratadas").select("*").eq("id", sub_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Subcontratada não encontrada")
    return res.data


@router.post("/", response_model=SubcontratadaOut, status_code=201)
def criar_subcontratada(payload: SubcontratadaCreate):
    try:
        res = supabase.table("subcontratadas").insert(payload.model_dump()).execute()
    except APIError as e:
        raise HTTPException(400, str(e.message))
    if not res.data:
        raise HTTPException(400, "Erro ao criar subcontratada")
    return res.data[0]


@router.put("/{sub_id}", response_model=SubcontratadaOut)
def atualizar_subcontratada(sub_id: str, payload: SubcontratadaCreate):
    try:
        res = (
            supabase.table("subcontratadas")
            .update(payload.model_dump())
            .eq("id", sub_id)
            .execute()
        )
    except APIError as e:
        raise HTTPException(400, str(e.message))
    if not res.data:
        raise HTTPException(404, "Subcontratada não encontrada")
    return res.data[0]


@router.delete("/{sub_id}", status_code=204)
def deletar_subcontratada(sub_id: str):
    supabase.table("subcontratadas").delete().eq("id", sub_id).execute()
