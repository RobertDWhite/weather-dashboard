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
_local_alerts_cache: TTLCache = TTLCache(maxsize=32, ttl=60)

HEADERS = {
    "User-Agent": settings.nws_user_agent,
    "Accept": "application/geo+json",
}


async def _get_points(lat: float, lon: float) -> dict:
    key = f"{lat:.3f},{lon:.3f}"
    if key in _points_cache:
        return _points_cache[key]
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        r = await client.get(
            f"https://api.weather.gov/points/{lat},{lon}", headers=HEADERS
        )
        r.raise_for_status()
        data = r.json()
        _points_cache[key] = data
        return data


def _point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray-casting point-in-ring test for GeoJSON longitude/latitude pairs."""
    if len(ring) < 3:
        return False
    inside = False
    j = len(ring) - 1
    for i, point in enumerate(ring):
        if len(point) < 2 or len(ring[j]) < 2:
            j = i
            continue
        xi, yi = point[0], point[1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat):
            denominator = yj - yi
            if denominator and lon < (xj - xi) * (lat - yi) / denominator + xi:
                inside = not inside
        j = i
    return inside


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    lat1_r = radians(lat1)
    lat2_r = radians(lat2)
    h = sin(d_lat / 2) ** 2 + cos(lat1_r) * cos(lat2_r) * sin(d_lon / 2) ** 2
    return 3958.8 * 2 * asin(min(1, sqrt(h)))


def _geometry_is_local(geometry: dict | None, lat: float, lon: float, radius_miles: float) -> bool:
    if not geometry:
        return False
    rings: list[list[list[float]]] = []
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "Polygon" and isinstance(coords, list):
        rings = [coords[0]] if coords and isinstance(coords[0], list) else []
    elif kind == "MultiPolygon" and isinstance(coords, list):
        rings = [polygon[0] for polygon in coords if polygon and isinstance(polygon[0], list)]
    for ring in rings:
        if _point_in_ring(lon, lat, ring):
            return True
        if any(
            len(point) >= 2 and _haversine_miles(lat, lon, point[1], point[0]) <= radius_miles
            for point in ring
        ):
            return True
    return False


async def _local_alerts(data: dict, lat: float, lon: float, radius_miles: float) -> dict:
    """Filter an active-alert collection to the observer's local area.

    NWS polygons are used when present. Zone-only alerts are resolved through
    the cached zone endpoint so coastal and county alerts still work when NWS
    omits inline geometry.
    """
    cache_key = f"{lat:.3f},{lon:.3f},{radius_miles:.1f}"
    if cache_key in _local_alerts_cache:
        return _local_alerts_cache[cache_key]

    features = data.get("features") or []
    local_features = [
        feature for feature in features
        if _geometry_is_local(feature.get("geometry"), lat, lon, radius_miles)
    ]
    unresolved = [feature for feature in features if not feature.get("geometry")]
    zone_paths = {
        zone_path
        for feature in unresolved
        for zone in (feature.get("properties") or {}).get("affectedZones") or []
        if (zone_path := zone.split("/zones/", 1)[-1] if "/zones/" in zone else None)
    }

    if zone_paths:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            sem = asyncio.Semaphore(12)
            resolved = await asyncio.gather(*[
                _fetch_zone(client, sem, path) for path in list(zone_paths)[:400]
            ])
        local_zone_paths = {
            path for path, geometry in resolved
            if _geometry_is_local(geometry, lat, lon, radius_miles)
        }
        for feature in unresolved:
            zones = (feature.get("properties") or {}).get("affectedZones") or []
            if any(zone.split("/zones/", 1)[-1] in local_zone_paths for zone in zones if "/zones/" in zone):
                local_features.append(feature)

    result = {**data, "features": local_features, "local": True,
              "observer": {"lat": lat, "lon": lon, "radius_miles": radius_miles}}
    _local_alerts_cache[cache_key] = result
    return result


@router.get("/alerts")
async def get_alerts(
    dedupe: bool = True,
    local: bool = False,
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_miles: float = Query(75, ge=1, le=250),
):
    """Active NWS alerts. With dedupe=true (default), VTEC event-tracking
    numbers collapse NEW/CON/UPG sequences to a single entry per event."""
    from app.metrics import active_alerts, cache_hits, cache_misses, upstream_requests
    from app import vtec as vtec_mod

    cache_key = "data:dedupe" if dedupe else "data"
    if cache_key in _alerts_cache:
        cache_hits.labels(source="nws_alerts").inc()
        data = _alerts_cache[cache_key]
        if local:
            observer_lat = lat if lat is not None else settings.observer_lat
            observer_lon = lon if lon is not None else settings.observer_lon
            return await _local_alerts(data, observer_lat, observer_lon, radius_miles)
        return data
    cache_misses.labels(source="nws_alerts").inc()
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
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
            if local:
                observer_lat = lat if lat is not None else settings.observer_lat
                observer_lon = lon if lon is not None else settings.observer_lon
                return await _local_alerts(data, observer_lat, observer_lon, radius_miles)
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
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
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
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
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
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
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
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        results = await asyncio.gather(*[_fetch_zone(client, sem, zp) for zp in zone_paths])

    return {zp: geo for zp, geo in results if geo is not None}
