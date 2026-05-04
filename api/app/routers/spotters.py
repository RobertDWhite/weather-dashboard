"""Spotter Network active spotter positions. Sourced from spotternetwork.org's
public Gibson Ridge text feed (gr.txt) — CORS-permissive but blocks the default
httpx UA, so we proxy server-side with a browser UA + parse the GR-style
"Object/Icon/End" blocks into JSON."""
import re
import time as _time

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=2, ttl=120)

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept": "text/plain,*/*;q=0.8",
}

# Each spotter block looks like:
# Object: 40.1112328,-88.0400772
# Icon: 0,0,000,6,10,"Cory Munds\n2026-05-02 01:19:59 UTC\nSTATIONARY"
# Text: 15, 10, 1, "Cory Munds"
# End:
_OBJECT_RE = re.compile(r"^Object:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$", re.M)
_ICON_RE = re.compile(
    r'^Icon:\s*\d+,\s*\d+,\s*(\d+),\s*\d+,\s*(\d+),\s*"([^"]*)"',
    re.M,
)


def _parse_block(block: str) -> dict | None:
    om = _OBJECT_RE.search(block)
    if not om:
        return None
    try:
        lat = float(om.group(1))
        lon = float(om.group(2))
    except ValueError:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    im = _ICON_RE.search(block)
    direction: int | None = None
    icon_row: int | None = None
    meta_lines: list[str] = []
    if im:
        try:
            direction = int(im.group(1)) % 360
        except ValueError:
            pass
        try:
            icon_row = int(im.group(2))
        except ValueError:
            pass
        # Meta is a single quoted string with literal "\n" separators
        meta_lines = [line.strip() for line in im.group(3).split(r"\n") if line.strip()]

    callsign = meta_lines[0] if meta_lines else None
    last_seen = meta_lines[1] if len(meta_lines) > 1 else None
    motion = meta_lines[2] if len(meta_lines) > 2 else None
    extra: dict[str, str] = {}
    for ln in meta_lines[3:]:
        if ":" in ln:
            k, v = ln.split(":", 1)
            extra[k.strip().lower()] = v.strip()

    return {
        "lat": lat,
        "lon": lon,
        "callsign": callsign,
        "last_seen": last_seen,
        "motion": motion,            # "STATIONARY" / "MOVING" / etc
        "direction_deg": direction,  # 0 = motionless / unknown
        "icon_row": icon_row,        # spotter category (chase team / mobile / etc)
        "phone": extra.get("phone"),
        "email": extra.get("email"),
        "im": extra.get("im"),
        "web": extra.get("web"),
    }


@router.get("/active")
async def get_active_spotters():
    """Active Spotter Network positions across CONUS."""
    if "all" in _cache:
        return _cache["all"]

    url = "https://www.spotternetwork.org/feeds/gr.txt"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=_BROWSER_HEADERS)
            r.raise_for_status()
            text = r.text
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Spotter Network unavailable: {e}")

    spotters: list[dict] = []
    # The feed has a header section (Refresh:, Title:, IconFile:, ...) followed
    # by Object/.../End blocks. Split on End: to isolate each spotter.
    for raw in text.split("End:"):
        if "Object:" not in raw:
            continue
        rec = _parse_block(raw)
        if rec:
            spotters.append(rec)

    # Filter out positions that haven't updated in >12h to keep the map clean
    cutoff = _time.time() - 12 * 3600
    fresh: list[dict] = []
    for s in spotters:
        ts = _parse_iso_z(s.get("last_seen") or "")
        if ts is not None and ts < cutoff:
            continue
        fresh.append(s)

    result = {
        "spotters": fresh,
        "total_in_feed": len(spotters),
        "count": len(fresh),
        "fetched_at": int(_time.time()),
    }
    _cache["all"] = result
    return result


def _parse_iso_z(s: str) -> float | None:
    """Parse '2026-05-02 01:19:59 UTC' to epoch seconds. Best-effort."""
    try:
        from datetime import datetime, timezone
        if s.endswith(" UTC"):
            s = s[:-4]
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None
