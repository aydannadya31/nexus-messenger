"""
Sohbet Ajanı - Ana Ajan
Kullanıcı ile iletişim kurar, istekleri analiz eder,
hangi ajanın kullanılacağına karar verir ve model çağrılarını yönetir.
"""
import logging
import re
from typing import Optional

from config import settings
from database import db
from ethics import ethics_engine
from models import GroqModel, OpenRouterModel

logger = logging.getLogger(__name__)


class ChatAgent:
    """
    Ana sohbet ajanı.
    - Kullanıcı mesajlarını alır
    - Etik kurallara göre doğrular
    - Uygun model sağlayıcıyı seçer (Groq -> OpenRouter)
    - İsteği analiz eder ve uygun ajanı yönlendirir
    """

    def __init__(self):
        self.groq = GroqModel()
        self.openrouter = OpenRouterModel()
        self.current_provider = settings.PRIMARY_PROVIDER

    def get_current_model(self):
        """Aktif model sağlayıcıyı döndür"""
        if self.current_provider == "groq" and self.groq.is_available():
            return self.groq
        elif self.openrouter.is_available():
            self.current_provider = "openrouter"
            return self.openrouter
        raise RuntimeError("Hiçbir model sağlayıcı kullanılamıyor. API anahtarlarını kontrol edin.")

    def process_message(self, conversation_id: int, user_message: str) -> dict:
        """
        Kullanıcı mesajını işle

        Args:
            conversation_id: Sohbet ID'si
            user_message: Kullanıcı mesajı

        Returns:
            {"response": str, "model_used": str, "tokens_used": int}
        """
        # 1. Mesajı kaydet
        db.save_message(conversation_id, "user", user_message)

        # 2. Etik kuralları doğrula
        ethics_check = ethics_engine.validate_request(user_message)
        if ethics_check:
            # Etik ihlali - reddet ve kullanıcıya bildir
            error_msg = f"⛔ {ethics_check}\n\nBu isteği gerçekleştiremiyorum çünkü belirlenen etik kuralları ihlal ediyor."
            db.save_message(conversation_id, "assistant", error_msg, "ethics_filter", 0)
            return {"response": error_msg, "model_used": "ethics_filter", "tokens_used": 0}

        # 3. İstek tipini analiz et
        intent = self._analyze_intent(user_message)

        # 4. Sohbet geçmişini al
        messages = db.get_message_history(conversation_id)

        # 5. Sistem prompt'unu hazırla (etik kurallar dahil)
        system_prompt = self._build_system_prompt(intent)

        # 6. Model sağlayıcıya çağrı yap
        try:
            model = self.get_current_model()
            result = model.chat_completion(
                messages=messages[-10:],  # Son 10 mesajı context olarak gönder
                system_prompt=system_prompt
            )

            response_text = result["content"]
            model_used = result["model"]
            tokens_used = result["tokens_used"]

        except Exception as e:
            logger.error(f"Model çağrısı başarısız: {e}")

            # Yedek sağlayıcıya geçmeyi dene
            if self.current_provider == "groq" and self.openrouter.is_available():
                logger.info("Groq başarısız, OpenRouter'a geçiliyor...")
                self.current_provider = "openrouter"
                try:
                    model = self.openrouter
                    result = model.chat_completion(
                        messages=messages[-10:],
                        system_prompt=system_prompt
                    )
                    response_text = result["content"]
                    model_used = result["model"]
                    tokens_used = result["tokens_used"]
                except Exception as e2:
                    logger.error(f"OpenRouter da başarısız: {e2}")
                    response_text = f"⚠️ Model sağlayıcı hatası: {str(e)}. Lütfen API anahtarlarını kontrol edin."
                    model_used = "error"
                    tokens_used = 0
            else:
                response_text = f"⚠️ Model sağlayıcı hatası: {str(e)}. Lütfen API anahtarlarını kontrol edin."
                model_used = "error"
                tokens_used = 0

        # LLM yanıtında [OZELLIK_TALEBI] etiketi varsa otomatik kaydet
        feature_match = re.search(r'\[OZELLIK_TALEBI\]\s*(.+?)\s*\|\s*(.+)', response_text)
        if feature_match:
            title = feature_match.group(1).strip()
            description = feature_match.group(2).strip()
            db.create_feature_request(title, description, user_message)
            logger.info(f"Özellik talebi oluşturuldu: {title}")
            response_text = re.sub(r'\n?\[OZELLIK_TALEBI\].*', '', response_text).strip()

        db.save_message(conversation_id, "assistant", response_text, model_used, tokens_used)

        return {
            "response": response_text,
            "model_used": model_used,
            "tokens_used": tokens_used
        }

    def _analyze_intent(self, message: str) -> str:
        """Kullanıcı mesajındaki niyeti analiz et"""
        msg_lower = message.lower()

        # Dosya işlemleri
        if any(kw in msg_lower for kw in ["dosya oluştur", "dosya sil", "dosya taşı",
                                            "klasör oluştur", "dosya ara", "düzenle",
                                            ".txt", ".py", ".json", ".csv", ".md"]):
            return "file_operation"

        # Web scraping
        if any(kw in msg_lower for kw in ["web'den al", "siteden al", "sayfayı getir",
                                            "indir", "url", "http", "scrape",
                                            "web scraping", "internetten"]):
            return "web_scraping"

        # Otomasyon
        if any(kw in msg_lower for kw in ["otomatik", "zamanla", "her gün", "her saat",
                                            "planla", "programla", "görev oluştur",
                                            "tekrarlı", "scheduled"]):
            return "automation"

        # Genel sohbet
        return "general_chat"

    def _build_system_prompt(self, intent: str) -> str:
        """Sistem prompt'unu oluştur (etik kurallar + yetenekler)"""
        prompt = f"""Sen Zeka Ajanı'sın. Kullanıcının kişisel yapay zeka asistanısın.

=== YETENEKLERİN ===
1. 💬 **Sohbet**: Günlük konuşmalar, soru-cevap, beyin fırtınası
2. 📁 **Dosya İşlemleri**: Dosya oluşturma, düzenleme, silme, arama
3. 🌐 **Web Scraping**: Web sitelerinden veri çekme, bilgi toplama
4. ⚡ **Otomasyon**: Tekrarlı görevleri otomatikleştirme, zamanlanmış işlemler
5. 🔧 **Özel Görevler**: Kullanıcının tanımladığı özel görevleri yerine getirme

=== SINIRLAMALARIN ===
- **Mevcut olmayan bir özellik istenirse**: Yapamıyorum deme. Bunun yerine yanıtının SON satırına şu formatda ekle: `[OZELLIK_TALEBI] başlık | açıklama`
- Örn: "Telefonla arama yap" istenirse -> `[OZELLIK_TALEBI] Telefon Araması | Kullanıcı telefondan arama yapmak istiyor, sesli arama özelliği eklenmeli`
- Sistem bu talebi otomatik kaydedip geliştiriciye iletecek. Sen sadece kullanıcıya normal şekilde yanıt ver.

=== KİŞİLİĞİN ===
- Profesyonel ve yardımsever
- Kullanıcının talimatlarını dikkatle takip et
- Türkçe yanıt ver (kullanıcı aksini belirtmedikçe)
- Karmaşık konuları basitçe açıkla
- Yanıtlarında formatlı metin kullan

=== MEVCUT NİYET ===
Şu anki kullanıcı isteği şu kategoriyle ilgili: {intent}
"""

        # Etik kuralları ekle
        ethics_prompt = ethics_engine.get_system_prompt()
        if ethics_prompt:
            prompt += f"\n\n{ethics_prompt}"

        return prompt

    def report_missing_feature(self, title: str, description: str, user_message: str = "") -> str:
        """
        Kullanıcının istediği ama mevcut olmayan bir özelliği bildir.
        Bu kayıt Sisyphus'a (geliştirici asistana) iletilecek.
        """
        req_id = db.create_feature_request(title, description, user_message)
        logger.info(f"YENİ ÖZELLİK TALEBİ [#{req_id}]: {title}")

        return (
            f"⚠️ **Özellik Şu An Mevcut Değil**\n\n"
            f"İstediğiniz *\"{title}\"* özelliği henüz Zeka Ajanı'nda bulunmuyor. "
            f"Bu talep kaydedildi (Talep #{req_id}) ve geliştirici ekibimize iletildi. "
            f"**En kısa sürede eklenecektir.**\n\n"
            f"Başka bir isteğiniz var mı?"
        )

    def switch_provider(self, provider: str):
        """Model sağlayıcıyı değiştir"""
        if provider in ["groq", "openrouter"]:
            self.current_provider = provider
            logger.info(f"Sağlayıcı değiştirildi: {provider}")
            return True
        return False

    def get_status(self) -> dict:
        """Sistem durumunu döndür"""
        return {
            "current_provider": self.current_provider,
            "groq_available": self.groq.is_available(),
            "openrouter_available": self.openrouter.is_available(),
            "active_ethics_rules": len(ethics_engine.rules)
        }
