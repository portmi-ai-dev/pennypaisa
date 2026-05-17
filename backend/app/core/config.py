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
    DB_POOL_MIN_SIZE: int = Field(5, description="Postgres pool min size")
    DB_POOL_MAX_SIZE: int = Field(30, description="Postgres pool max size")
    DB_COMMAND_TIMEOUT: int = Field(10, description="Postgres command timeout seconds")

    # Google Gemini
    GEMINI_API_KEY: str = Field(..., description="Google Gemini API key")
    GEMINI_MODEL: str = Field("gemini-2.5-flash", description="Gemini model name")
    GEMINI_ENABLE_GROUNDING: bool = Field(
        True, description="Enable grounding search tools"
    )

    # assembly ai
    assemblyai_api_key: str = Field(..., description="ASSEMBLY AI API KEY")

    # Groq (optional — fast inference fallback / future use)
    groq_api_key: str | None = Field(None, description="Groq API key")

    # YouTube Data API v3
    YOUTUBE_API_KEY: str | None = Field(None, description="YouTube Data API v3 key")

    # yt-dlp JavaScript runtime
    YT_DLP_JS_RUNTIME: str | None = Field(
        None, description="yt-dlp JS runtime: node|bun|deno|quickjs"
    )
    YT_DLP_JS_RUNTIME_PATH: str | None = Field(
        None, description="Optional path to yt-dlp JS runtime executable"
    )

    # ── yt-dlp proxy & anti-block ──────────────────────────────────────
    # Proxy URL for yt-dlp audio downloads. Format:
    #   http://user:pass@host:port  or  socks5://user:pass@host:port
    # Leave empty in dev to use direct connection.
    YT_PROXY_URL: str | None = Field(
        None, description="Proxy URL for yt-dlp audio downloads"
    )
    # Seconds between consecutive transcript jobs (anti-burst).
    YT_TRANSCRIPT_DELAY_SECONDS: float = Field(
        5.0, description="Delay between transcript fetch attempts (anti-burst)"
    )
    # Path to a Netscape-format cookies file exported from a browser.
    # Helps yt-dlp bypass "Sign in to confirm you're not a bot" blocks.
    YT_COOKIES_FILE: str | None = Field(
        None, description="Path to Netscape cookies.txt for yt-dlp"
    )
    # Webshare or any HTTP proxy for youtube-transcript-api caption fetches.
    # Format: http://user:pass@host:port
    YT_CAPTIONS_PROXY_URL: str | None = Field(
        None, description="HTTP proxy for youtube-transcript-api caption fetches"
    )
    # transcriptapi.com API key for direct transcript fetching
    TRANSCRIPT_API_KEY: str | None = Field(
        None, description="transcriptapi.com API key"
    )

    # ── Worker timeouts (arq + per-video) ────────────────────────────────
    YT_BULK_JOB_TIMEOUT_SECONDS: int = Field(
        60 * 60,
        description="Max wall-clock seconds for one bulk yt worker job.",
    )
    # Per-video budget: yt-dlp download + AssemblyAI upload/poll.
    # Default 8 min covers AssemblyAI's 6-min poll + download overhead.
    YT_TRANSCRIPT_PER_VIDEO_TIMEOUT_SECONDS: int = Field(
        60 * 8,
        description="Max wall-clock seconds spent transcribing a single video.",
    )
    # Per-channel budget for the scrape stage. Each channel is scraped via
    # the YouTube Data API v3 uploads playlist + video details batch call.
    # Default 2 min per channel is generous for a typical 30-day window.
    YT_SCRAPE_PER_CHANNEL_TIMEOUT_SECONDS: int = Field(
        60 * 2,
        description="Max wall-clock seconds spent scraping one channel's video IDs.",
    )

    @field_validator("NEON_DATABASE_URL", mode="before")
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
