"""
Dosya İşlemleri API Route'ları
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from agents import FileAgent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/files", tags=["Dosya İşlemleri"])

file_agent = FileAgent()


# === Request Modelleri ===

class WriteFileRequest(BaseModel):
    filepath: str
    content: str


class DeleteFileRequest(BaseModel):
    filepath: str


class SearchFilesRequest(BaseModel):
    query: str
    directory: Optional[str] = None


# === API Endpoints ===

@router.post("/upload")
async def upload_file(file: UploadFile = File(...), task_id: Optional[int] = Form(None)):
    """Dosya yükle"""
    try:
        content = await file.read()
        filepath = file_agent.upload_dir / file.filename

        with open(filepath, "wb") as f:
            f.write(content)

        # Veritabanına kaydet
        from database import db
        db.save_file_record(
            filename=file.filename,
            original_name=file.filename,
            file_path=str(filepath),
            file_size=len(content),
            mime_type=file.content_type or "",
            task_id=task_id
        )

        return {
            "success": True,
            "filename": file.filename,
            "size": len(content),
            "path": str(filepath)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
def list_files(directory: Optional[str] = None):
    """Dosyaları listele"""
    try:
        files = file_agent.list_files(directory)
        return {"success": True, "files": files}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get("/read")
def read_file(filepath: str):
    """Dosya içeriğini oku"""
    try:
        result = file_agent.read_file(filepath)
        return {"success": True, **result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/write")
def write_file(req: WriteFileRequest):
    """Dosya oluştur/güncelle"""
    try:
        result = file_agent.write_file(req.filepath, req.content)
        return {"success": True, **result}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/delete")
def delete_file(req: DeleteFileRequest):
    """Dosya sil"""
    try:
        file_agent.delete_file(req.filepath)
        return {"success": True, "message": "Dosya silindi"}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/search")
def search_files(req: SearchFilesRequest):
    """Dosya ara"""
    try:
        results = file_agent.search_files(req.query, req.directory)
        return {"success": True, "results": results}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
