from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, init_database
from app.routes import GestionAudit, action_plan, authentification, evidence, interviews
from app.settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    yield
    engine.dispose()


app = FastAPI(
    title="Ornisec Audits App",
    description="Plateforme d'audits organisationnels ORNISEC.",
    version="1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CLIENT_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(GestionAudit.audit)
app.include_router(action_plan.router)
app.include_router(authentification.user)
app.include_router(evidence.router)
app.include_router(interviews.router)


@app.get("/api/healthchecker")
async def check():
    return {"status": "ok", "database": "postgresql"}
