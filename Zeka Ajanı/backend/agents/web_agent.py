"""
Web Scraping Ajanı
Web sitelerinden veri çekme, bilgi toplama, içerik analizi
"""
import logging
import re
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger(__name__)


class WebAgent:
    """Web scraping ve veri toplama ajanı"""

    def __init__(self):
        self.user_agent = settings.USER_AGENT
        self.timeout = settings.REQUEST_TIMEOUT

    def fetch_page(self, url: str, extract_links: bool = False) -> dict:
        """
        Web sayfasından içerik getir

        Args:
            url: Hedef URL
            extract_links: Linkleri de çıkar (varsayılan: False)

        Returns:
            {"title": str, "content": str, "links": list, "status": int}
        """
        # URL doğrulama
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"Geçersiz URL: {url}")

        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        }

        try:
            response = httpx.get(
                url,
                headers=headers,
                timeout=self.timeout,
                follow_redirects=True
            )
            response.raise_for_status()

            # İçeriği parse et
            soup = BeautifulSoup(response.text, "html.parser")

            # Başlık
            title = ""
            if soup.title:
                title = soup.title.get_text(strip=True)

            # Meta description
            meta_desc = ""
            meta_tag = soup.find("meta", attrs={"name": "description"})
            if meta_tag:
                meta_desc = meta_tag.get("content", "")

            # Ana içerik
            for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
                element.decompose()

            content = soup.get_text(separator="\n", strip=True)
            # Fazla boşlukları temizle
            content = re.sub(r'\n{3,}', '\n\n', content)
            # İlk 5000 karakter
            content = content[:5000]

            result = {
                "url": url,
                "title": title,
                "description": meta_desc,
                "content": content,
                "status": response.status_code
            }

            # Linkleri çıkar
            if extract_links:
                links = []
                for a_tag in soup.find_all("a", href=True):
                    href = a_tag["href"]
                    if href.startswith("http") or href.startswith("/"):
                        links.append({
                            "text": a_tag.get_text(strip=True)[:100],
                            "href": href
                        })
                result["links"] = links[:50]  # İlk 50 link

            return result

        except httpx.TimeoutException:
            raise TimeoutError(f"Sayfa zaman aşımına uğradı: {url}")
        except httpx.HTTPStatusError as e:
            raise ConnectionError(f"HTTP hatası {e.response.status_code}: {url}")
        except Exception as e:
            raise RuntimeError(f"Sayfa getirilemedi: {e}")

    def search_web(self, query: str) -> list[dict]:
        """
        Web'de arama yap (basit)
        Not: Gelişmiş arama için Google API veya benzeri gerekir

        Args:
            query: Arama sorgusu

        Returns:
            [{"title": str, "url": str, "snippet": str}]
        """
        # DuckDuckGo üzerinden basit arama
        search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"

        try:
            result = self.fetch_page(search_url)
            soup = BeautifulSoup(httpx.get(
                search_url,
                headers={"User-Agent": self.user_agent},
                timeout=self.timeout
            ).text, "html.parser")

            results = []
            for result_item in soup.select(".result")[:10]:
                title_elem = result_item.select_one(".result__title a")
                snippet_elem = result_item.select_one(".result__snippet")

                if title_elem:
                    results.append({
                        "title": title_elem.get_text(strip=True),
                        "url": title_elem.get("href", ""),
                        "snippet": snippet_elem.get_text(strip=True) if snippet_elem else ""
                    })

            return results

        except Exception as e:
            logger.error(f"Arama hatası: {e}")
            return []

    def extract_text(self, url: str) -> str:
        """Web sayfasından temiz metin çıkar"""
        result = self.fetch_page(url)
        return result["content"]

    def check_url_status(self, url: str) -> dict:
        """URL'in erişilebilirliğini kontrol et"""
        try:
            response = httpx.head(
                url,
                headers={"User-Agent": self.user_agent},
                timeout=10,
                follow_redirects=True
            )
            return {
                "url": url,
                "status": response.status_code,
                "accessible": response.status_code < 400,
                "content_type": response.headers.get("content-type", ""),
                "content_length": response.headers.get("content-length", "0")
            }
        except Exception as e:
            return {
                "url": url,
                "status": 0,
                "accessible": False,
                "error": str(e)
            }
