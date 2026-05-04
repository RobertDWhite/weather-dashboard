"""US Drought Monitor — current drought severity polygons. Free GIS service
from the National Drought Mitigation Center."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=2, ttl=3600)

# US Drought Monitor ArcGIS feature service — current week's polygons
DM_URL = (
    "https://gis.cpc.ncep.noaa.gov/arcgis/rest/services/USDM_Current/MapServer/0/query"
    "?where=1%3D1&outFields=*&f=geojson"
)


@router.get("/current")
async def get_drought():
    """Current US Drought Monitor categorical polygons (D0–D4)."""
    if "now" in _cache:
        return _cache["now"]
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(DM_URL, headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"USDM unavailable: {e}")
    _cache["now"] = data
    return data
