import math
import httpx
from fastapi import APIRouter, HTTPException, Query
from cachetools import TTLCache
from app.config import settings

router = APIRouter()

# Full camera list cached for 1 hour — locations don't change
_all_cameras: TTLCache = TTLCache(maxsize=1, ttl=3600)
# Nearby results cached for 5 minutes
_nearby_cache: TTLCache = TTLCache(maxsize=256, ttl=300)

OHGO_BASE = "https://publicapi.ohgo.com/api/v1"


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


async def _fetch_all() -> list:
    if "cameras" in _all_cameras:
        return _all_cameras["cameras"]

    headers = {"Authorization": f"APIKEY {settings.ohgo_key}"}
    all_results = []

    async with httpx.AsyncClient(timeout=15) as client:
        page = 1
        while True:
            resp = await client.get(f"{OHGO_BASE}/cameras", params={"page": page}, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            data = resp.json()
            all_results.extend(data.get("results", []))
            if page >= data.get("totalPageCount", 1):
                break
            page += 1

    _all_cameras["cameras"] = all_results
    return all_results


@router.get("/nearby")
async def ohgo_cameras_nearby(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: int = Query(default=50, le=200),
    limit: int = Query(default=20, le=50),
):
    if not settings.ohgo_key:
        raise HTTPException(status_code=503, detail="OHGO API key not configured")

    cache_key = f"{lat:.3f},{lon:.3f},{radius},{limit}"
    if cache_key in _nearby_cache:
        return _nearby_cache[cache_key]

    all_cams = await _fetch_all()

    nearby = []
    for cam in all_cams:
        clat = cam.get("latitude")
        clon = cam.get("longitude")
        if clat is None or clon is None:
            continue
        dist = _haversine_miles(lat, lon, clat, clon)
        if dist <= radius:
            nearby.append((dist, cam))

    nearby.sort(key=lambda x: x[0])

    result = []
    for dist, cam in nearby[:limit]:
        views = cam.get("cameraViews", [])
        for view in views:
            result.append({
                "id": f"{cam['id']}-{view.get('direction', 'view')}",
                "title": view.get("mainRoute") or cam.get("location") or cam.get("description", ""),
                "direction": view.get("direction", ""),
                "lat": cam["latitude"],
                "lon": cam["longitude"],
                "image_url": view.get("largeUrl") or view.get("smallUrl"),
                "thumbnail_url": view.get("smallUrl"),
                "source": "OHGO",
                "distance_miles": round(dist, 1),
            })

    _nearby_cache[cache_key] = result
    return result
