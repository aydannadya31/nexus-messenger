"""API Route'ları"""
from .chat import router as chat_router
from .files import router as files_router
from .web import router as web_router
from .automation import router as automation_router
from .features import router as features_router

__all__ = ["chat_router", "files_router", "web_router", "automation_router", "features_router"]
