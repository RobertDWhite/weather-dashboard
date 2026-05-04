"""Single-site NEXRAD radar — base reflectivity, base velocity, ZDR, CC etc.
sourced from Iowa Environmental Mesonet's RIDGE PNG tile service.

This complements the RainViewer composite radar by giving you the products
meteorologists actually use during severe weather: hook echoes (Z), couplets
(V), debris balls (ZDR + CC).
"""
from math import asin, cos, radians, sin, sqrt

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_meta_cache: TTLCache = TTLCache(maxsize=8, ttl=120)

# WSR-88D site catalog — abbreviated (Eastern + Central US, the most-watched
# sites for severe weather). Ryan-Hall-grade coverage doesn't need every site
# in Alaska/Hawaii. Each entry: ID -> (lat, lon, name).
SITES: dict[str, tuple[float, float, str]] = {
    # Ohio / Indiana / Kentucky
    "KILN": (39.42, -83.82, "Cincinnati / Wilmington OH"),
    "KCLE": (41.41, -81.86, "Cleveland OH"),
    "KIWX": (41.36, -85.70, "Northern Indiana"),
    "KILX": (40.15, -89.34, "Lincoln IL"),
    "KLOT": (41.60, -88.08, "Chicago IL"),
    "KIND": (39.71, -86.28, "Indianapolis IN"),
    "KLVX": (37.98, -85.94, "Louisville KY"),
    "KPAH": (37.07, -88.77, "Paducah KY"),
    "KJKL": (37.59, -83.31, "Jackson KY"),
    # Plains / Tornado Alley
    "KTLX": (35.33, -97.28, "Oklahoma City OK"),
    "KFDR": (34.36, -98.98, "Frederick OK"),
    "KINX": (36.18, -95.56, "Tulsa OK"),
    "KICT": (37.65, -97.44, "Wichita KS"),
    "KDDC": (37.76, -99.97, "Dodge City KS"),
    "KTOP": (39.00, -95.63, "Topeka KS"),
    "KEAX": (38.81, -94.26, "Kansas City MO"),
    "KSGF": (37.24, -93.40, "Springfield MO"),
    "KLSX": (38.70, -90.68, "St Louis MO"),
    "KFWS": (32.57, -97.30, "Dallas/Fort Worth TX"),
    "KDYX": (32.54, -99.25, "Dyess TX"),
    "KSJT": (31.37, -100.49, "San Angelo TX"),
    "KFDX": (34.64, -103.62, "Cannon AFB NM"),
    "KAMA": (35.23, -101.71, "Amarillo TX"),
    "KLBB": (33.65, -101.81, "Lubbock TX"),
    # Southeast / Dixie Alley
    "KMOB": (30.68, -88.24, "Mobile AL"),
    "KBMX": (33.17, -86.77, "Birmingham AL"),
    "KHTX": (34.93, -86.08, "Hytop AL"),
    "KMXX": (32.54, -85.79, "Maxwell AL"),
    "KGWX": (33.90, -88.33, "Columbus AFB MS"),
    "KDGX": (32.28, -89.98, "Jackson MS"),
    "KMRX": (36.17, -83.40, "Knoxville TN"),
    "KOHX": (36.25, -86.56, "Nashville TN"),
    "KNQA": (35.34, -89.87, "Memphis TN"),
    "KGSP": (34.88, -82.22, "Greer SC"),
    "KCAE": (33.95, -81.12, "Columbia SC"),
    "KFFC": (33.36, -84.57, "Atlanta GA"),
    "KJGX": (32.68, -83.35, "Robins AFB GA"),
    # Upper Midwest / Northeast
    "KDTX": (42.70, -83.47, "Detroit MI"),
    "KGRR": (42.89, -85.55, "Grand Rapids MI"),
    "KMQT": (46.53, -87.55, "Marquette MI"),
    "KMKX": (42.97, -88.55, "Milwaukee WI"),
    "KGRB": (44.50, -88.11, "Green Bay WI"),
    "KARX": (43.82, -91.19, "La Crosse WI"),
    "KMPX": (44.85, -93.57, "Minneapolis MN"),
    "KDMX": (41.73, -93.72, "Des Moines IA"),
    "KDVN": (41.61, -90.58, "Davenport IA"),
    "KBUF": (42.95, -78.74, "Buffalo NY"),
    "KBGM": (42.20, -75.98, "Binghamton NY"),
    "KOKX": (40.86, -72.86, "New York City NY"),
    "KBOX": (41.96, -71.14, "Boston MA"),
    "KDIX": (39.95, -74.41, "Philadelphia PA"),
    "KCCX": (40.92, -78.00, "State College PA"),
    "KLWX": (38.97, -77.48, "Sterling VA / DC"),
    "KAKQ": (36.98, -77.01, "Wakefield VA"),
    "KRAX": (35.66, -78.49, "Raleigh NC"),
    "KMHX": (34.78, -76.88, "Morehead City NC"),
    # Florida / Gulf
    "KMLB": (28.11, -80.65, "Melbourne FL"),
    "KTBW": (27.71, -82.40, "Tampa FL"),
    "KAMX": (25.61, -80.41, "Miami FL"),
    "KJAX": (30.48, -81.70, "Jacksonville FL"),
    "KEVX": (30.56, -85.92, "Eglin AFB FL"),
    "KLIX": (30.34, -89.83, "New Orleans LA"),
    "KLCH": (30.13, -93.22, "Lake Charles LA"),
    "KSHV": (32.45, -93.84, "Shreveport LA"),
    "KHGX": (29.47, -95.08, "Houston TX"),
    "KCRP": (27.78, -97.51, "Corpus Christi TX"),
    "KBRO": (25.92, -97.42, "Brownsville TX"),
}

# RIDGE products. NIDS code → (label, group). Frontend renders these as a
# dropdown grouped by category.
PRODUCTS: dict[str, tuple[str, str]] = {
    "N0Q": ("Base Reflectivity (0.5°)", "Reflectivity"),
    "N0R": ("Base Reflectivity Legacy", "Reflectivity"),
    "NCR": ("Composite Reflectivity", "Reflectivity"),
    "N0U": ("Base Velocity (0.5°)", "Velocity"),
    "N0V": ("Base Velocity Legacy", "Velocity"),
    "N0X": ("Differential Reflectivity (ZDR)", "Dual-Pol"),
    "N0C": ("Correlation Coefficient (CC)", "Dual-Pol"),
    "N0K": ("Specific Differential Phase (KDP)", "Dual-Pol"),
    "N0H": ("Hydrometeor Classification", "Dual-Pol"),
    "N1P": ("1-Hour Precip", "Precip"),
    "NTP": ("Storm Total Precip", "Precip"),
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0088
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * R * asin(sqrt(a))


@router.get("/sites")
async def get_sites(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
):
    """List of WSR-88D radar sites, with distance from a point if lat/lon given.
    Returned sorted by distance ascending (or alphabetically if no point)."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon

    rows: list[dict] = []
    for sid, (slat, slon, name) in SITES.items():
        rows.append({
            "id": sid,
            "name": name,
            "lat": slat,
            "lon": slon,
            "distance_km": round(_haversine_km(lat, lon, slat, slon), 1),
        })
    rows.sort(key=lambda r: r["distance_km"])
    return {
        "sites": rows,
        "products": [{"code": k, "label": v[0], "group": v[1]} for k, v in PRODUCTS.items()],
    }


@router.get("/timestamp")
async def get_radar_timestamp(
    site: str = Query(..., min_length=4, max_length=4),
    product: str = Query("N0Q"),
):
    """Latest tile timestamp for a site/product pair. Used by the UI to
    cache-bust the tile URL when fresh data lands."""
    site = site.upper()
    product = product.upper()
    if site not in SITES:
        raise HTTPException(status_code=404, detail=f"unknown site {site}")
    if product not in PRODUCTS:
        raise HTTPException(status_code=404, detail=f"unknown product {product}")

    cache_key = f"{site}:{product}"
    if cache_key in _meta_cache:
        return _meta_cache[cache_key]

    # IEM publishes a JSON sidecar with the worldfile + timestamp for each tile
    url = f"https://mesonet.agron.iastate.edu/data/gis/images/4326/ridge/{site}/{product}_0.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers=_HEADERS)
            if r.status_code == 200:
                meta = r.json()
            else:
                meta = {}
    except Exception:
        meta = {}

    # IEM tile URL pattern (used by the frontend; documented on mesonet)
    tile_template = (
        "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/"
        f"ridge::{site}-{product}-0/{{z}}/{{x}}/{{y}}.png"
    )
    result = {
        "site": site,
        "product": product,
        "tile_template": tile_template,
        "valid": meta.get("valid") or meta.get("model_init"),
        "metadata": meta,
    }
    _meta_cache[cache_key] = result
    return result
