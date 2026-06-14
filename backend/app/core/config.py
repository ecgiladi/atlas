from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://atlas:devpassword@localhost:5432/atlas"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Claude / Anthropic (MICRO extraction pipeline — added in a later session)
    ANTHROPIC_API_KEY: str = ""
    EXTRACTION_MODEL: str = "claude-sonnet-4-6"

    # App
    DEBUG: bool = False
    COOKIE_SECURE: bool = True
    APP_NAME: str = "Atlas"
    CORS_ORIGINS: list[str] = ["http://localhost:3003"]


settings = Settings()
