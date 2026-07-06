"""
Groq API Model Entegrasyonu
Ücretsiz, hızlı, GPU gerektirmez
"""
import logging
from typing import Optional

from groq import Groq
from config import settings

logger = logging.getLogger(__name__)


class GroqModel:
    """Groq API üzerinden AI model çağrıları"""

    def __init__(self):
        self.client: Optional[Groq] = None
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_MODEL
        self.max_tokens = settings.GROQ_MAX_TOKENS
        self.temperature = settings.GROQ_TEMPERATURE
        self._initialize()

    def _initialize(self):
        """API istemcisini başlat"""
        if not self.api_key:
            logger.warning("Groq API anahtarı bulunamadı. Lütfen GROQ_API_KEY ayarlayın.")
            return
        self.client = Groq(api_key=self.api_key)
        logger.info(f"Groq API başlatıldı. Model: {self.model}")

    def is_available(self) -> bool:
        """Groq API kullanılabilir mi?"""
        if not self.client:
            return False
        try:
            # Basit bir test sorgusu
            self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "test"}],
                max_tokens=1
            )
            return True
        except Exception as e:
            logger.warning(f"Groq API kullanılamıyor: {e}")
            return False

    def chat_completion(self, messages: list[dict],
                        system_prompt: Optional[str] = None,
                        temperature: Optional[float] = None,
                        max_tokens: Optional[int] = None) -> dict:
        """
        Sohbet tamamlama isteği gönder

        Args:
            messages: Mesaj geçmişi [{"role": "...", "content": "..."}]
            system_prompt: Sistem prompt'u (etik kurallar vs.)
            temperature: Yaratıcılık seviyesi (0.0 - 1.0)
            max_tokens: Maksimum token sayısı

        Returns:
            {"content": str, "tokens_used": int, "model": str}
        """
        if not self.client:
            raise RuntimeError("Groq API istemcisi başlatılamadı. API anahtarını kontrol edin.")

        # Sistem prompt'unu ekle
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                temperature=temperature or self.temperature,
                max_tokens=max_tokens or self.max_tokens,
            )

            return {
                "content": response.choices[0].message.content or "",
                "tokens_used": response.usage.total_tokens if response.usage else 0,
                "model": response.model,
                "provider": "groq"
            }

        except Exception as e:
            logger.error(f"Groq API hatası: {e}")
            raise

    def update_api_key(self, new_key: str):
        """API anahtarını güncelle"""
        self.api_key = new_key
        self.client = Groq(api_key=new_key)
        logger.info("Groq API anahtarı güncellendi")
