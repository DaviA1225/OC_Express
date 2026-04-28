from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import motoristas, veiculos, subcontratadas, ordens

app = FastAPI(
    title="OC Express — Ordens de Carregamento",
    description="API para gestão e geração de PDFs de Ordens de Carregamento",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(motoristas.router)
app.include_router(veiculos.router)
app.include_router(subcontratadas.router)
app.include_router(ordens.router)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "app": "OC Express API"}
