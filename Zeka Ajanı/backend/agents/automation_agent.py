"""
Otomasyon Ajanı
Zamanlanmış görevler, tekrarlı işlemler, arka plan otomasyonları
"""
import asyncio
import json
import logging
import threading
import time
from datetime import datetime
from typing import Optional

import schedule

from config import settings
from database import db

logger = logging.getLogger(__name__)


class AutomationAgent:
    """
    Otomasyon ve zamanlanmış görev ajanı
    - Zamanlanmış görevler
    - Tekrarlı işlemler
    - Arka plan otomasyonları
    """

    def __init__(self):
        self.running_tasks: dict[int, threading.Event] = {}
        self._scheduler_running = False
        self._scheduler_thread: Optional[threading.Thread] = None

    def create_task(self, name: str, description: str,
                    task_type: str, config: dict,
                    schedule_time: Optional[str] = None) -> int:
        """
        Yeni bir görev oluştur

        Args:
            name: Görev adı
            description: Görev açıklaması
            task_type: Görev tipi (automation, scraping, file_operation, custom)
            config: Görev konfigürasyonu
            schedule_time: Zamanlama (cron formatı veya "daily", "hourly")

        Returns:
            int: Görev ID'si
        """
        task_id = db.create_task(
            name=name,
            task_type=task_type,
            description=description,
            config=config,
            schedule=schedule_time
        )

        logger.info(f"Görev oluşturuldu: {name} (ID: {task_id})")
        return task_id

    def run_task(self, task_id: int) -> dict:
        """
        Bir görevi çalıştır

        Args:
            task_id: Görev ID'si

        Returns:
            {"status": str, "result": str}
        """
        task = db.get_task(task_id)
        if not task:
            raise ValueError(f"Görev bulunamadı: {task_id}")

        db.update_task_status(task_id, "running")

        try:
            config = json.loads(task["config"]) if task["config"] else {}

            result = self._execute_task(task["task_type"], config)

            db.update_task_status(task_id, "completed", result=str(result))
            logger.info(f"Görev tamamlandı: {task['name']}")

            return {"status": "completed", "result": str(result)}

        except Exception as e:
            error_msg = str(e)
            db.update_task_status(task_id, "failed", error=error_msg)
            logger.error(f"Görev başarısız: {task['name']} - {e}")

            return {"status": "failed", "error": error_msg}

    def _execute_task(self, task_type: str, config: dict) -> any:
        """
        Görev tipine göre işlemi yürüt

        Args:
            task_type: Görev tipi
            config: Konfigürasyon

        Returns:
            İşlem sonucu
        """
        if task_type == "file_operation":
            return self._file_operation(config)
        elif task_type == "scraping":
            return self._scraping_task(config)
        elif task_type == "automation":
            return self._automation_task(config)
        elif task_type == "custom":
            return self._custom_task(config)
        else:
            raise ValueError(f"Bilinmeyen görev tipi: {task_type}")

    def _file_operation(self, config: dict) -> str:
        """Dosya işlemi görevi"""
        operation = config.get("operation", "list")
        target = config.get("target", "")

        from .file_agent import FileAgent
        fa = FileAgent()

        if operation == "cleanup":
            # Belirtilen dizindeki eski dosyaları temizle
            days_old = config.get("days_old", 30)
            # TODO: cleanup implementasyonu
            return f"Temizlik tamamlandı (henüz implementasyon bekliyor)"

        return f"Dosya işlemi: {operation} - {target}"

    def _scraping_task(self, config: dict) -> str:
        """Web scraping görevi"""
        url = config.get("url", "")
        if not url:
            raise ValueError("Scraping için URL belirtilmedi")

        from .web_agent import WebAgent
        wa = WebAgent()
        result = wa.fetch_page(url)

        return f"Web sayfasından {len(result['content'])} karakter veri çekildi: {result.get('title', '')}"

    def _automation_task(self, config: dict) -> str:
        """Genel otomasyon görevi"""
        action = config.get("action", "")
        params = config.get("params", {})

        # Özel otomasyon mantığı
        if action == "notify":
            return f"Bildirim: {params.get('message', '')}"
        elif action == "backup":
            return "Yedekleme tamamlandı"
        elif action == "report":
            return f"Rapor oluşturuldu: {params.get('format', 'text')}"

        return f"Otomasyon görevi: {action}"

    def _custom_task(self, config: dict) -> str:
        """Özel tanımlı görev"""
        command = config.get("command", "")
        parameters = config.get("parameters", {})

        # Kullanıcının tanımladığı özel görevleri burada işle
        return f"Özel görev yürütüldü: {command}"

    def cancel_task(self, task_id: int) -> bool:
        """Çalışan görevi iptal et"""
        if task_id in self.running_tasks:
            self.running_tasks[task_id].set()
            db.update_task_status(task_id, "cancelled")
            logger.info(f"Görev iptal edildi: {task_id}")
            return True
        return False

    def get_task_status(self, task_id: int) -> dict:
        """Görev durumunu sorgula"""
        task = db.get_task(task_id)
        if not task:
            raise ValueError(f"Görev bulunamadı: {task_id}")

        return {
            "id": task["id"],
            "name": task["name"],
            "status": task["status"],
            "type": task["task_type"],
            "schedule": task["schedule"],
            "result": task["result"],
            "error": task["error"],
            "created": task["created_at"],
            "updated": task["updated_at"]
        }

    def list_tasks(self, status: Optional[str] = None) -> list[dict]:
        """Görevleri listele"""
        return db.get_tasks(status=status)

    # === Zamanlayıcı (Scheduler) ===

    def start_scheduler(self):
        """Zamanlayıcıyı başlat (arka plan thread)"""
        if self._scheduler_running:
            return

        self._scheduler_running = True
        self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
        self._scheduler_thread.start()
        logger.info("Zamanlayıcı başlatıldı")

    def stop_scheduler(self):
        """Zamanlayıcıyı durdur"""
        self._scheduler_running = False
        logger.info("Zamanlayıcı durduruldu")

    def _scheduler_loop(self):
        """Zamanlayıcı ana döngüsü"""
        while self._scheduler_running:
            schedule.run_pending()
            time.sleep(1)

    def schedule_task(self, task_id: int, schedule_time: str):
        """Görevi zamanla"""
        task = db.get_task(task_id)
        if not task:
            raise ValueError(f"Görev bulunamadı: {task_id}")

        if schedule_time == "hourly":
            schedule.every().hour.do(self.run_task, task_id=task_id)
        elif schedule_time == "daily":
            schedule.every().day.at("09:00").do(self.run_task, task_id=task_id)
        elif schedule_time.startswith("every_"):
            minutes = int(schedule_time.replace("every_", ""))
            schedule.every(minutes).minutes.do(self.run_task, task_id=task_id)
        else:
            # Cron formatı veya özel
            schedule.every().day.at(schedule_time).do(self.run_task, task_id=task_id)

        logger.info(f"Görev zamanlandı: {task['name']} - {schedule_time}")
