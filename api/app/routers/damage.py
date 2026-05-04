"""NWS Damage Assessment Toolkit (DAT) — post-event tornado/thunderstorm
damage path polygons. Sourced from the public NWS DAT ArcGIS feature service.

Useful overlay for the day-after-event view: shows where damage actually
occurred, vs. just the warning polygon. Filters to last 7 days by default."""
import time

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=8, ttl=900)


@router.get("/recent")
async def get_recent_damage(days: int = Query(7, ge=1, le=60)):
    """Recent NWS-surveyed tornado damage tracks (and other DAT layers)."""
    cache_key = f"dat:{days}"
    if cache_key in _cache:
        return _cache[cache_key]

    cutoff_ms = int((time.time() - days * 86400) * 1000)
    # NWS DAT feature service — Tornado Tracks layer (id 1)
    url = (
        "https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/"
        f"DamageViewer/MapServer/1/query?where=event_date%20%3E%20{cutoff_ms}"
        "&outFields=*&f=geojson"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            if r.status_code != 200:
                # Service is sometimes 503 between events; return empty rather than fail
                result = {"tracks": {"type": "FeatureCollection", "features": []}, "count": 0, "days": days}
                _cache[cache_key] = result
                return result
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NWS DAT unavailable: {e}")

    feats = (data.get("features") or [])
    result = {"tracks": data, "count": len(feats), "days": days}
    _cache[cache_key] = result
    return result
