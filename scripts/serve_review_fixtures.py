"""Local-only, synthetic API for visual regression checks.

Run: python3 scripts/serve_review_fixtures.py
Then: cd ui && WX_API_URL=http://127.0.0.1:8001 npm run dev -- --port 5174
No production API or notification service is contacted.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone, timedelta
import copy
import sys

FIXTURES = json.loads((Path(__file__).resolve().parents[1] / "ui/src/test/fixtures.json").read_text())
# Rebase synthetic weather to the review day so current-hour filtering remains testable.
now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
forecast = FIXTURES['/openmeteo/forecast']
original = forecast['hourly']
forecast['hourly'] = [{**original[i % len(original)], 'time': (now + timedelta(hours=i)).isoformat()} for i in range(168)]
for i, day in enumerate(forecast['daily']):
    day['date'] = (now - timedelta(hours=4) + timedelta(days=i)).date().isoformat()
FIXTURES['/openmeteo/current']['time'] = now.isoformat()
AI_GENERATED = datetime.now(timezone.utc).timestamp()
FIXTURES['/briefing/status'] = {'ok':True,'configured_model':'Review fixture (no model call)'}
for i, snap in enumerate(FIXTURES['/timemachine/snapshots?hours=6']['snapshots']):
    snap['ts'] = int(now.timestamp()) - (6-i)*600
FIXTURES['/timemachine/at']['snapshot_ts'] = int(now.timestamp()) - 3600
if '--alerts' in sys.argv:
    features = []
    for i in range(2):
        alert = copy.deepcopy(FIXTURES['/nws/alerts']['features'][0])
        alert['id'] = alert['properties']['id'] = f'review-local-{i}'
        alert['properties'].update(event='Freeze Watch', severity='Severe', areaDesc='; '.join(['Review County']*25), onset=(now+timedelta(hours=12)).isoformat(), ends=(now+timedelta(hours=24)).isoformat())
        features.append(alert)
    FIXTURES['/nws/alerts?local=true'] = {'type':'FeatureCollection','features':features}
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
        query = parse_qs(urlparse(self.path).query)
        global AI_GENERATED
        if path == '/briefing/now':
            if query.get('refresh') == ['true']:
                AI_GENERATED = datetime.now(timezone.utc).timestamp()
            data = {'source':'ollama','model':'Review fixture (no model call)',
                    'text':'Synthetic review summary: cool conditions with a possible overnight freeze. Review the listed alert dates and forecast hours.',
                    'generated_at':AI_GENERATED,'scope':query.get('scope',['nearby'])[0],
                    'context':{'alerts_count':1 if query.get('scope')==['home'] else 2,'lsrs_count':0,'has_afd':False,'has_hwo':False},
                    'sources':{'alerts':'available','lsrs':'available','afd':'unavailable','hwo':'unavailable'}}
        elif path == '/nws/alerts' and query.get('local') == ['true']:
            data = copy.deepcopy(FIXTURES['/nws/alerts?local=true'])
            if query.get('scope') == ['home']:
                data['features'] = data['features'][:1]
        else:
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
