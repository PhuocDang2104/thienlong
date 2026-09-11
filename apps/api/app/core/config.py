from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / '.env', extra='ignore')
    app_env: Literal['development', 'test', 'production'] = 'development'
    database_url: str
    redis_url: str
    jwt_secret: str
    jwt_expire_minutes: int = 480
    cors_origins: str = 'http://localhost:3000'
    public_frontend_url: str = 'http://localhost:3000'
    redis_stream_key: str = 'thienlong:events'

    @field_validator('jwt_secret')
    @classmethod
    def secret_length(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError('JWT_SECRET must have at least 32 characters')
        return value

    @model_validator(mode='after')
    def validate_production(self):
        if not 1 <= self.jwt_expire_minutes <= 1440:
            raise ValueError('JWT_EXPIRE_MINUTES must be between 1 and 1440')
        for origin in [self.public_frontend_url, *self.origins]:
            parsed = urlsplit(origin)
            if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment or '*' in origin:
                raise ValueError('Frontend URL and CORS entries must be explicit HTTP(S) origins')
        if not self.origins:
            raise ValueError('At least one CORS origin is required')
        if self.app_env == 'production':
            if 'CHANGE_ME' in self.jwt_secret or 'CHANGE_ME' in self.database_url or 'CHANGE_ME' in self.redis_url:
                raise ValueError('Replace placeholder production secrets')
            if not self.database_url.startswith('postgresql'):
                raise ValueError('Production requires PostgreSQL')
            if not self.public_frontend_url.startswith('https://') or any(not origin.startswith('https://') for origin in self.origins):
                raise ValueError('Production frontend and CORS origins require HTTPS')
        return self

    @property
    def origins(self) -> list[str]:
        return [origin.strip().rstrip('/') for origin in self.cors_origins.split(',') if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
