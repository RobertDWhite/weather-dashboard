"""AirNow AQI — current observations and forecasts. Free EPA API; key is
provisioned via the airnow_key setting."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=64, ttl=900)


# AQI category bands (per EPA)
def _category(aqi: int) -> dict:
    if aqi <= 50:
        return {"name": "Good", "color": "#00e400", "band": 1}
    if aqi <= 100:
        return {"name": "Moderate", "color": "#ffff00", "band": 2}
    if aqi <= 150:
        return {"name": "Unhealthy for Sensitive Groups", "color": "#ff7e00", "band": 3}
    if aqi <= 200:
        return {"name": "Unhealthy", "color": "#ff0000", "band": 4}
    if aqi <= 300:
        return {"name": "Very Unhealthy", "color": "#8f3f97", "band": 5}
    return {"name": "Hazardous", "color": "#7e0023", "band": 6}


@router.get("/current")
async def get_current(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    distance_mi: int = Query(50, ge=5, le=250),
):
    """Current AQI observations near a point."""
    if not settings.airnow_key:
        raise HTTPException(status_code=400, detail="AIRNOW_KEY not configured")

    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"now:{lat:.2f}:{lon:.2f}:{distance_mi}"
    if cache_key in _cache:
        return _cache[cache_key]

    url = (
        "https://www.airnowapi.org/aq/observation/latLong/current/"
        f"?format=application/json&latitude={lat}&longitude={lon}"
        f"&distance={distance_mi}&API_KEY={settings.airnow_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url)
            r.raise_for_status()
            raw = r.json() or []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AirNow unavailable: {e}")

    # Normalize records, attach category metadata, find dominant pollutant
    obs: list[dict] = []
    for o in raw:
        aqi = o.get("AQI")
        if aqi is None or aqi < 0:
            continue
        obs.append({
            "parameter": o.get("ParameterName"),
            "aqi": aqi,
            "category": _category(int(aqi)),
            "reporting_area": o.get("ReportingArea"),
            "state": o.get("StateCode"),
            "latitude": o.get("Latitude"),
            "longitude": o.get("Longitude"),
            "datetime_observed": f"{o.get('DateObserved', '').strip()} {o.get('HourObserved')}:00 {o.get('LocalTimeZone')}".strip(),
        })

    dominant = max(obs, key=lambda o: o["aqi"]) if obs else None
    result = {
        "lat": lat,
        "lon": lon,
        "observations": obs,
        "dominant": dominant,
        "count": len(obs),
    }
    _cache[cache_key] = result
    return result


@router.get("/forecast")
async def get_forecast(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    distance_mi: int = Query(50, ge=5, le=250),
):
    """AQI forecast near a point (next 1-2 days)."""
    if not settings.airnow_key:
        raise HTTPException(status_code=400, detail="AIRNOW_KEY not configured")

    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"fcst:{lat:.2f}:{lon:.2f}:{distance_mi}"
    if cache_key in _cache:
        return _cache[cache_key]

    url = (
        "https://www.airnowapi.org/aq/forecast/latLong/"
        f"?format=application/json&latitude={lat}&longitude={lon}"
        f"&distance={distance_mi}&API_KEY={settings.airnow_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url)
            r.raise_for_status()
            raw = r.json() or []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AirNow forecast unavailable: {e}")

    items: list[dict] = []
    for o in raw:
        aqi = o.get("AQI")
        if aqi is None or aqi < 0:
            continue
        items.append({
            "date": o.get("DateForecast", "").strip(),
            "parameter": o.get("ParameterName"),
            "aqi": aqi,
            "category": _category(int(aqi)),
            "reporting_area": o.get("ReportingArea"),
            "state": o.get("StateCode"),
            "discussion": o.get("Discussion"),
        })

    result = {
        "lat": lat,
        "lon": lon,
        "forecasts": items,
        "count": len(items),
    }
    _cache[cache_key] = result
    return result
