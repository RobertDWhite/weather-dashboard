import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=5, ttl=120)


@router.get("/timestamps")
async def get_timestamps():
    if "data" in _cache:
        return _cache["data"]
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get("https://api.rainviewer.com/public/weather-maps.json")
            r.raise_for_status()
            d = r.json()
            result = {
                "host": d["host"],
                "generated": d["generated"],
                "radar": {
                    "past": d["radar"]["past"],
                    "nowcast": d["radar"].get("nowcast", []),
                },
                "satellite": {
                    "infrared": d.get("satellite", {}).get("infrared", []),
                },
            }
            _cache["data"] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
