"""
Otomasyon API Route'ları
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import AutomationAgent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/automation", tags=["Otomasyon"])

automation_agent = AutomationAgent()


# === Request Modelleri ===

class CreateTaskRequest(BaseModel):
    name: str
    description: str = ""
    task_type: str = "custom"
    config: dict = {}
    schedule: Optional[str] = None


class RunTaskRequest(BaseModel):
    task_id: int


# === API Endpoints ===

@router.post("/tasks")
def create_task(req: CreateTaskRequest):
    """Yeni görev oluştur"""
    try:
        task_id = automation_agent.create_task(
            name=req.name,
            description=req.description,
            task_type=req.task_type,
            config=req.config,
            schedule_time=req.schedule
        )
        task = automation_agent.get_task_status(task_id)
        return {"success": True, "task": task}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tasks/run")
def run_task(req: RunTaskRequest):
    """Görevi çalıştır"""
    try:
        result = automation_agent.run_task(req.task_id)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: int):
    """Görevi iptal et"""
    if automation_agent.cancel_task(task_id):
        return {"success": True, "message": "Görev iptal edildi"}
    raise HTTPException(status_code=404, detail="Görev bulunamadı veya çalışmıyor")


@router.get("/tasks")
def list_tasks(status: Optional[str] = None):
    """Görevleri listele"""
    tasks = automation_agent.list_tasks(status)
    return {"success": True, "tasks": tasks}


@router.get("/tasks/{task_id}")
def get_task(task_id: int):
    """Görev detayını getir"""
    try:
        task = automation_agent.get_task_status(task_id)
        return {"success": True, "task": task}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/scheduler/start")
def start_scheduler():
    """Zamanlayıcıyı başlat"""
    automation_agent.start_scheduler()
    return {"success": True, "message": "Zamanlayıcı başlatıldı"}


@router.post("/scheduler/stop")
def stop_scheduler():
    """Zamanlayıcıyı durdur"""
    automation_agent.stop_scheduler()
    return {"success": True, "message": "Zamanlayıcı durduruldu"}
