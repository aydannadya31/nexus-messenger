"""
OpenRouter Model Entegrasyonu (Yedek Sağlayıcı)
Groq çalışmazsa devreye girer - ücretsiz tier ile birçok modele erişim
"""
import json
import logging
from typing import Optional

import httpx
from config import settings

logger = logging.getLogger(__name__)


class OpenRouterModel:
    """OpenRouter API üzerinden AI model çağrıları (yedek sağlayıcı)"""

    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        self.model = settings.OPENROUTER_MODEL
        self.base_url = settings.OPENROUTER_BASE_URL
        self.max_tokens = settings.OPENROUTER_MAX_TOKENS
        self.temperature = settings.OPENROUTER_TEMPERATURE
        self.site_url = settings.OPENROUTER_SITE_URL
        self.site_name = settings.OPENROUTER_SITE_NAME

    def is_available(self) -> bool:
        """OpenRouter API kullanılabilir mi?"""
        if not self.api_key:
            logger.warning("OpenRouter API anahtarı bulunamadı.")
            return False

        try:
            import httpx
            response = httpx.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=10
            )
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"OpenRouter API kullanılamıyor: {e}")
            return False

    def chat_completion(self, messages: list[dict],
                        system_prompt: Optional[str] = None,
                        temperature: Optional[float] = None,
                        max_tokens: Optional[int] = None) -> dict:
        """
        Sohbet tamamlama isteği gönder

        Args:
            messages: Mesaj geçmişi
            system_prompt: Sistem prompt'u
            temperature: Yaratıcılık seviyesi
            max_tokens: Maksimum token sayısı

        Returns:
            {"content": str, "tokens_used": int, "model": str}
        """
        if not self.api_key:
            raise RuntimeError("OpenRouter API anahtarı ayarlanmamış.")

        # Sistem prompt'unu ekle
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        payload = {
            "model": self.model,
            "messages": full_messages,
            "temperature": temperature or self.temperature,
            "max_tokens": max_tokens or self.max_tokens,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": self.site_url,
            "X-Title": self.site_name,
        }

        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            data = response.json()

            return {
                "content": data["choices"][0]["message"]["content"] or "",
                "tokens_used": data.get("usage", {}).get("total_tokens", 0),
                "model": data.get("model", self.model),
                "provider": "openrouter"
            }

        except httpx.HTTPStatusError as e:
            logger.error(f"OpenRouter HTTP hatası: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"OpenRouter API hatası: {e}")
            raise

    def update_api_key(self, new_key: str):
        """API anahtarını güncelle"""
        self.api_key = new_key
        logger.info("OpenRouter API anahtarı güncellendi")

    def get_available_models(self) -> list[dict]:
        """Kullanılabilir modelleri listele (ücretsiz tier dahil)"""
        try:
            response = httpx.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=15
            )
            response.raise_for_status()
            return response.json().get("data", [])
        except Exception as e:
            logger.error(f"Modeller alınamadı: {e}")
            return []
