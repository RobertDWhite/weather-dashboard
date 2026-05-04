"""USGS earthquake feed — recent magnitude 2.5+ quakes. Free, no key."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=4, ttl=120)


_FEEDS = {
    "1h": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson",
    "1d": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    "7d": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson",
}


@router.get("/recent")
async def get_recent_quakes(
    period: str = Query("1d", pattern=r"^(1h|1d|7d)$"),
):
    """Recent earthquakes from USGS. Default: last 24h, M2.5+."""
    cache_key = period
    if cache_key in _cache:
        return _cache[cache_key]

    url = _FEEDS[period]
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"USGS unavailable: {e}")

    quakes: list[dict] = []
    for f in (data.get("features") or []):
        p = f.get("properties") or {}
        c = ((f.get("geometry") or {}).get("coordinates")) or [None, None, None]
        if c[0] is None or c[1] is None:
            continue
        quakes.append({
            "lon": c[0],
            "lat": c[1],
            "depth_km": c[2],
            "mag": p.get("mag"),
            "place": p.get("place"),
            "time_ms": p.get("time"),
            "felt": p.get("felt"),
            "tsunami": p.get("tsunami"),
            "url": p.get("url"),
            "alert": p.get("alert"),
            "type": p.get("type"),
        })
    quakes.sort(key=lambda q: (q.get("mag") or 0), reverse=True)
    result = {"quakes": quakes, "count": len(quakes), "period": period}
    _cache[cache_key] = result
    return result
