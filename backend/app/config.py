from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FILETRACE_", env_file=".env")

    database_url: str = "sqlite:///./filetrace.db"
    storage_root: Path = Path("./storage")
    jwt_secret: str = "dev-only-secret-change-me-in-production!"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 480


settings = Settings()
