"""Application configuration loaded from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    github_token: str = ""
    database_url: str = "sqlite+aiosqlite:///./hermes.db"
    hermes_cli_path: str = "hermes"
    cost_per_success: float = 119.58

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
