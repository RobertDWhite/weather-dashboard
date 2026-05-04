"""Aviation Weather Center products: TAFs, PIREPs, AIRMETs, SIGMETs,
G-AIRMETs, and Center Weather Advisories. Free at aviationweather.gov/api.

PIREPs in particular are operationally precious — pilots report turbulence,
icing, and convection sightings minutes before NWS warnings arrive.
"""
from math import asin, cos, radians, sin, sqrt

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=64, ttl=300)


def _haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    R = 6371.0088
    p1, p2 = radians(a_lat), radians(b_lat)
    dp = radians(b_lat - a_lat)
    dl = radians(b_lon - a_lon)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * R * asin(sqrt(a))


def _resolve(lat: float | None, lon: float | None) -> tuple[float, float]:
    return (
        lat if lat is not None else settings.observer_lat,
        lon if lon is not None else settings.observer_lon,
    )


@router.get("/tafs")
async def get_tafs(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_km: float = Query(300, ge=10, le=1000),
    limit: int = Query(20, ge=1, le=80),
):
    """Latest TAFs (terminal aerodrome forecasts) within radius_km of point."""
    lat, lon = _resolve(lat, lon)
    cache_key = f"taf:{lat:.2f}:{lon:.2f}:{int(radius_km)}:{limit}"
    if cache_key in _cache:
        return _cache[cache_key]

    pad = radius_km / 111.0
    bbox = f"{lat - pad:.3f},{lon - pad:.3f},{lat + pad:.3f},{lon + pad:.3f}"
    url = f"https://aviationweather.gov/api/data/taf?format=json&bbox={bbox}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            raw = r.json() if r.text else []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TAF unavailable: {e}")

    items = raw if isinstance(raw, list) else raw.get("data", [])
    out: list[dict] = []
    for t in items:
        try:
            slat = float(t.get("lat"))
            slon = float(t.get("lon"))
        except (TypeError, ValueError):
            continue
        d = _haversine_km(lat, lon, slat, slon)
        if d > radius_km:
            continue
        out.append({
            "icao": t.get("icaoId") or t.get("station_id"),
            "name": t.get("name"),
            "lat": slat,
            "lon": slon,
            "distance_km": round(d, 1),
            "issue_time": t.get("issueTime"),
            "valid_from": t.get("validTimeFrom"),
            "valid_to": t.get("validTimeTo"),
            "raw_taf": t.get("rawTAF") or t.get("rawOb"),
            "remarks": t.get("remarks"),
        })
    out.sort(key=lambda x: x["distance_km"])
    out = out[:limit]
    result = {"tafs": out, "count": len(out), "lat": lat, "lon": lon}
    _cache[cache_key] = result
    return result


@router.get("/pireps")
async def get_pireps(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_km: float = Query(500, ge=10, le=2000),
    age_min: int = Query(120, ge=10, le=720),
):
    """Recent pilot reports — turbulence, icing, severe convection sightings.
    Often arrive before NWS warnings are issued."""
    lat, lon = _resolve(lat, lon)
    cache_key = f"pirep:{lat:.2f}:{lon:.2f}:{int(radius_km)}:{age_min}"
    if cache_key in _cache:
        return _cache[cache_key]

    pad = radius_km / 111.0
    bbox = f"{lat - pad:.3f},{lon - pad:.3f},{lat + pad:.3f},{lon + pad:.3f}"
    url = (
        "https://aviationweather.gov/api/data/pirep"
        f"?format=json&bbox={bbox}&age={age_min // 60 if age_min >= 60 else 1}"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            raw = r.json() if r.text else []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PIREP unavailable: {e}")

    items = raw if isinstance(raw, list) else raw.get("data", [])
    out: list[dict] = []
    for p in items:
        try:
            plat = float(p.get("lat"))
            plon = float(p.get("lon"))
        except (TypeError, ValueError):
            continue
        out.append({
            "lat": plat,
            "lon": plon,
            "obs_time": p.get("obsTime") or p.get("receiptTime"),
            "aircraft_type": p.get("acType"),
            "altitude_ft": p.get("altitudeFtMsl"),
            "report_type": p.get("reportType"),  # PIREP / AIREP / UA
            "turbulence": p.get("turbulence"),
            "icing": p.get("icing"),
            "wx_string": p.get("wxString"),
            "raw_text": p.get("rawOb") or p.get("rawText"),
        })
    result = {"pireps": out, "count": len(out), "lat": lat, "lon": lon}
    _cache[cache_key] = result
    return result


@router.get("/airmets")
async def get_airmets():
    """Active AIRMETs (Airmen's Meteorological Information) — IFR, mountain
    obscuration, turbulence, icing, surface winds."""
    cache_key = "airmets"
    if cache_key in _cache:
        return _cache[cache_key]
    url = "https://aviationweather.gov/api/data/airmet?format=json"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            raw = r.json() if r.text else []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AIRMET unavailable: {e}")
    result = {"airmets": raw if isinstance(raw, list) else raw.get("data", []), "count": len(raw) if isinstance(raw, list) else 0}
    _cache[cache_key] = result
    return result


@router.get("/sigmets")
async def get_sigmets():
    """Active SIGMETs — significant meteorological hazards for aviation
    (severe convection, severe icing, severe turbulence, dust storm)."""
    cache_key = "sigmets"
    if cache_key in _cache:
        return _cache[cache_key]
    url = "https://aviationweather.gov/api/data/airsigmet?format=json"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            raw = r.json() if r.text else []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"SIGMET unavailable: {e}")
    items = raw if isinstance(raw, list) else raw.get("data", [])
    # Filter to SIGMETs only (the airsigmet endpoint returns both)
    sigmets = [s for s in items if (s.get("airSigmetType") or "").upper().startswith("SIGMET")]
    result = {"sigmets": sigmets, "count": len(sigmets)}
    _cache[cache_key] = result
    return result


@router.get("/cwa")
async def get_cwa():
    """Active Center Weather Advisories from CWSUs (Center Weather Service Units)."""
    cache_key = "cwa"
    if cache_key in _cache:
        return _cache[cache_key]
    url = "https://aviationweather.gov/api/data/cwa?format=json"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            if r.status_code != 200:
                result = {"cwa": [], "count": 0}
                _cache[cache_key] = result
                return result
            raw = r.json() if r.text else []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"CWA unavailable: {e}")
    items = raw if isinstance(raw, list) else raw.get("data", [])
    result = {"cwa": items, "count": len(items)}
    _cache[cache_key] = result
    return result
