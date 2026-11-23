from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Cybersecurity Incident Management System"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://cims:cims_password@127.0.0.1:5432/cims"
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    mongodb_database: str = "cims_logs"
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    cors_origins: str = "http://localhost:8501"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        insecure_markers = (
            "change-me",
            "development-only",
            "generate-with",
            "generate_with",
            "placeholder",
            "replace-with",
        )
        if value != value.strip():
            raise ValueError("JWT_SECRET_KEY must not have leading or trailing whitespace.")
        if len(value) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters.")
        if len(set(value)) < 12 or any(marker in value.lower() for marker in insecure_markers):
            raise ValueError("JWT_SECRET_KEY must be a securely generated random value.")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
