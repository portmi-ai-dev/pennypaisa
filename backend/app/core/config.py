from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Redis Cloud
    REDIS_HOST: str = Field(..., description="Redis Cloud host")
    REDIS_PORT: int = Field(6379, description="Redis Cloud port")
    REDIS_USERNAME: str = Field("default", description="Redis Cloud username")
    REDIS_PASSWORD: str = Field(..., description="Redis Cloud password")
    REDIS_SSL: bool = Field(True, description="Redis Cloud requires TLS")
    REDIS_SSL_CERT_REQS: str = Field(
        "required", description="SSL certificate requirements: required|none"
    )
    REDIS_SSL_FALLBACK: bool = Field(
        True, description="Retry without TLS if SSL handshake fails"
    )

    # Neon Postgres
    NEON_DATABASE_URL: str | None = Field(
        None, description="Neon Postgres connection URL (postgresql://...)"
    )

    # YouTube (optional)
    # Comma-separated list of channel URLs for the hourly video-id cron.
    YT_CHANNEL_URLS: str | None = Field(
        None,
        description="Comma-separated YouTube channel URLs for the hourly cron",
    )

    # Google Gemini
    GEMINI_API_KEY: str = Field(..., description="Google Gemini API key")
    GEMINI_MODEL: str = Field("gemini-2.5-flash", description="Gemini model name")
    GEMINI_ENABLE_GROUNDING: bool = Field(
        True, description="Enable grounding search tools"
    )

    # assembly ai
    assemblyai_api_key: str = Field(..., description="ASSEMBLY AI API KEY")

    @field_validator("NEON_DATABASE_URL", "YT_CHANNEL_URLS", mode="before")
    @classmethod
    def _empty_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("REDIS_HOST", "REDIS_PASSWORD", "REDIS_USERNAME", mode="before")
    @classmethod
    def _strip_redis_values(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


settings = Settings()
