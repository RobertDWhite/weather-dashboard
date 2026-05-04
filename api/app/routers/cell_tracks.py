"""Storm cell tracks — connect successive scans of the same NEXRAD attribute
cell into polylines so you can see motion + intensification over time.

Identification continuity uses (radar, storm_id) as the cell key. Cells are
read live from /cells/active and cached over the last hour."""
import time
from collections import defaultdict, deque
from typing import Deque

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=2, ttl=120)

# Per-cell ring buffer of recent positions (~1 hour @ 6 min volume scans = 10
# entries). Keyed by (nexrad, storm_id). Trimmed by scan time on read.
_history: dict[str, Deque[dict]] = defaultdict(lambda: deque(maxlen=12))


async def _fetch_cells() -> list[dict]:
    url = "https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers=_HEADERS)
        r.raise_for_status()
        return (r.json().get("features") or [])


@router.get("/recent")
async def get_recent_tracks():
    """Cell tracks from the last hour. Returns one track per cell-id, each
    track being a list of {lat, lon, valid, max_dbz, sknt, drct} sorted by time.
    Updates incrementally — call this every 2-5 min to keep tracks current."""
    if "tracks" in _cache:
        return _cache["tracks"]

    try:
        feats = await _fetch_cells()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"cells unavailable: {e}")

    # Append the latest scan to each cell's history
    for f in feats:
        props = f.get("properties") or {}
        coords = ((f.get("geometry") or {}).get("coordinates")) or [None, None]
        nexrad = props.get("nexrad")
        sid = props.get("storm_id")
        if not (nexrad and sid):
            continue
        if coords[0] is None or coords[1] is None:
            continue
        key = f"{nexrad}.{sid}"
        valid = props.get("valid")
        # Avoid duplicate appends if scan time hasn't changed
        last = _history[key][-1] if _history[key] else None
        if last and last.get("valid") == valid:
            continue
        _history[key].append({
            "lat": coords[1],
            "lon": coords[0],
            "valid": valid,
            "max_dbz": props.get("max_dbz"),
            "sknt": props.get("sknt"),
            "drct": props.get("drct"),
            "tvs": props.get("tvs"),
            "meso": props.get("meso"),
            "ts": time.time(),
        })

    # Trim history older than 1 hour
    cutoff = time.time() - 3600
    tracks: list[dict] = []
    stale_keys = []
    for key, dq in _history.items():
        # Drop old entries from the left
        while dq and dq[0]["ts"] < cutoff:
            dq.popleft()
        if not dq:
            stale_keys.append(key)
            continue
        if len(dq) < 2:
            continue  # one-point "tracks" aren't meaningful — skip until we have 2+
        nexrad, sid = key.split(".", 1)
        tracks.append({
            "key": key,
            "nexrad": nexrad,
            "storm_id": sid,
            "points": list(dq),
        })
    for key in stale_keys:
        _history.pop(key, None)

    result = {"tracks": tracks, "count": len(tracks)}
    _cache["tracks"] = result
    return result
