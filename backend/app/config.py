from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "mysql+asyncmy://snakes:snakes@127.0.0.1:3307/snakes?charset=utf8mb4"
    frontend_origin: str = "http://localhost:5173"
    session_cookie_secure: bool = False
    session_ttl_hours: int = 168
    round_duration_seconds: int = 300
    matchmaking_seconds: int = 10


@lru_cache
def get_settings() -> Settings:
    return Settings()
