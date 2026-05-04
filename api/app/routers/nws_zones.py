"""NWS infrastructure overlays — CWA (county-warning-area) boundaries, fire
weather zones, public forecast zones, marine zones. NWS publishes all of
these as ArcGIS feature services that we proxy here."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
# Zone polygons are essentially static (changes are extremely rare); cache long.
_cache: TTLCache = TTLCache(maxsize=8, ttl=86400)

# NOAA NWS GIS feature services. Each returns GeoJSON when f=geojson.
_LAYERS = {
    "cwa": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "NWS_Reference_Maps/NWS_Reference_Map/MapServer/4/query"
        "?where=1%3D1&outFields=CWA,WFO&f=geojson"
    ),
    "fire": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "NWS_Reference_Maps/NWS_Reference_Map/MapServer/2/query"
        "?where=1%3D1&outFields=STATE,ZONE,NAME&f=geojson"
    ),
    "public": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "NWS_Reference_Maps/NWS_Reference_Map/MapServer/1/query"
        "?where=1%3D1&outFields=STATE,ZONE,NAME&f=geojson"
    ),
    "marine": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "NWS_Reference_Maps/NWS_Reference_Map/MapServer/3/query"
        "?where=1%3D1&outFields=ID,NAME&f=geojson"
    ),
}


@router.get("/{layer}")
async def get_zones(layer: str):
    """Return GeoJSON polygons for the requested NWS zone layer."""
    if layer not in _LAYERS:
        raise HTTPException(status_code=404, detail=f"unknown zone layer {layer}")
    if layer in _cache:
        return _cache[layer]
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(_LAYERS[layer], headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NWS zones unavailable: {e}")
    _cache[layer] = data
    return data
