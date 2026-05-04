"""NWS Local Storm Reports (LSRs) — fresh spotter reports flowing in during
severe weather, sourced from Iowa Environmental Mesonet's GeoJSON feed.

Distinct from SPC's `/spc/reports` aggregator which lags 30-60 min and is
recapitulated daily."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=8, ttl=60)

# Map raw IEM LSR types to dashboard categories. Keep the original `type`
# string available for display so chasers can see "TORNADO" vs "FUNNEL CLOUD".
_TYPE_CATEGORY: dict[str, str] = {
    "TORNADO": "tornado",
    "FUNNEL CLOUD": "tornado",
    "WATERSPOUT": "tornado",
    "HAIL": "hail",
    "TSTM WND DMG": "wind",
    "TSTM WND GST": "wind",
    "NON-TSTM WND DMG": "wind",
    "NON-TSTM WND GST": "wind",
    "HIGH SUST WINDS": "wind",
    "FLASH FLOOD": "flood",
    "FLOOD": "flood",
    "HEAVY RAIN": "flood",
    "DEBRIS FLOW": "flood",
    "LIGHTNING": "lightning",
    "SNOW": "winter",
    "HEAVY SNOW": "winter",
    "FREEZING RAIN": "winter",
    "SLEET": "winter",
    "BLIZZARD": "winter",
    "ICE STORM": "winter",
    "AVALANCHE": "winter",
    "DUST STORM": "other",
    "WILDFIRE": "fire",
    "DENSE FOG": "other",
}


@router.get("/recent")
async def get_recent_lsrs(
    hours: int = Query(2, ge=1, le=24),
):
    """Return GeoJSON FeatureCollection of LSRs from the last N hours,
    plus a flat parsed list with category buckets for the UI panel."""
    cache_key = f"hours:{hours}"
    if cache_key in _cache:
        return _cache[cache_key]

    url = f"https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours={hours}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IEM LSRs unavailable: {e}")

    features = data.get("features") or []
    flat: list[dict] = []
    by_category: dict[str, int] = {
        "tornado": 0, "hail": 0, "wind": 0, "flood": 0, "lightning": 0,
        "winter": 0, "fire": 0, "other": 0,
    }
    for f in features:
        props = (f.get("properties") or {})
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or [None, None]
        lon, lat = coords[0], coords[1]
        if lat is None or lon is None:
            continue
        type_raw = (props.get("type") or "").upper()
        cat = _TYPE_CATEGORY.get(type_raw, "other")
        by_category[cat] = by_category.get(cat, 0) + 1
        flat.append({
            "valid": props.get("valid"),
            "type": type_raw,
            "category": cat,
            "magnitude": props.get("magnitude"),
            "city": props.get("city"),
            "county": props.get("county"),
            "state": props.get("st") or props.get("state"),
            "wfo": props.get("wfo"),
            "source": props.get("source"),
            "remark": props.get("remark"),
            "lat": lat,
            "lon": lon,
        })

    # Newest first
    flat.sort(key=lambda r: r.get("valid") or "", reverse=True)

    result = {
        "geojson": data,
        "items": flat,
        "by_category": by_category,
        "count": len(flat),
        "hours": hours,
    }
    _cache[cache_key] = result

    # Update active_lsrs gauge per category for Grafana
    try:
        from app.metrics import active_lsrs
        for cat, n in by_category.items():
            active_lsrs.labels(category=cat).set(n)
    except Exception:
        pass

    return result
