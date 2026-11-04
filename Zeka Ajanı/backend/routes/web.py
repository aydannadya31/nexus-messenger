"""
Web Scraping API Route'ları
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import WebAgent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/web", tags=["Web Scraping"])

web_agent = WebAgent()


# === Request Modelleri ===

class FetchPageRequest(BaseModel):
    url: str
    extract_links: bool = False


class SearchWebRequest(BaseModel):
    query: str


# === API Endpoints ===

@router.post("/fetch")
def fetch_page(req: FetchPageRequest):
    """Web sayfasından içerik getir"""
    try:
        result = web_agent.fetch_page(req.url, extract_links=req.extract_links)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (TimeoutError, ConnectionError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
def search_web(req: SearchWebRequest):
    """Web'de arama yap"""
    try:
        results = web_agent.search_web(req.query)
        return {"success": True, "results": results, "query": req.query}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check")
def check_url(url: str):
    """URL'in erişilebilirliğini kontrol et"""
    try:
        result = web_agent.check_url_status(url)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract")
def extract_text(req: FetchPageRequest):
    """Web sayfasından temiz metin çıkar"""
    try:
        text = web_agent.extract_text(req.url)
        return {"success": True, "url": req.url, "content": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
