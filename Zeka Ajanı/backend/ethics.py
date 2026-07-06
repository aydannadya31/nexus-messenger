"""
Zeka Ajanı - Etik Çerçeve Motoru
Kullanıcının belirlediği etik kuralları uygular.
SİSYPHUS bu kurallara KARIŞMAZ, sadece uygular.
"""
import json
import re
from typing import Optional

from config import settings
from database import db


class EthicsEngine:
    """
    Etik çerçeve motoru.
    Kullanıcının belirlediği kuralları yükler, doğrular ve uygular.
    """

    def __init__(self):
        self.rules: list[dict] = []
        self.load_rules()

    def load_rules(self) -> list[dict]:
        """Etik kurallarını veritabanından yükle"""
        self.rules = db.get_active_ethics_rules()
        return self.rules

    def add_rule(self, rule_key: str, rule_text: str, priority: int = 0):
        """Yeni etik kuralı ekle (kullanıcı tarafından)"""
        db.add_ethics_rule(rule_key, rule_text, priority)
        self.load_rules()

    def remove_rule(self, rule_key: str):
        """Etik kuralını kaldır"""
        db.delete_ethics_rule(rule_key)
        self.load_rules()

    def get_system_prompt(self) -> str:
        """
        Etik kurallarını sistem prompt'u olarak formatlar.
        Bu prompt, modele gönderilmeden önce user mesajının önüne eklenir.
        """
        if not self.rules:
            return ""

        rules_text = "\n".join([
            f"{i+1}. {rule['rule_text']}"
            for i, rule in enumerate(self.rules)
        ])

        return f"""=== ETİK KURALLAR ===
Aşağıdaki etik kurallar, bu asistanın bağlı olduğu mutlak talimatlardır.
BU KURALLAR TARTIŞILMAZ, DEĞİŞTİRİLMEZ VE HER ZAMAN UYGULANIR.

{rules_text}

=== KURAL İHLALİ TESPİTİ ===
Kullanıcının isteği yukarıdaki kurallardan herhangi birini ihlal ediyorsa:
1. İhlal edilen kuralı belirt
2. Neden ihlal olduğunu açıkla
3. Kullanıcıya kuralı hatırlat
4. İsteği gerçekleştirMEyi reddet
5. Alternatif bir çözüm öner (mümkünse)

Kullanıcının isteği kuralları ihlal etmiyorsa, isteği hiçbir engel olmadan yerine getir.
"""

    def validate_request(self, user_message: str) -> Optional[str]:
        """
        Kullanıcı mesajını etik kurallara göre doğrula.
        Returns:
            - None: Kural ihlali yok, istek serbest
            - str: İhlal edilen kuralın açıklaması
        """
        if not self.rules:
            return None

        user_lower = user_message.lower()

        for rule in self.rules:
            rule_text = rule["rule_text"].lower()
            rule_key = rule["rule_key"]

            # Kuralları tara - basit keyword matching
            # Kural metnindeki anahtar kelimeleri kontrol et
            # NOT: Kullanıcı kendi kurallarını belirleyecek,
            # bu yüzden genel bir filtreleme mekanizması kullanıyoruz

            # Her kural bir yasaklama içeriyorsa kontrol et
            if any(negation in rule_text for negation in ["yapma", "yasak", "izin yok", "kullanma"]):
                # Kural negatif içerikli - kullanıcı bu konuda bir şey istiyor mu?
                for keyword in self._extract_keywords(rule_text):
                    if keyword in user_lower:
                        return f"ETİK KURAL İHLALİ [{rule_key}]: {rule['rule_text']}"

        return None

    def _extract_keywords(self, text: str) -> list[str]:
        """Kural metninden önemli anahtar kelimeleri çıkar"""
        # Türkçe stop words
        stop_words = {
            "bir", "bu", "şu", "ve", "veya", "ile", "için", "gibi",
            "ama", "ancak", "fakat", "çünkü", "eğer", "ki", "de", "da",
            "yapma", "yasak", "izin", "yok", "kullanma", "etme", "olma",
            "asla", "kesinlikle", "hiçbir", "herhangi"
        }

        # Sadece anlamlı kelimeleri al
        words = re.findall(r'\b[a-zA-ZğüşıöçĞÜŞİÖÇ]+\b', text.lower())
        return [w for w in words if w not in stop_words and len(w) > 2]

    def validate_response(self, response: str) -> bool:
        """
        Model yanıtını doğrula (opsiyonel - güvenlik katmanı)
        """
        # Şimdilik basit tutuyoruz, gerektiğinde genişletilebilir
        return True


# Global etik motoru örneği
ethics_engine = EthicsEngine()
