"""
Zeka Ajanı - Konfigürasyon Dosyası
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # === Proje Yolları ===
    PROJECT_NAME: str = "Zeka Ajanı"
    VERSION: str = "1.0.0"
    BASE_DIR: Path = Path(__file__).parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    UPLOAD_DIR: Path = DATA_DIR / "uploads"
    LOG_DIR: Path = DATA_DIR / "logs"
    DB_PATH: str = str(DATA_DIR / "zeka_ajani.db")

    # === API Anahtarları (Çevre Değişkenlerinden) ===
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # === Model Ayarları ===
    # Birincil: Groq
    GROQ_MODEL: str = "llama3-8b-8192"  # llama3-70b-8192, mixtral-8x7b-32768
    GROQ_MAX_TOKENS: int = 8192
    GROQ_TEMPERATURE: float = 0.7

    # Yedek: OpenRouter (Groq çalışmazsa)
    # Türkçe için önerilen modeller: qwen2.5-7b-instruct, google/gemma-2-9b-it, mistralai/mistral-7b-instruct-v0.3
    OPENROUTER_MODEL: str = "qwen/qwen3.6-27b"
    OPENROUTER_MAX_TOKENS: int = 8192
    OPENROUTER_TEMPERATURE: float = 0.7
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_SITE_URL: str = "http://localhost:8000"
    OPENROUTER_SITE_NAME: str = "Zeka Ajani"

    # === Model Sağlayıcı Sırası ===
    # "groq" -> "openrouter" -> "groq" (birincil çalışmazsa diğerine geç)
    PRIMARY_PROVIDER: str = "groq"
    FALLBACK_PROVIDER: str = "openrouter"

    # === Web Scraping ===
    USER_AGENT: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    REQUEST_TIMEOUT: int = 30

    # === Sunucu ===
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = ["http://localhost:8000", "http://127.0.0.1:8000"]

    # === Etik Motoru ===
    ETHICS_ENABLED: bool = True
    ETHICS_RULES_PATH: str = str(DATA_DIR / "ethics_rules.json")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()

# Gerekli dizinleri oluştur
for dir_path in [settings.DATA_DIR, settings.UPLOAD_DIR, settings.LOG_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)
