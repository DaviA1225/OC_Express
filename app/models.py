from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


# ── Subcontratadas ──────────────────────────────────────────────────────────

class SubcontratadaCreate(BaseModel):
    nome: str
    documento: Optional[str] = None  # CPF (PF) ou CNPJ (PJ)
    tipo_pessoa: Optional[str] = None  # 'PF' ou 'PJ'


class SubcontratadaOut(SubcontratadaCreate):
    id: str
    created_at: Optional[str] = None


# ── Motoristas ──────────────────────────────────────────────────────────────

class MotoristaCreate(BaseModel):
    nome: str
    cpf: str
    telefone: Optional[str] = None


class MotoristaOut(MotoristaCreate):
    id: str
    created_at: Optional[str] = None


# ── Veículos ────────────────────────────────────────────────────────────────

class VeiculoCreate(BaseModel):
    placa: str
    tipo: str = Field(..., pattern="^(cavalo|carreta)$")
    modelo: Optional[str] = None
    proprietario: Optional[str] = None


class VeiculoOut(VeiculoCreate):
    id: str
    created_at: Optional[str] = None


# ── Ordens de Carregamento ──────────────────────────────────────────────────

class OrdemCreate(BaseModel):
    numero: int
    filial: str
    subcontratada_id: Optional[str] = None
    motorista_id: Optional[str] = None
    cavalo_placa: str
    ultima_carreta: Optional[str] = None
    carregamento: str
    destino: str
    instrucao: Optional[str] = None
    descarga: Optional[str] = None
    material: str
    autorizado_por: str = "DAVI ASAF SILVA"
    validade_inicio: date
    validade_fim: date


class OrdemOut(OrdemCreate):
    id: str
    created_at: Optional[str] = None
    # Dados desnormalizados para exibição
    subcontratada_nome: Optional[str] = None
    motorista_nome: Optional[str] = None


# Dados completos para geração do PDF (sem precisar de FK lookup)
class OrdemPDFRequest(BaseModel):
    numero: int
    filial: str
    subcontratada: Optional[str] = None
    motorista: Optional[str] = None
    cavalo_placa: str
    ultima_carreta: Optional[str] = None
    carregamento: str
    destino: str
    instrucao: Optional[str] = None
    descarga: Optional[str] = None
    material: str
    autorizado_por: str = "DAVI ASAF SILVA"
    validade_inicio: date
    validade_fim: date
