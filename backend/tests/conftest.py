import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.main import create_app
from app.models import User, UserRole
from app.services.security import hash_password


@pytest.fixture()
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def db(engine):
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with TestingSession() as session:
        yield session


@pytest.fixture()
def app(engine, tmp_path):
    from app.api.deps import get_db, get_storage
    from app.services.storage import LocalDiskStorage

    app = create_app()
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        with TestingSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_storage] = lambda: LocalDiskStorage(tmp_path / "blobs")
    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture()
def admin(db):
    user = User(
        username="admin",
        password_hash=hash_password("admin-pass"),
        role=UserRole.admin,
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture()
def user(db):
    u = User(
        username="alice",
        password_hash=hash_password("alice-pass"),
        role=UserRole.user,
        must_change_password=False,
    )
    db.add(u)
    db.commit()
    return u
