"""
Özellik Talepleri API Route'ları
"""
import logging
from fastapi import APIRouter
from pydantic import BaseModel

from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/features", tags=["Özellik Talepleri"])


class FeatureRequest(BaseModel):
    title: str
    description: str
    user_message: str = ""


@router.post("/request")
def create_feature_request(req: FeatureRequest):
    req_id = db.create_feature_request(req.title, req.description, req.user_message)
    return {"success": True, "request_id": req_id}


@router.get("/requests")
def list_requests(status: str = "all", limit: int = 50):
    if status == "all":
        status = None
    requests = db.get_feature_requests(status=status, limit=limit)
    return {"success": True, "requests": requests}
