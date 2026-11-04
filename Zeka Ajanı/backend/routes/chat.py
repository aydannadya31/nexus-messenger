"""
Sohbet API Route'ları
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import ChatAgent
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["Sohbet"])

chat_agent = ChatAgent()


# === Request/Response Modelleri ===

class SendMessageRequest(BaseModel):
    conversation_id: int
    message: str


class CreateConversationRequest(BaseModel):
    title: str = "Yeni Sohbet"
    model_provider: Optional[str] = "groq"


# === API Endpoints ===

@router.post("/conversations")
def create_conversation(req: CreateConversationRequest):
    """Yeni sohbet oluştur"""
    conv_id = db.create_conversation(
        title=req.title,
        model_provider=req.model_provider
    )
    conversation = db.get_conversation(conv_id)
    return {"success": True, "conversation": conversation}


@router.get("/conversations/archived")
def list_archived_conversations(limit: int = 50):
    """Arşivlenen sohbetleri listele"""
    conversations = db.get_archived_conversations(limit=limit)
    return {"success": True, "conversations": conversations}


@router.get("/conversations")
def list_conversations(limit: int = 50):
    """Sohbetleri listele"""
    conversations = db.get_conversations(limit=limit)
    return {"success": True, "conversations": conversations}


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: int):
    """Sohbet detayını getir"""
    conversation = db.get_conversation(conv_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Sohbet bulunamadı")

    messages = db.get_messages(conv_id)
    return {
        "success": True,
        "conversation": conversation,
        "messages": messages
    }


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: int):
    """Sohbeti sil"""
    if not db.get_conversation(conv_id):
        raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
    db.delete_conversation(conv_id)
    return {"success": True, "message": "Sohbet silindi"}


@router.post("/conversations/{conv_id}/archive")
def archive_conversation(conv_id: int):
    """Sohbeti arşivle"""
    if not db.get_conversation(conv_id):
        raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
    db.archive_conversation(conv_id)
    return {"success": True, "message": "Sohbet arşivlendi"}


@router.post("/conversations/{conv_id}/unarchive")
def unarchive_conversation(conv_id: int):
    """Sohbeti arşivden çıkar"""
    conversation = db.get_conversation(conv_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
    db.unarchive_conversation(conv_id)
    return {"success": True, "message": "Sohbet arşivden çıkarıldı"}


@router.post("/send")
def send_message(req: SendMessageRequest):
    """Mesaj gönder ve yanıt al"""
    conversation = db.get_conversation(req.conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Sohbet bulunamadı")

    try:
        result = chat_agent.process_message(req.conversation_id, req.message)
        return {
            "success": True,
            **result
        }
    except Exception as e:
        logger.error(f"Mesaj işlenirken hata: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/messages/{conv_id}")
def get_messages(conv_id: int, limit: int = 100):
    """Sohbet mesajlarını getir"""
    conversation = db.get_conversation(conv_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Sohbet bulunamadı")

    messages = db.get_messages(conv_id)
    return {"success": True, "messages": messages[-limit:]}


@router.get("/status")
def get_status():
    """Sistem durumunu getir"""
    return {
        "success": True,
        "status": chat_agent.get_status()
    }


@router.post("/provider/switch")
def switch_provider(provider: str):
    """Model sağlayıcıyı değiştir"""
    if chat_agent.switch_provider(provider):
        return {"success": True, "current_provider": provider}
    raise HTTPException(status_code=400, detail=f"Geçersiz sağlayıcı: {provider}")
