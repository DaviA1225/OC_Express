from fastapi import APIRouter, HTTPException
from postgrest.exceptions import APIError
from app.database import supabase
from app.models import MotoristaCreate, MotoristaOut

router = APIRouter(prefix="/motoristas", tags=["Motoristas"])


@router.get("/", response_model=list[MotoristaOut])
def listar_motoristas():
    res = supabase.table("motoristas").select("*").order("nome").execute()
    return res.data


@router.get("/{motorista_id}", response_model=MotoristaOut)
def buscar_motorista(motorista_id: str):
    res = supabase.table("motoristas").select("*").eq("id", motorista_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Motorista não encontrado")
    return res.data


@router.post("/", response_model=MotoristaOut, status_code=201)
def criar_motorista(payload: MotoristaCreate):
    try:
        res = supabase.table("motoristas").insert(payload.model_dump()).execute()
    except APIError as e:
        raise HTTPException(400, e.message or repr(e))
    except Exception as e:
        raise HTTPException(500, str(e))
    if not res.data:
        raise HTTPException(400, "Erro ao criar motorista")
    return res.data[0]


@router.put("/{motorista_id}", response_model=MotoristaOut)
def atualizar_motorista(motorista_id: str, payload: MotoristaCreate):
    try:
        res = (
            supabase.table("motoristas")
            .update(payload.model_dump())
            .eq("id", motorista_id)
            .execute()
        )
    except APIError as e:
        raise HTTPException(400, str(e.message))
    if not res.data:
        raise HTTPException(404, "Motorista não encontrado")
    return res.data[0]


@router.delete("/{motorista_id}", status_code=204)
def deletar_motorista(motorista_id: str):
    supabase.table("motoristas").delete().eq("id", motorista_id).execute()
