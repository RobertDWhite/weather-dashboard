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

# NOAA NWS GIS feature services. The service path is case-sensitive on the
# current ArcGIS deployment; layer IDs are the published NWS reference map
# layers (CWA 1, coastal marine 5, public 8, fire 9).
_LAYERS = {
    "cwa": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "nws_reference_maps/nws_reference_map/MapServer/1/query"
        "?where=1%3D1&outFields=CWA,WFO&outSR=4326&maxAllowableOffset=5000&f=geojson"
    ),
    "fire": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "nws_reference_maps/nws_reference_map/MapServer/9/query"
        "?where=1%3D1&outFields=STATE,ZONE,NAME&outSR=4326&maxAllowableOffset=5000&f=geojson"
    ),
    "public": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "nws_reference_maps/nws_reference_map/MapServer/8/query"
        "?where=1%3D1&outFields=STATE,ZONE,NAME&outSR=4326&maxAllowableOffset=5000&f=geojson"
    ),
    "marine": (
        "https://mapservices.weather.noaa.gov/static/rest/services/"
        "nws_reference_maps/nws_reference_map/MapServer/5/query"
        "?where=1%3D1&outFields=ID,NAME&outSR=4326&maxAllowableOffset=5000&f=geojson"
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
