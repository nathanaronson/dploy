from fastapi import APIRouter

from app.api.routes import auth, deployments, diagnostics, health, uploads

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(uploads.router)
api_router.include_router(deployments.router)
api_router.include_router(diagnostics.router)
