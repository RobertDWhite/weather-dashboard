"""NWS Damage Assessment Toolkit (DAT) — post-event tornado/thunderstorm
damage path polygons. Sourced from the public NWS DAT ArcGIS feature service.

Useful overlay for the day-after-event view: shows where damage actually
occurred, vs. just the warning polygon. Filters to last 7 days by default."""
import time

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=8, ttl=900)


@router.get("/recent")
async def get_recent_damage(days: int = Query(7, ge=1, le=60)):
    """Recent NWS-surveyed tornado damage tracks (and other DAT layers)."""
    cache_key = f"dat:{days}"
    if cache_key in _cache:
        return _cache[cache_key]

    # The DAT service's event_date field is a date/datetime field, not an
    # epoch-millisecond field. Query the current layer and apply a defensive
    # client-side date filter when the service returns that attribute.
    # NWS DAT feature service — Damage Lines layer (id 1)
    url = (
        "https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/"
        "DamageViewer/MapServer/1/query?where=1%3D1"
        "&outFields=*&outSR=4326&maxAllowableOffset=5000&resultRecordCount=5000&f=geojson"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            if r.status_code != 200:
                # Service is sometimes 503 between events; return empty rather than fail
                result = {"tracks": {"type": "FeatureCollection", "features": []}, "count": 0, "days": days}
                _cache[cache_key] = result
                return result
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NWS DAT unavailable: {e}")

    cutoff_seconds = time.time() - days * 86400
    feats = []
    for feature in data.get("features") or []:
        props = feature.get("properties") or {}
        raw_date = (
            props.get("event_date") or props.get("eventDate")
            or props.get("stormdate") or props.get("stormDate")
            or props.get("starttime") or props.get("startTime")
        )
        keep = True
        if isinstance(raw_date, (int, float)):
            value = raw_date / 1000 if raw_date > 10_000_000_000 else raw_date
            keep = value >= cutoff_seconds
        elif isinstance(raw_date, str):
            try:
                from datetime import datetime
                value = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).timestamp()
                keep = value >= cutoff_seconds
            except ValueError:
                pass
        if keep:
            feats.append(feature)
    data = {**data, "features": feats}
    result = {"tracks": data, "count": len(feats), "days": days}
    _cache[cache_key] = result
    return result
