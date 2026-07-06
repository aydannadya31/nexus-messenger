"""
Zeka Ajanı - Ana Sunucu
FastAPI tabanlı backend, tüm ajan modüllerini birleştirir
"""
import logging
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from database import db

# Logging ayarları
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(settings.LOG_DIR / "backend.log", encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Uygulama başlangıç ve kapanış işlemleri"""
    logger.info("=" * 60)
    logger.info(f"{settings.PROJECT_NAME} v{settings.VERSION} başlatılıyor...")
    logger.info(f"Veritabanı: {settings.DB_PATH}")
    logger.info(f"Dosya yükleme: {settings.UPLOAD_DIR}")
    logger.info("=" * 60)

    # API anahtarlarını kontrol et
    if not settings.GROQ_API_KEY and not settings.OPENROUTER_API_KEY:
        logger.warning("⚠️  Hiçbir API anahtarı ayarlanmamış!")
        logger.warning("Lütfen GROQ_API_KEY veya OPENROUTER_API_KEY ayarlayın.")
        logger.warning("Bunun için: backend/.env dosyası oluşturun veya ortam değişkeni olarak tanımlayın.")
        logger.warning("Veya web arayüzünden ayarları yapılandırabilirsiniz.")

    yield  # Uygulama çalışırken burada bekler

    logger.info("Zeka Ajanı kapatılıyor...")


# FastAPI uygulaması
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Yerel yapay zeka ajanı - Sohbet, Dosya, Web, Otomasyon",
    lifespan=lifespan
)

# CORS ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Geliştirme için, production'da kısıtla
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Kök Route (önce, static mount'tan etkilenmemesi için) ===

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": "connected",
        "groq_configured": bool(settings.GROQ_API_KEY),
        "openrouter_configured": bool(settings.OPENROUTER_API_KEY),
        "ethics_rules": len(db.get_active_ethics_rules())
    }


@app.get("/api/logs")
def get_logs(level: str = "all", limit: int = 100):
    if level == "all":
        level = None
    logs = db.get_logs(level=level, limit=limit)
    return {"success": True, "logs": logs}


# API Route'larını kaydet
from routes import chat_router, files_router, web_router, automation_router, features_router

app.include_router(chat_router)
app.include_router(files_router)
app.include_router(web_router)
app.include_router(automation_router)
app.include_router(features_router)

# Statik dosyaları serve et (frontend)
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")


# === Ana Çalıştırma ===

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Sunucu başlatılıyor: http://{settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info"
    )
