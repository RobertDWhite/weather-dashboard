"""Active wildfire perimeters + incidents from the National Interagency Fire
Center (NIFC) ArcGIS feature services."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=2, ttl=900)

# NIFC's "WFIGS Current Wildland Fire Locations" feature service — point per
# active fire incident. Lighter than the full perimeter polygons.
NIFC_INCIDENTS = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Incident_Locations_Current/FeatureServer/0/query"
    "?where=1%3D1&outFields=IncidentName,IncidentTypeCategory,FireDiscoveryDateTime,"
    "DailyAcres,FireCause,POOState&f=geojson"
)


@router.get("/active")
async def get_active_fires():
    """Active wildfire incidents. Returns lightweight points (lat/lon + name +
    acres) suitable for map markers."""
    if "fires" in _cache:
        return _cache["fires"]
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(NIFC_INCIDENTS, headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NIFC unavailable: {e}")

    fires: list[dict] = []
    for f in (data.get("features") or []):
        p = f.get("properties") or {}
        c = ((f.get("geometry") or {}).get("coordinates")) or [None, None]
        if c[0] is None or c[1] is None:
            continue
        fires.append({
            "lon": c[0],
            "lat": c[1],
            "name": p.get("IncidentName"),
            "type": p.get("IncidentTypeCategory"),
            "discovered": p.get("FireDiscoveryDateTime"),
            "acres": p.get("DailyAcres"),
            "cause": p.get("FireCause"),
            "state": p.get("POOState"),
        })
    # Sort biggest first
    fires.sort(key=lambda x: (x.get("acres") or 0), reverse=True)
    result = {"fires": fires, "count": len(fires)}
    _cache["fires"] = result
    return result
