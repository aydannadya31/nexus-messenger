"""
Zeka Ajanı - Başlatma Script'i
Backend API ve Frontend sunucusunu aynı anda başlatır
"""
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

BASE_DIR = Path(__file__).parent

print("=" * 60)
print("  ZEKA AJANI - Başlatılıyor...")
print("=" * 60)

# 1. Backend API'yi başlat (port 8000)
print("\n[1/2] Backend API başlatılıyor (port 8000)...")
backend = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd=str(BASE_DIR / "backend"),
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NO_WINDOW
)

# Backend'in hazır olmasını bekle
time.sleep(3)

# 2. Frontend sunucusunu başlat (port 8001)
print("[2/2] Frontend sunucusu başlatılıyor (port 8001)...")
frontend = subprocess.Popen(
    [sys.executable, "-m", "http.server", "8001", "--directory", str(BASE_DIR / "frontend")],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NO_WINDOW
)

time.sleep(1)

print("\n" + "=" * 60)
print("  ✅ ZEKA AJANI ÇALIŞIYOR!")
print()
print("  🌐 Web Arayüz : http://localhost:8001")
print("  🔌 API        : http://localhost:8000")
print("  📋 Sağlık     : http://localhost:8000/api/health")
print()
print("  Kapatmak için: CTRL+C")
print("=" * 60)

# Browser'ı aç
time.sleep(1)
webbrowser.open("http://localhost:8001")

try:
    # Çıkış için CTRL+C bekle
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\n\nKapatılıyor...")
    backend.terminate()
    frontend.terminate()
    print("Zeka Ajanı durduruldu.")
