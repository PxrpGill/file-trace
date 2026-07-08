from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


connect_args = {}
engine_kwargs = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # Explicit pool bounds: with `--workers 4` (see backend/Dockerfile) the
    # SQLAlchemy default (pool_size=5, max_overflow=10) would let a single
    # backend container open up to 60 connections — pin it down and recycle
    # connections periodically so Postgres's max_connections stays predictable
    # as backend replicas scale out.
    engine_kwargs = {"pool_size": 5, "max_overflow": 5, "pool_recycle": 1800}

engine = create_engine(settings.database_url, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
