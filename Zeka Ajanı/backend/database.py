"""
Zeka Ajanı - SQLite Veritabanı Yönetimi
Tüm platformlar arasında senkronizasyon için merkezi veritabanı
"""
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from config import settings


class Database:
    """SQLite veritabanı yöneticisi - tüm ajan modülleri tarafından kullanılır"""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.DB_PATH
        self._init_tables()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_tables(self):
        """Tabloları oluştur (ilk çalıştırmada)"""
        with self._get_connection() as conn:
            conn.executescript("""
                -- Sohbet geçmişi
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL DEFAULT 'Yeni Sohbet',
                    model_provider TEXT DEFAULT 'groq',
                    model_name TEXT DEFAULT 'llama3-8b-8192',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    is_archived INTEGER DEFAULT 0
                );

                -- Mesajlar
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id INTEGER NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
                    content TEXT NOT NULL,
                    model_used TEXT,
                    tokens_used INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );

                -- Görevler (Otomasyon & Özel Görevler)
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    task_type TEXT NOT NULL CHECK(task_type IN ('automation', 'scraping', 'file_operation', 'custom')),
                    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
                    config TEXT DEFAULT '{}',
                    schedule TEXT,
                    result TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Dosya kayıtları
                CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER DEFAULT 0,
                    mime_type TEXT,
                    conversation_id INTEGER,
                    task_id INTEGER,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
                );

                -- Etik kuralları
                CREATE TABLE IF NOT EXISTS ethics_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rule_key TEXT UNIQUE NOT NULL,
                    rule_text TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    priority INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Sistem logları
                CREATE TABLE IF NOT EXISTS system_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error', 'debug')),
                    module TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Projeler (Sağ Sidebar)
                CREATE TABLE IF NOT EXISTS repos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    icon TEXT DEFAULT '🌐',
                    badge TEXT DEFAULT 'Site',
                    sort_order INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- İndeksler
                CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
                CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);
                CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
                CREATE INDEX IF NOT EXISTS idx_repos_sort ON repos(sort_order);
            """)

    # === Sohbet İşlemleri ===

    def create_conversation(self, title: str = "Yeni Sohbet", model_provider: str = "groq", model_name: str = "llama3-8b-8192") -> int:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO conversations (title, model_provider, model_name) VALUES (?, ?, ?)",
                (title, model_provider, model_name)
            )
            return cursor.lastrowid

    def get_conversations(self, limit: int = 50) -> list[dict]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM conversations WHERE is_archived = 0 ORDER BY updated_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_archived_conversations(self, limit: int = 50) -> list[dict]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM conversations WHERE is_archived = 1 ORDER BY updated_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_conversation(self, conv_id: int) -> Optional[dict]:
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?", (conv_id,)
            ).fetchone()
            return dict(row) if row else None

    def update_conversation_title(self, conv_id: int, title: str):
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?",
                (title, conv_id)
            )

    def delete_conversation(self, conv_id: int):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))

    def archive_conversation(self, conv_id: int):
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE conversations SET is_archived = 1, updated_at = datetime('now') WHERE id = ?",
                (conv_id,)
            )

    def unarchive_conversation(self, conv_id: int):
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE conversations SET is_archived = 0, updated_at = datetime('now') WHERE id = ?",
                (conv_id,)
            )

    # === Mesaj İşlemleri ===

    def save_message(self, conversation_id: int, role: str, content: str,
                     model_used: Optional[str] = None, tokens_used: int = 0) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute(
                """INSERT INTO messages (conversation_id, role, content, model_used, tokens_used)
                   VALUES (?, ?, ?, ?, ?)""",
                (conversation_id, role, content, model_used, tokens_used)
            )
            # Sohbet güncelleme zamanını güncelle
            conn.execute(
                "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
                (conversation_id,)
            )
            return cursor.lastrowid

    def get_messages(self, conversation_id: int) -> list[dict]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
                (conversation_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_message_history(self, conversation_id: int, limit: int = 50) -> list[dict]:
        """Sohbet için mesaj geçmişini döndürür (model context'i için)"""
        messages = self.get_messages(conversation_id)
        return [{"role": m["role"], "content": m["content"]} for m in messages[-limit:]]

    # === Görev İşlemleri ===

    def create_task(self, name: str, task_type: str, description: str = "",
                    config: Optional[dict] = None, schedule: Optional[str] = None) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute(
                """INSERT INTO tasks (name, description, task_type, config, schedule)
                   VALUES (?, ?, ?, ?, ?)""",
                (name, description, task_type, json.dumps(config or {}), schedule)
            )
            return cursor.lastrowid

    def update_task_status(self, task_id: int, status: str, result: Optional[str] = None,
                           error: Optional[str] = None):
        with self._get_connection() as conn:
            conn.execute(
                """UPDATE tasks SET status = ?, result = COALESCE(?, result),
                   error = COALESCE(?, error), updated_at = datetime('now')
                   WHERE id = ?""",
                (status, result, error, task_id)
            )

    def get_tasks(self, status: Optional[str] = None, limit: int = 50) -> list[dict]:
        with self._get_connection() as conn:
            if status:
                rows = conn.execute(
                    "SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
                    (status, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?", (limit,)
                ).fetchall()
            return [dict(r) for r in rows]

    def get_task(self, task_id: int) -> Optional[dict]:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            return dict(row) if row else None

    # === Dosya İşlemleri ===

    def save_file_record(self, filename: str, original_name: str, file_path: str,
                         file_size: int = 0, mime_type: str = "",
                         conversation_id: Optional[int] = None,
                         task_id: Optional[int] = None) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute(
                """INSERT INTO files (filename, original_name, file_path, file_size, mime_type,
                   conversation_id, task_id) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (filename, original_name, file_path, file_size, mime_type,
                 conversation_id, task_id)
            )
            return cursor.lastrowid

    def get_files(self, conversation_id: Optional[int] = None, limit: int = 50) -> list[dict]:
        with self._get_connection() as conn:
            if conversation_id:
                rows = conn.execute(
                    "SELECT * FROM files WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
                    (conversation_id, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM files ORDER BY created_at DESC LIMIT ?", (limit,)
                ).fetchall()
            return [dict(r) for r in rows]

    # === Etik Kural İşlemleri ===

    def add_ethics_rule(self, rule_key: str, rule_text: str, priority: int = 0):
        with self._get_connection() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO ethics_rules (rule_key, rule_text, priority)
                   VALUES (?, ?, ?)""",
                (rule_key, rule_text, priority)
            )

    def get_active_ethics_rules(self) -> list[dict]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM ethics_rules WHERE is_active = 1 ORDER BY priority DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def delete_ethics_rule(self, rule_key: str):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM ethics_rules WHERE rule_key = ?", (rule_key,))

    # === Proje İşlemleri ===

    def get_repos(self) -> list[dict]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM repos ORDER BY sort_order ASC, created_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def create_repo(self, name: str, url: str, icon: str = "🌐", badge: str = "Site") -> int:
        with self._get_connection() as conn:
            # En yüksek sort_order'u bul
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM repos").fetchone()[0]
            cursor = conn.execute(
                "INSERT INTO repos (name, url, icon, badge, sort_order) VALUES (?, ?, ?, ?, ?)",
                (name, url, icon, badge, max_order + 1)
            )
            return cursor.lastrowid

    def update_repo(self, repo_id: int, name: str, url: str, icon: str, badge: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.execute(
                """UPDATE repos SET name = ?, url = ?, icon = ?, badge = ?,
                   updated_at = datetime('now') WHERE id = ?""",
                (name, url, icon, badge, repo_id)
            )
            return cursor.rowcount > 0

    def delete_repo(self, repo_id: int) -> bool:
        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM repos WHERE id = ?", (repo_id,))
            return cursor.rowcount > 0

    # === Log İşlemleri ===

    def add_log(self, level: str, module: str, message: str, details: Optional[str] = None):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO system_logs (level, module, message, details) VALUES (?, ?, ?, ?)",
                (level, module, message, details)
            )

    def get_logs(self, level: Optional[str] = None, limit: int = 100) -> list[dict]:
        with self._get_connection() as conn:
            if level:
                rows = conn.execute(
                    "SELECT * FROM system_logs WHERE level = ? ORDER BY created_at DESC LIMIT ?",
                    (level, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?", (limit,)
                ).fetchall()
            return [dict(r) for r in rows]


# Global veritabanı örneği
db = Database()
