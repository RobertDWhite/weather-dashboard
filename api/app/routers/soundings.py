"""Forecast soundings (RAOB / model-derived). Returns the raw ROABS-formatted
text from rucsoundings.noaa.gov plus a parsed levels array suitable for
plotting a skew-T or hodograph in the UI."""
from typing import Iterable

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=32, ttl=1800)


def _parse_gsd(text: str) -> list[dict]:
    """Parse the GSD-format ASCII sounding into a list of pressure levels.
    Each line: TYPE PRESS HEIGHT TEMP DEWPT WIND_DIR WIND_KT
    (TYPE 4=mandatory, 5=significant, 6=wind, 9=surface)"""
    levels: list[dict] = []
    for raw in text.splitlines():
        parts = raw.split()
        if len(parts) < 7:
            continue
        try:
            ltype = int(parts[0])
            press = float(parts[1])
            height = float(parts[2])
            temp = float(parts[3])
            dewpt = float(parts[4])
            wdir = float(parts[5])
            wkt = float(parts[6])
        except ValueError:
            continue
        if ltype not in (4, 5, 6, 9):
            continue
        # Sentinel values: 99999 means missing (per GSD spec)
        def _ok(v: float) -> float | None:
            return None if v >= 9999 else v
        levels.append({
            "type": ltype,
            "pressure_hpa": _ok(press / 10.0),
            "height_m": _ok(height),
            "temp_c": _ok(temp / 10.0),
            "dewpoint_c": _ok(dewpt / 10.0),
            "wind_dir_deg": _ok(wdir),
            "wind_kt": _ok(wkt),
        })
    return levels


@router.get("/point")
async def get_sounding(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    model: str = Query("rap", pattern=r"^(rap|gfs|nam|raob)$"),
):
    """Latest model sounding (default RAP) at a point. RAOB returns the
    nearest observed sounding."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"{model}:{lat:.2f}:{lon:.2f}"
    if cache_key in _cache:
        return _cache[cache_key]

    # rucsoundings.noaa.gov text endpoint
    url = (
        "https://rucsoundings.noaa.gov/get_soundings.cgi"
        f"?data_source={model.upper()}&latest=latest&start_year=2026"
        f"&start_month_name=Jan&start_mday=1&start_hour=0&start_min=0"
        f"&n_hrs=1.0&fcst_len=shortest&airport={lat}%2C{lon}&text=Ascii%20text%20%28GSD%20format%29"
        f"&hydrometeors=false&start=latest"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=_HEADERS)
            text = r.text if r.status_code == 200 else ""
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"sounding unavailable: {e}")

    levels = _parse_gsd(text)
    result = {
        "model": model,
        "lat": lat,
        "lon": lon,
        "levels": levels,
        "raw_text": text[:6000],  # cap so API responses stay reasonable
    }
    _cache[cache_key] = result
    return result
