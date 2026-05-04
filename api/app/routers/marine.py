"""Marine: NDBC moored buoys + NOAA CO-OPS tide stations. Both free, no key."""
import re

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=32, ttl=600)


# Hand-curated subset of active NDBC moored stations near the US coast.
# (NDBC's full list is 250+; this seed covers the heavily-monitored basins
# meteorologists watch during hurricane season. Lat/lon from NDBC.)
NDBC_STATIONS: dict[str, tuple[float, float, str]] = {
    "41001": (34.7, -72.7, "150 NM East of Cape Hatteras NC"),
    "41002": (31.9, -74.9, "South Hatteras"),
    "41004": (32.5, -79.1, "Edisto SC"),
    "41008": (31.4, -80.9, "Grays Reef GA"),
    "41010": (28.9, -78.5, "Canaveral East"),
    "41013": (33.4, -77.7, "Frying Pan Shoals NC"),
    "41040": (14.5, -53.0, "NE Extension"),
    "42001": (25.9, -89.7, "Mid Gulf"),
    "42002": (26.0, -94.0, "West Gulf"),
    "42003": (25.9, -85.6, "East Gulf"),
    "42035": (29.2, -94.4, "Galveston TX"),
    "42036": (28.5, -84.5, "West Tampa"),
    "42040": (29.2, -88.2, "Mobile South"),
    "44008": (40.5, -69.2, "Nantucket"),
    "44011": (41.1, -66.6, "Georges Bank"),
    "44013": (42.4, -70.7, "Boston MA"),
    "44014": (36.6, -74.8, "Virginia Beach"),
    "44017": (40.7, -72.0, "Montauk Point"),
    "44025": (40.3, -73.2, "Long Island"),
    "44066": (39.6, -72.6, "Texas Tower"),
    "46006": (40.8, -137.4, "West California"),
    "46026": (37.8, -122.8, "San Francisco"),
    "46042": (36.8, -122.4, "Monterey"),
    "46050": (44.6, -124.5, "Stonewall Bank OR"),
    "46059": (38.0, -130.0, "West California offshore"),
}

# Subset of major CO-OPS tide stations. Full directory: 200+ stations.
COOPS_STATIONS: dict[str, tuple[float, float, str]] = {
    "9410230": (32.71, -117.17, "La Jolla CA"),
    "9414290": (37.81, -122.47, "San Francisco CA"),
    "9447130": (47.60, -122.34, "Seattle WA"),
    "8729840": (30.40, -87.21, "Pensacola FL"),
    "8771341": (29.48, -94.79, "Galveston Bay TX"),
    "8723214": (25.73, -80.16, "Virginia Key FL"),
    "8638610": (36.95, -76.33, "Sewells Point VA"),
    "8518750": (40.70, -74.01, "The Battery NY"),
    "8443970": (42.35, -71.05, "Boston MA"),
    "8665530": (32.78, -79.93, "Charleston SC"),
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt
    R = 6371.0088
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * R * asin(sqrt(a))


@router.get("/buoys")
async def get_buoys(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_km: float = Query(800, ge=10, le=5000),
):
    """Latest observations from NDBC moored buoys near a point."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"buoys:{lat:.2f}:{lon:.2f}:{int(radius_km)}"
    if cache_key in _cache:
        return _cache[cache_key]

    nearby = []
    for sid, (slat, slon, name) in NDBC_STATIONS.items():
        d = _haversine_km(lat, lon, slat, slon)
        if d <= radius_km:
            nearby.append((d, sid, slat, slon, name))
    nearby.sort()

    async def _fetch_buoy(sid: str) -> dict | None:
        url = f"https://www.ndbc.noaa.gov/data/realtime2/{sid}.txt"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers=_HEADERS)
                if r.status_code != 200:
                    return None
                # Skip the two-line header; first numeric row is the latest
                for line in r.text.splitlines():
                    if line.startswith("#"):
                        continue
                    parts = re.split(r"\s+", line.strip())
                    if len(parts) < 19:
                        continue
                    # Standard meteorological format columns:
                    # YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
                    def _f(v):
                        try:
                            return float(v) if v not in ("MM", "999.0", "999", "9999") else None
                        except ValueError:
                            return None
                    return {
                        "yy": parts[0], "mm": parts[1], "dd": parts[2], "hh": parts[3], "mn": parts[4],
                        "wind_dir_deg": _f(parts[5]),
                        "wind_speed_ms": _f(parts[6]),
                        "wind_gust_ms": _f(parts[7]),
                        "wave_height_m": _f(parts[8]),
                        "dom_period_s": _f(parts[9]),
                        "avg_period_s": _f(parts[10]),
                        "wave_dir_deg": _f(parts[11]),
                        "pressure_mbar": _f(parts[12]),
                        "air_temp_c": _f(parts[13]),
                        "water_temp_c": _f(parts[14]),
                        "dewpoint_c": _f(parts[15]),
                    }
        except Exception:
            return None

    import asyncio
    raw_obs = await asyncio.gather(*[_fetch_buoy(sid) for _, sid, _, _, _ in nearby])
    out = []
    for (d, sid, slat, slon, name), obs in zip(nearby, raw_obs):
        if obs is None:
            continue
        out.append({
            "station_id": sid,
            "name": name,
            "lat": slat,
            "lon": slon,
            "distance_km": round(d, 1),
            "obs": obs,
        })

    result = {"buoys": out, "count": len(out), "lat": lat, "lon": lon}
    _cache[cache_key] = result
    return result


@router.get("/tides")
async def get_tides(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_km: float = Query(400, ge=10, le=2000),
):
    """Latest CO-OPS tide gauge readings + 24h prediction."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"tides:{lat:.2f}:{lon:.2f}:{int(radius_km)}"
    if cache_key in _cache:
        return _cache[cache_key]

    nearby = []
    for sid, (slat, slon, name) in COOPS_STATIONS.items():
        d = _haversine_km(lat, lon, slat, slon)
        if d <= radius_km:
            nearby.append((d, sid, slat, slon, name))
    nearby.sort()

    async def _fetch_tide(sid: str) -> dict | None:
        url = (
            "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
            f"?product=water_level&application=WeatherDashboard&station={sid}"
            "&date=latest&datum=MLLW&units=english&time_zone=gmt&format=json"
        )
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers=_HEADERS)
                if r.status_code != 200:
                    return None
                data = r.json()
                d0 = (data.get("data") or [None])[0]
                if not d0:
                    return None
                return {
                    "time": d0.get("t"),
                    "value_ft": float(d0["v"]) if d0.get("v") else None,
                    "sigma": d0.get("s"),
                    "flags": d0.get("f"),
                }
        except Exception:
            return None

    import asyncio
    obs = await asyncio.gather(*[_fetch_tide(sid) for _, sid, _, _, _ in nearby])
    out = []
    for (d, sid, slat, slon, name), o in zip(nearby, obs):
        if o is None:
            continue
        out.append({
            "station_id": sid,
            "name": name,
            "lat": slat,
            "lon": slon,
            "distance_km": round(d, 1),
            "water_level": o,
        })

    result = {"tides": out, "count": len(out), "lat": lat, "lon": lon}
    _cache[cache_key] = result
    return result
