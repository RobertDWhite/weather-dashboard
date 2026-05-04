"""NEXRAD storm-cell attribute table — current cell positions, motion vectors,
peak reflectivity, hail probabilities. Sourced from Iowa Mesonet's GeoJSON
aggregation of all NWS RDA storm-attribute messages."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=2, ttl=120)


@router.get("/active")
async def get_active_cells():
    """Active radar storm cells across CONUS. Each cell carries motion vector,
    max reflectivity, top, hail probabilities, and TVS/MESO indicators."""
    if "cells" in _cache:
        return _cache["cells"]
    url = "https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"storm cells unavailable: {e}")

    feats = data.get("features") or []
    cells: list[dict] = []
    for f in feats:
        props = (f.get("properties") or {})
        coords = ((f.get("geometry") or {}).get("coordinates")) or [None, None]
        if coords[0] is None or coords[1] is None:
            continue
        cells.append({
            "lon": coords[0],
            "lat": coords[1],
            "nexrad": props.get("nexrad"),
            "storm_id": props.get("storm_id"),
            "azimuth": props.get("azimuth"),
            "range_nm": props.get("range"),
            "tvs": props.get("tvs"),
            "meso": props.get("meso"),
            "drct": props.get("drct"),  # storm motion direction (deg)
            "sknt": props.get("sknt"),  # storm motion speed (kt)
            "top_kft": props.get("top"),
            "vil": props.get("vil"),
            "max_dbz": props.get("max_dbz"),
            "max_dbz_height_kft": props.get("max_dbz_h"),
            "poh": props.get("poh"),     # prob of hail
            "posh": props.get("posh"),   # prob of severe hail
            "max_size_in": props.get("max_size"),
            "valid": props.get("valid"),
        })
    result = {"cells": cells, "count": len(cells)}
    _cache["cells"] = result
    try:
        from app.metrics import active_storm_cells
        active_storm_cells.set(len(cells))
    except Exception:
        pass
    return result
