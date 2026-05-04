import asyncio
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()

_points_cache: TTLCache = TTLCache(maxsize=200, ttl=3600)
_alerts_cache: TTLCache = TTLCache(maxsize=5, ttl=60)
_forecast_cache: TTLCache = TTLCache(maxsize=200, ttl=900)
_hourly_cache: TTLCache = TTLCache(maxsize=200, ttl=900)
_obs_cache: TTLCache = TTLCache(maxsize=200, ttl=300)
_zone_cache: TTLCache = TTLCache(maxsize=4000, ttl=86400)  # zones rarely change

HEADERS = {
    "User-Agent": settings.nws_user_agent,
    "Accept": "application/geo+json",
}


async def _get_points(lat: float, lon: float) -> dict:
    key = f"{lat:.3f},{lon:.3f}"
    if key in _points_cache:
        return _points_cache[key]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"https://api.weather.gov/points/{lat},{lon}", headers=HEADERS
        )
        r.raise_for_status()
        data = r.json()
        _points_cache[key] = data
        return data


@router.get("/alerts")
async def get_alerts(dedupe: bool = True):
    """Active NWS alerts. With dedupe=true (default), VTEC event-tracking
    numbers collapse NEW/CON/UPG sequences to a single entry per event."""
    from app.metrics import active_alerts, cache_hits, cache_misses, upstream_requests
    from app import vtec as vtec_mod

    cache_key = "data:dedupe" if dedupe else "data"
    if cache_key in _alerts_cache:
        cache_hits.labels(source="nws_alerts").inc()
        return _alerts_cache[cache_key]
    cache_misses.labels(source="nws_alerts").inc()
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://api.weather.gov/alerts/active",
                params={"status": "actual", "message_type": "alert"},
                headers=HEADERS,
            )
            r.raise_for_status()
            data = r.json()

            # VTEC dedup: collapse NEW/CON/UPG of the same event into one entry
            features = data.get("features") or []
            if dedupe:
                features = vtec_mod.dedupe(features)
                data = {**data, "features": features}

            _alerts_cache[cache_key] = data

            counts: dict[str, int] = {}
            for f in features:
                sev = (f.get("properties") or {}).get("severity") or "Unknown"
                counts[sev] = counts.get(sev, 0) + 1
            for sev in ("Extreme", "Severe", "Moderate", "Minor", "Unknown"):
                active_alerts.labels(severity=sev).set(counts.get(sev, 0))
            upstream_requests.labels(source="nws_alerts", outcome="ok").inc()
            return data
        except Exception as e:
            upstream_requests.labels(source="nws_alerts", outcome="error").inc()
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/forecast")
async def get_forecast(lat: float = None, lon: float = None):
    lat = lat or settings.observer_lat
    lon = lon or settings.observer_lon
    key = f"{lat:.3f},{lon:.3f}"
    if key in _forecast_cache:
        return _forecast_cache[key]
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            points = await _get_points(lat, lon)
            p = points["properties"]
            r = await client.get(p["forecast"], headers=HEADERS)
            r.raise_for_status()
            result = {
                "wfo": p["cwa"],
                "timezone": p["timeZone"],
                "periods": r.json()["properties"]["periods"],
            }
            _forecast_cache[key] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/hourly")
async def get_hourly(lat: float = None, lon: float = None):
    lat = lat or settings.observer_lat
    lon = lon or settings.observer_lon
    key = f"{lat:.3f},{lon:.3f}"
    if key in _hourly_cache:
        return _hourly_cache[key]
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            points = await _get_points(lat, lon)
            r = await client.get(
                points["properties"]["forecastHourly"], headers=HEADERS
            )
            r.raise_for_status()
            result = {"periods": r.json()["properties"]["periods"][:48]}
            _hourly_cache[key] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/observation")
async def get_observation(lat: float = None, lon: float = None):
    lat = lat or settings.observer_lat
    lon = lon or settings.observer_lon
    key = f"{lat:.3f},{lon:.3f}"
    if key in _obs_cache:
        return _obs_cache[key]
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            points = await _get_points(lat, lon)
            r = await client.get(
                points["properties"]["observationStations"], headers=HEADERS
            )
            r.raise_for_status()
            stations = r.json()["features"]
            if not stations:
                raise HTTPException(status_code=404, detail="No stations found")

            sid = stations[0]["properties"]["stationIdentifier"]
            sname = stations[0]["properties"]["name"]
            r2 = await client.get(
                f"https://api.weather.gov/stations/{sid}/observations/latest",
                headers=HEADERS,
            )
            r2.raise_for_status()
            result = {
                "stationId": sid,
                "stationName": sname,
                "observation": r2.json()["properties"],
            }
            _obs_cache[key] = result
            return result
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


async def _fetch_zone(client: httpx.AsyncClient, sem: asyncio.Semaphore, zone_path: str) -> tuple[str, dict | None]:
    """Fetch a single zone geometry, returning (zone_path, geometry_or_None)."""
    if zone_path in _zone_cache:
        return zone_path, _zone_cache[zone_path]
    async with sem:
        try:
            r = await client.get(
                f"https://api.weather.gov/zones/{zone_path}",
                headers=HEADERS,
                timeout=10,
            )
            if r.status_code != 200:
                return zone_path, None
            geo = r.json().get("geometry")
            _zone_cache[zone_path] = geo
            return zone_path, geo
        except Exception:
            return zone_path, None


@router.get("/hourly-graph")
async def get_hourly_graph(lat: float | None = None, lon: float | None = None):
    """NWS Hourly Weather Graph image URL for a point. Returns the canonical
    image URL pointing at forecast.weather.gov; the UI <img> loads it directly
    (graphic.weather.gov honors browser image requests with no CORS issue)."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    return {
        "lat": lat,
        "lon": lon,
        "image_url": (
            "https://forecast.weather.gov/meteograms/Plotter.php"
            f"?lat={lat:.4f}&lon={lon:.4f}&wfo=&zcode=&gset=20&gdiff=10&unit=0&tinfo=PY8&ahour=0"
            "&pcmd=11011111111110100000000000000000000000000000000000000000000&lg=en&indu=1!1!1!&dd=&bw="
            "&hrspan=48&pqpfhr=6&psnwhr=6"
        ),
    }


@router.get("/zone-geometries")
async def get_zone_geometries(ids: str = Query(..., description="Comma-separated list of zone paths, e.g. forecast/OHZ055,county/OHC001")):
    """
    Resolve zone geometries for alerts that lack polygon geometry.
    Returns {zone_path: geometry} for each requested zone.
    Cached 24h — zone boundaries rarely change.
    """
    zone_paths = [z.strip() for z in ids.split(",") if z.strip()]
    if not zone_paths:
        return {}

    # Limit blast radius: cap at 200 unique zones per request
    zone_paths = zone_paths[:200]

    sem = asyncio.Semaphore(10)  # max 10 concurrent NWS requests
    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[_fetch_zone(client, sem, zp) for zp in zone_paths])

    return {zp: geo for zp, geo in results if geo is not None}
