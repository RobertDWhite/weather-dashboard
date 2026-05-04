import re
import httpx
from cachetools import TTLCache
from fastapi import APIRouter

router = APIRouter()

_cache: TTLCache = TTLCache(maxsize=4, ttl=60)
SDR_API = "http://sdr-viewer-api.sdr-research.svc.cluster.local:8000"

_C_RE = re.compile(r'c(\d{3})')
_S_RE = re.compile(r's(\d{3})')
_G_RE = re.compile(r'g(\d{3})')
_T_RE = re.compile(r't(-?\d{1,3})')
_H_RE = re.compile(r'h(\d{2})')
_B_RE = re.compile(r'b(\d{5})')
_R_RE = re.compile(r'r(\d{3})')
_P_RE = re.compile(r'[Pp](\d{3})')


def _parse_wx(comment: str | None) -> dict | None:
    if not comment:
        return None
    c = _C_RE.search(comment)
    s = _S_RE.search(comment)
    g = _G_RE.search(comment)
    t = _T_RE.search(comment)
    h = _H_RE.search(comment)
    b = _B_RE.search(comment)
    r = _R_RE.search(comment)
    p = _P_RE.search(comment)

    # Require at least temp or pressure to count as a weather station
    if not t and not b:
        return None

    wx: dict = {}
    if c:
        wx['wind_dir_deg'] = int(c.group(1))
    if s:
        wx['wind_speed_mph'] = int(s.group(1))
    if g:
        wx['wind_gust_mph'] = int(g.group(1))
    if t:
        wx['temp_f'] = int(t.group(1))
    if h:
        hval = int(h.group(1))
        wx['humidity_pct'] = 100 if hval == 0 else hval
    if b:
        wx['pressure_mbar'] = round(int(b.group(1)) / 10.0, 1)
    if r:
        wx['rain_1h_in'] = round(int(r.group(1)) / 100.0, 2)
    if p:
        wx['rain_24h_in'] = round(int(p.group(1)) / 100.0, 2)
    return wx


@router.get("/stations")
async def get_aprs_stations(hours: int = 24):
    key = f"stations-{hours}"
    if key in _cache:
        return _cache[key]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"{SDR_API}/api/v1/aprs/stations", params={"hours": hours})
            r.raise_for_status()
            data = r.json()
            stations = []
            for s in data.get("stations", []):
                if s.get("latitude") is None or s.get("longitude") is None:
                    continue
                wx = _parse_wx(s.get("comment"))
                if wx is None:
                    continue
                stations.append({**s, "is_weather": True, "weather": wx})
            result = {"stations": stations, "hours": hours}
            _cache[key] = result
            return result
    except Exception:
        return {"stations": [], "hours": hours}
