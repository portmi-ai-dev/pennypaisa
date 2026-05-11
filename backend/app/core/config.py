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

    # ── Proxy & anti-block settings ────────────────────────────────────
    # Option A: Generic proxy URL for YouTube requests. Format:
    #   http://user:pass@host:port  or  socks5://user:pass@host:port
    # Leave empty in dev to use direct connection.
    YT_PROXY_URL: str | None = Field(
        None, description="Residential proxy URL for YouTube transcript/audio requests"
    )
    # Option B: Webshare rotating residential proxy (first-class youtube-transcript-api support).
    # If both Webshare creds AND YT_PROXY_URL are set, Webshare is used for transcript API
    # and YT_PROXY_URL is used for yt-dlp audio downloads.
    YT_WEBSHARE_PROXY_USERNAME: str | None = Field(
        None, description="Webshare proxy username (from dashboard.webshare.io)"
    )
    YT_WEBSHARE_PROXY_PASSWORD: str | None = Field(
        None, description="Webshare proxy password"
    )
    # Minimum seconds to wait between consecutive transcript fetches.
    # Prevents burst patterns that trigger IP blocks.
    YT_TRANSCRIPT_DELAY_SECONDS: float = Field(
        5.0, description="Delay between transcript fetch attempts (anti-burst)"
    )
    # Path to a Netscape-format cookies file exported from a browser.
    # Helps yt-dlp bypass "Sign in to confirm you're not a bot" blocks.
    YT_COOKIES_FILE: str | None = Field(
        None, description="Path to Netscape cookies.txt for yt-dlp"
    )

    # ── Worker timeouts (arq + per-video) ────────────────────────────────
    # Whole-job ceiling. Backfill jobs can legitimately churn through dozens
    # of videos sequentially, so we cap them at 1h by default. Tune up if
    # the candidate set grows and you'd rather one job sweep everything in
    # a single pass.
    YT_BULK_JOB_TIMEOUT_SECONDS: int = Field(
        60 * 60,
        description="Max wall-clock seconds for one bulk yt worker job (arq job_timeout).",
    )
    # Per-video budget. Each transcript attempt (YouTube API or AssemblyAI
    # fallback) is wrapped in `asyncio.wait_for` so one stuck video can't
    # consume the whole bulk-job budget. Default 8 min covers AssemblyAI's
    # 6-min poll window plus audio download + ffmpeg overhead.
    YT_TRANSCRIPT_PER_VIDEO_TIMEOUT_SECONDS: int = Field(
        60 * 8,
        description="Max wall-clock seconds spent on a single video's transcript attempt.",
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
