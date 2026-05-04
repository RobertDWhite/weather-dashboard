import httpx
from fastapi import APIRouter, HTTPException, Query
from cachetools import TTLCache
from app.config import settings

router = APIRouter()

_cache: TTLCache = TTLCache(maxsize=128, ttl=300)

WINDY_BASE = "https://api.windy.com/webcams/api/v3"


@router.get("/nearby")
async def cameras_nearby(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: int = Query(default=80, le=200),
    limit: int = Query(default=20, le=50),
):
    if not settings.windy_key:
        raise HTTPException(status_code=503, detail="Windy API key not configured")

    cache_key = f"{lat:.3f},{lon:.3f},{radius},{limit}"
    if cache_key in _cache:
        return _cache[cache_key]

    params = {
        "lang": "en",
        "limit": limit,
        "offset": 0,
        "nearby": f"{lat},{lon},{radius}",
        "include": "location,urls,images",
    }
    headers = {"x-windy-api-key": settings.windy_key}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{WINDY_BASE}/webcams", params=params, headers=headers)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    webcams = data.get("webcams", [])

    result = [
        {
            "id": w.get("webcamId") or w.get("id"),
            "title": w.get("title", "Unknown Camera"),
            "lat": (w.get("location") or {}).get("latitude"),
            "lon": (w.get("location") or {}).get("longitude"),
            "city": (w.get("location") or {}).get("city", ""),
            "country": (w.get("location") or {}).get("country", ""),
            "preview": (w.get("images") or {}).get("current", {}).get("preview"),
            "thumbnail": (w.get("images") or {}).get("current", {}).get("thumbnail"),
            "player_url": (w.get("urls") or {}).get("detail"),
            "embed_url": (w.get("urls") or {}).get("embed"),
        }
        for w in webcams
    ]

    _cache[cache_key] = result
    return result
