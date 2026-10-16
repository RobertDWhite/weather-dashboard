"""Local-only, synthetic API for visual regression checks.

Run: python3 scripts/serve_review_fixtures.py
Then: cd ui && WX_API_URL=http://127.0.0.1:8001 npm run dev -- --port 5174
No production API or notification service is contacted.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
from urllib.parse import urlparse

FIXTURES = json.loads((Path(__file__).resolve().parents[1] / "ui/src/test/fixtures.json").read_text())
# A transparent tile, not a synthetic precipitation field.
import struct
import zlib
def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
PIXEL = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 1, 1, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00\x00\x00\x00\x00')) + chunk(b'IEND', b'')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/tiles'):
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.end_headers()
            self.wfile.write(PIXEL)
            return
        data = FIXTURES.get(self.path, FIXTURES.get(path))
        self.send_response(200 if data is not None else 503)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data or {'detail': 'No review fixture for this source'}).encode())

    def do_POST(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"source":"fallback","order":[],"reasoning":"Synthetic review"}')

    def log_message(self, *_args):
        pass


if __name__ == '__main__':
    print('Synthetic review API listening on http://127.0.0.1:8001', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8001), Handler).serve_forever()
