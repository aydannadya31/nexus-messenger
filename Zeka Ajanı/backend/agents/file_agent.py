"""
Dosya İşlemleri Ajanı
Dosya oluşturma, okuma, düzenleme, silme, arama işlemleri
"""
import logging
import shutil
from pathlib import Path
from typing import Optional

from config import settings
from database import db

logger = logging.getLogger(__name__)


class FileAgent:
    """Dosya ve klasör işlemleri ajanı"""

    def __init__(self):
        self.upload_dir = settings.UPLOAD_DIR
        # Güvenlik: sadece belirtilen dizinlerde çalış
        self.allowed_dirs = [
            settings.BASE_DIR,
            settings.DATA_DIR,
            settings.UPLOAD_DIR,
        ]

    def _is_path_allowed(self, target_path: Path) -> bool:
        """Hedef yolun güvenli olup olmadığını kontrol et"""
        try:
            target_path = target_path.resolve()
            for allowed in self.allowed_dirs:
                if str(target_path).startswith(str(allowed.resolve())):
                    return True
            return False
        except Exception:
            return False

    def read_file(self, filepath: str) -> dict:
        """
        Dosya içeriğini oku

        Args:
            filepath: Dosya yolu

        Returns:
            {"content": str, "filename": str, "size": int}
        """
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Dosya bulunamadı: {filepath}")
        if not self._is_path_allowed(path):
            raise PermissionError(f"Bu dosyaya erişim izniniz yok: {filepath}")

        content = path.read_text(encoding="utf-8")
        return {
            "content": content,
            "filename": path.name,
            "size": path.stat().st_size
        }

    def write_file(self, filepath: str, content: str, task_id: Optional[int] = None) -> dict:
        """
        Dosya oluştur veya güncelle

        Args:
            filepath: Dosya yolu (göreceli veya mutlak)
            content: Dosya içeriği
            task_id: İlişkili görev ID'si (opsiyonel)

        Returns:
            {"path": str, "size": int}
        """
        path = Path(filepath)

        # Eğer göreceli yolsa upload klasörüne kaydet
        if not path.is_absolute():
            path = self.upload_dir / path

        if not self._is_path_allowed(path):
            raise PermissionError(f"Bu konuma dosya yazma izniniz yok: {filepath}")

        # Klasörü oluştur (yoksa)
        path.parent.mkdir(parents=True, exist_ok=True)

        # Dosyayı yaz
        path.write_text(content, encoding="utf-8")

        # Veritabanına kaydet
        db.save_file_record(
            filename=path.name,
            original_name=path.name,
            file_path=str(path),
            file_size=path.stat().st_size,
            mime_type=self._guess_mime_type(path.suffix),
            task_id=task_id
        )

        logger.info(f"Dosya oluşturuldu: {path}")
        return {
            "path": str(path),
            "size": path.stat().st_size
        }

    def delete_file(self, filepath: str) -> bool:
        """Dosya sil"""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Dosya bulunamadı: {filepath}")
        if not self._is_path_allowed(path):
            raise PermissionError(f"Bu dosyayı silme izniniz yok: {filepath}")

        path.unlink()
        logger.info(f"Dosya silindi: {path}")
        return True

    def list_files(self, directory: Optional[str] = None) -> list[dict]:
        """Dosyaları listele"""
        search_dir = Path(directory) if directory else self.upload_dir

        if not self._is_path_allowed(search_dir):
            raise PermissionError(f"Bu dizini görüntüleme izniniz yok: {directory}")

        if not search_dir.exists():
            return []

        files = []
        for item in search_dir.iterdir():
            files.append({
                "name": item.name,
                "path": str(item),
                "size": item.stat().st_size,
                "is_dir": item.is_dir(),
                "modified": item.stat().st_mtime
            })

        return sorted(files, key=lambda x: x["name"])

    def search_files(self, query: str, directory: Optional[str] = None) -> list[dict]:
        """Dosya adında arama yap"""
        search_dir = Path(directory) if directory else settings.BASE_DIR

        if not self._is_path_allowed(search_dir):
            raise PermissionError(f"Bu dizinde arama izniniz yok")

        results = []
        for path in search_dir.rglob(f"*{query}*"):
            if path.is_file():
                results.append({
                    "name": path.name,
                    "path": str(path),
                    "size": path.stat().st_size
                })

        return results[:50]  # İlk 50 sonuç

    def copy_file(self, source: str, dest: str) -> dict:
        """Dosya kopyala"""
        src_path = Path(source)
        dst_path = Path(dest)

        if not self._is_path_allowed(src_path) or not self._is_path_allowed(dst_path):
            raise PermissionError("Bu dosyayı kopyalama izniniz yok")

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)

        return {
            "source": str(src_path),
            "destination": str(dst_path),
            "size": dst_path.stat().st_size
        }

    def _guess_mime_type(self, extension: str) -> str:
        """Dosya uzantısından MIME tipini tahmin et"""
        mime_types = {
            ".txt": "text/plain",
            ".py": "text/x-python",
            ".js": "text/javascript",
            ".json": "application/json",
            ".csv": "text/csv",
            ".md": "text/markdown",
            ".html": "text/html",
            ".css": "text/css",
            ".xml": "application/xml",
            ".yaml": "application/x-yaml",
            ".yml": "application/x-yaml",
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".zip": "application/zip",
        }
        return mime_types.get(extension.lower(), "application/octet-stream")
