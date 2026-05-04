"""hazards.weather.gov master polygon view — all NWS hazards (warnings,
watches, advisories, marine, fire-weather, etc.) as a single GeoJSON layer.

Combined with the existing /nws/alerts data, this gives forecasters the
hazards.weather.gov experience: one consolidated view of everything active."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=2, ttl=60)


@router.get("/all")
async def get_all_hazards():
    """Active NWS Watch/Warning/Advisory polygons — the same dataset behind
    hazards.weather.gov. Returns a GeoJSON FeatureCollection."""
    if "all" in _cache:
        return _cache["all"]
    url = (
        "https://mapservices.weather.noaa.gov/eventdriven/rest/services/"
        "WWA/watch_warn_adv/MapServer/0/query"
        "?where=1%3D1&outFields=*&f=geojson"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"hazards unavailable: {e}")
    _cache["all"] = data
    return data
