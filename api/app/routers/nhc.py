"""National Hurricane Center: active tropical systems with cone-of-uncertainty,
forecast track, and current position. Public NHC JSON + GIS GeoJSON; no auth."""
import asyncio

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()

_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}

_active_cache: TTLCache = TTLCache(maxsize=2, ttl=300)
_storm_cache: TTLCache = TTLCache(maxsize=64, ttl=300)


async def _fetch_json(client: httpx.AsyncClient, url: str):
    r = await client.get(url, headers=_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


async def _fetch_storm_geo(client: httpx.AsyncClient, storm: dict) -> dict:
    """Augment a storm record with cone + track + position GeoJSON if available."""
    sid = storm.get("id") or storm.get("binNumber") or storm.get("atcfId") or ""
    if sid in _storm_cache:
        return _storm_cache[sid]

    out: dict = {
        "id": sid,
        "binNumber": storm.get("binNumber"),
        "name": storm.get("name"),
        "classification": storm.get("classification"),
        "intensity": storm.get("intensity"),
        "pressure": storm.get("pressure"),
        "latitude": storm.get("latitudeNumeric"),
        "longitude": storm.get("longitudeNumeric"),
        "movement": storm.get("movement"),
        "lastUpdate": storm.get("lastUpdate"),
        "publicAdvisory": (storm.get("publicAdvisory") or {}).get("url"),
        "discussion": (storm.get("forecastDiscussion") or {}).get("url"),
        "windSpeed": storm.get("windSpeed"),
        "cone": None,
        "track": None,
        "position": None,
    }

    # NHC's per-advisory GeoJSON URL changes every advisory (no "_latest" alias),
    # so query NOAA's canonical ArcGIS tropical-cyclone services scoped to this
    # storm's ATCF id. These return GeoJSON FeatureCollections.
    atcf = (storm.get("atcfId") or storm.get("id") or "").upper()
    if not atcf:
        _storm_cache[sid] = out
        return out

    base = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer"
    # Layer 4: cone of uncertainty. Layer 5: forecast track line. Layer 6: position points.
    layers = (
        ("cone", 4),
        ("track", 5),
        ("position", 6),
    )
    for key, layer_id in layers:
        url = (
            f"{base}/{layer_id}/query"
            f"?where=STORMID%3D%27{atcf}%27&outFields=*&f=geojson"
        )
        try:
            r = await client.get(url, headers=_HEADERS, timeout=8)
            if r.status_code == 200:
                data = r.json()
                if (data or {}).get("features"):
                    out[key] = data
        except Exception:
            pass

    _storm_cache[sid] = out
    return out


@router.get("/two")
async def get_tropical_outlook():
    """NHC 7-day Tropical Weather Outlook — areas of interest with formation
    probabilities. Atlantic + East Pacific basins.

    Returns the parsed XML feed, plus a small structured list with disturbance
    IDs, formation probabilities, and (when available) GeoJSON polygons.
    """
    cache_key = "two"
    cached = _active_cache.get(cache_key)
    if cached is not None:
        return cached

    import re as _re

    async def _fetch_basin(client: httpx.AsyncClient, basin: str) -> list[dict]:
        # NHC ATCF/TWO XML feeds. AT = Atlantic, EP = East Pacific.
        url = f"https://www.nhc.noaa.gov/xml/TWO{basin}.xml"
        try:
            r = await client.get(url, headers=_HEADERS, timeout=12)
            if r.status_code != 200:
                return []
            xml = r.text
        except Exception:
            return []

        items: list[dict] = []
        for m in _re.finditer(r"<item>(.*?)</item>", xml, _re.DOTALL):
            block = m.group(1)
            def _x(tag: str) -> str:
                mm = _re.search(rf"<{tag}>(.*?)</{tag}>", block, _re.DOTALL)
                return (mm.group(1) if mm else "").strip()

            title = _x("title")
            desc = _x("description")
            link = _x("link")
            pub = _x("pubDate")

            # Description has "[2-day formation chance]: low/med/high (X%)" patterns
            two_day = None
            seven_day = None
            mt = _re.search(r"2-day[^:]*?:\s*(low|medium|high)\s*\((\d+%)\)", desc, _re.I)
            if mt:
                two_day = {"category": mt.group(1).lower(), "probability": mt.group(2)}
            mt = _re.search(r"7-day[^:]*?:\s*(low|medium|high)\s*\((\d+%)\)", desc, _re.I)
            if mt:
                seven_day = {"category": mt.group(1).lower(), "probability": mt.group(2)}

            items.append({
                "basin": basin,
                "title": title,
                "link": link,
                "pub_date": pub,
                "description": desc,
                "two_day": two_day,
                "seven_day": seven_day,
            })
        return items

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            basins = await asyncio.gather(
                _fetch_basin(client, "AT"),
                _fetch_basin(client, "EP"),
                return_exceptions=False,
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NHC TWO unavailable: {e}")

    result = {
        "atlantic": basins[0],
        "east_pacific": basins[1],
        "count": len(basins[0]) + len(basins[1]),
    }
    _active_cache[cache_key] = result
    return result


@router.get("/active")
async def get_active_storms():
    """Active Atlantic + East Pacific tropical systems with cone & track GeoJSON."""
    if "all" in _active_cache:
        return _active_cache["all"]
    try:
        async with httpx.AsyncClient() as client:
            data = await _fetch_json(client, "https://www.nhc.noaa.gov/CurrentStorms.json")
            storms = data.get("activeStorms") or []
            if not storms:
                result = {"storms": [], "fetched": data.get("dataLastUpdated")}
                _active_cache["all"] = result
                return result
            enriched = await asyncio.gather(
                *[_fetch_storm_geo(client, s) for s in storms],
                return_exceptions=True,
            )
            result = {
                "storms": [s for s in enriched if isinstance(s, dict)],
                "fetched": data.get("dataLastUpdated"),
            }
            _active_cache["all"] = result
            return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NHC unavailable: {e}")
