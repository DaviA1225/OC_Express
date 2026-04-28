from fastapi import APIRouter, HTTPException
from postgrest.exceptions import APIError
from app.database import supabase
from app.models import VeiculoCreate, VeiculoOut

router = APIRouter(prefix="/veiculos", tags=["Veículos"])


@router.get("/", response_model=list[VeiculoOut])
def listar_veiculos(tipo: str | None = None):
    query = supabase.table("veiculos").select("*").order("placa")
    if tipo:
        query = query.eq("tipo", tipo)
    res = query.execute()
    return res.data


@router.get("/{veiculo_id}", response_model=VeiculoOut)
def buscar_veiculo(veiculo_id: str):
    res = supabase.table("veiculos").select("*").eq("id", veiculo_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Veículo não encontrado")
    return res.data


@router.post("/", response_model=VeiculoOut, status_code=201)
def criar_veiculo(payload: VeiculoCreate):
    try:
        res = supabase.table("veiculos").insert(payload.model_dump()).execute()
    except APIError as e:
        raise HTTPException(400, str(e.message))
    if not res.data:
        raise HTTPException(400, "Erro ao criar veículo")
    return res.data[0]


@router.put("/{veiculo_id}", response_model=VeiculoOut)
def atualizar_veiculo(veiculo_id: str, payload: VeiculoCreate):
    try:
        res = (
            supabase.table("veiculos")
            .update(payload.model_dump())
            .eq("id", veiculo_id)
            .execute()
        )
    except APIError as e:
        raise HTTPException(400, str(e.message))
    if not res.data:
        raise HTTPException(404, "Veículo não encontrado")
    return res.data[0]


@router.delete("/{veiculo_id}", status_code=204)
def deletar_veiculo(veiculo_id: str):
    supabase.table("veiculos").delete().eq("id", veiculo_id).execute()
