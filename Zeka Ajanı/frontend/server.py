import http.server
import socketserver
import sys
from pathlib import Path

PORT = 8001
DIR = Path(__file__).parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIR), **kwargs)
    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {args[0]} {args[1]} {args[2]}")

with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Frontend: http://127.0.0.1:{PORT}")
    httpd.serve_forever()
