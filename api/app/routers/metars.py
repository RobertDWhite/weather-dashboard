"""METAR mesh: many surface observations across a region for a station-model
overlay (think mesoanalysis-style surface obs). Uses the AviationWeather.gov
public API which serves METAR data without auth."""
from math import asin, cos, radians, sin, sqrt

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()

_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=64, ttl=300)


def _epoch_to_iso(v) -> str | None:
    """Coerce AWC obsTime (epoch seconds, possibly stringified) to ISO."""
    if v is None:
        return None
    try:
        if isinstance(v, str):
            v = float(v)
        from datetime import datetime, timezone
        return datetime.fromtimestamp(float(v), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0088
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * R * asin(sqrt(a))


def _flight_category(m: dict) -> str:
    """VFR / MVFR / IFR / LIFR from ceiling + visibility."""
    vis = m.get("visib")
    try:
        vis_mi = float(vis) if vis is not None else 99
    except (ValueError, TypeError):
        vis_mi = 99
    ceiling = None
    for layer in (m.get("clouds") or []):
        if (layer or {}).get("cover") in ("BKN", "OVC", "OVX"):
            base = (layer or {}).get("base")
            if base is not None and (ceiling is None or base < ceiling):
                ceiling = base
    if ceiling is None:
        ceiling = 9999
    if ceiling < 500 or vis_mi < 1:
        return "LIFR"
    if ceiling < 1000 or vis_mi < 3:
        return "IFR"
    if ceiling <= 3000 or vis_mi <= 5:
        return "MVFR"
    return "VFR"


@router.get("/mesh")
async def get_metar_mesh(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_km: float = Query(400, ge=10, le=1500),
    limit: int = Query(120, ge=5, le=400),
):
    """Latest METARs from stations within a radius. Returns parsed observations
    plus a flight category for each station."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"{lat:.2f}:{lon:.2f}:{int(radius_km)}:{limit}"
    if cache_key in _cache:
        return _cache[cache_key]

    # AviationWeather Center bbox order is lat1,lon1,lat2,lon2 (minLat,minLon,maxLat,maxLon).
    pad_deg = radius_km / 111.0
    bbox = (
        f"{lat - pad_deg:.3f},{lon - pad_deg:.3f},"
        f"{lat + pad_deg:.3f},{lon + pad_deg:.3f}"
    )
    url = (
        "https://aviationweather.gov/api/data/metar"
        f"?format=json&bbox={bbox}&hours=2"
    )

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            raw = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"METAR mesh unavailable: {e}")

    # AWC may return a list of dicts directly; defensive handling for variants.
    items = raw if isinstance(raw, list) else raw.get("data", [])

    # Keep newest observation per station, filter by exact radius
    by_station: dict[str, dict] = {}
    for m in items:
        sid = m.get("icaoId") or m.get("station_id")
        if not sid:
            continue
        try:
            slat = float(m.get("lat"))
            slon = float(m.get("lon"))
        except (ValueError, TypeError):
            continue
        d = _haversine_km(lat, lon, slat, slon)
        if d > radius_km:
            continue
        # AWC obsTime is epoch seconds (numeric). Coerce to int defensively.
        try:
            rec_time = int(m.get("obsTime") or m.get("obs_time") or 0)
        except (TypeError, ValueError):
            rec_time = 0
        prev = by_station.get(sid)
        if prev and (prev.get("_obs_time") or 0) >= rec_time:
            continue
        # AWC fields can occasionally arrive as strings — coerce defensively
        def _num(v):
            if v is None:
                return None
            if isinstance(v, (int, float)):
                return v
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        tmpc = _num(m.get("temp"))
        dewc = _num(m.get("dewp"))
        wspd = _num(m.get("wspd"))
        wgst = _num(m.get("wgst"))
        wdir = _num(m.get("wdir"))
        altim = _num(m.get("altim"))  # hPa
        vis = m.get("visib")
        try:
            vis_mi = float(vis) if vis is not None else None
        except (ValueError, TypeError):
            vis_mi = None
        by_station[sid] = {
            "_obs_time": rec_time,
            "station_id": sid,
            "name": m.get("name"),
            "lat": slat,
            "lon": slon,
            "distance_km": round(d, 1),
            # obsTime may be epoch seconds (most common) or ISO; emit ISO for the UI
            "obs_time": _epoch_to_iso(m.get("obsTime")) or m.get("reportTime"),
            "temp_c": tmpc,
            "temp_f": round(tmpc * 9 / 5 + 32, 1) if tmpc is not None else None,
            "dewpoint_c": dewc,
            "dewpoint_f": round(dewc * 9 / 5 + 32, 1) if dewc is not None else None,
            "wind_dir_deg": int(wdir) if wdir is not None else None,
            "wind_speed_kt": int(wspd) if wspd is not None else None,
            "wind_gust_kt": int(wgst) if wgst is not None else None,
            "visibility_mi": vis_mi,
            "altimeter_hpa": altim,
            "wx_string": m.get("wxString"),
            "raw_metar": m.get("rawOb"),
            "flight_category": _flight_category(m),
        }

    metars = sorted(by_station.values(), key=lambda x: x["distance_km"])[:limit]
    for m in metars:
        m.pop("_obs_time", None)

    result = {
        "metars": metars,
        "count": len(metars),
        "lat": lat,
        "lon": lon,
        "radius_km": radius_km,
    }
    _cache[cache_key] = result
    return result
