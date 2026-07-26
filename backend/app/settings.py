from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    CLIENT_ORIGIN: str = "http://localhost:3000"
    REFRESH_TOKEN_EXPIRES_IN: int = 10080
    ACCESS_TOKEN_EXPIRES_IN: int = 15
    JWT_ALGORITHM: str = "RS256"
    JWT_PUBLIC_KEY: str
    JWT_PRIVATE_KEY: str
    INITIAL_ADMIN_EMAIL: str = "admin@ornisec.com"
    INITIAL_ADMIN_PASSWORD: str
    COOKIE_SECURE: bool = False
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-5.6-terra"
    TAVUS_API_KEY: str | None = None
    TAVUS_LLM_API_KEY: str | None = None
    TAVUS_PERSONA_ID: str | None = None
    TAVUS_REPLICA_ID: str | None = None
    TAVUS_REQUIRE_AUTH: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()