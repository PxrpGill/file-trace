from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, files, folders, permissions, users


def create_app() -> FastAPI:
    app = FastAPI(title="File-Trace")
    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(folders.router)
    app.include_router(permissions.router)
    app.include_router(files.router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
