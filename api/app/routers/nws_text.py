"""NWS / SPC text products: Area Forecast Discussion (AFD), Hazardous Weather
Outlook (HWO), and SPC convective outlook day-1 discussion. These are the
narrative products meteorologists read first to understand what's expected."""
import re
import time as _time

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()

_HEADERS = {
    "User-Agent": settings.nws_user_agent,
    "Accept": "application/geo+json, application/json, text/plain",
}

# Cache keyed by (product, location_key); TTL 30 min
_text_cache: TTLCache = TTLCache(maxsize=100, ttl=1800)


async def _wfo_for_point(client: httpx.AsyncClient, lat: float, lon: float) -> str:
    """Resolve home point to its NWS WFO 3-letter code (e.g. ILN, CLE)."""
    r = await client.get(f"https://api.weather.gov/points/{lat:.4f},{lon:.4f}", headers=_HEADERS, timeout=12)
    r.raise_for_status()
    return ((r.json() or {}).get("properties") or {}).get("cwa") or ""


async def _latest_text_product(client: httpx.AsyncClient, product: str, wfo: str) -> dict:
    """Fetch the latest issuance of a text product type for a WFO.

    NWS API: /products/types/{product}/locations/{wfo} → list of recent issuances
    Then /products/{id} → text body.
    """
    list_url = f"https://api.weather.gov/products/types/{product}/locations/{wfo}"
    r = await client.get(list_url, headers=_HEADERS, timeout=12)
    if r.status_code != 200:
        return {}
    items = (r.json() or {}).get("@graph") or []
    if not items:
        return {}
    latest = items[0]
    pid = latest.get("@id") or ""
    if not pid:
        return {}
    rr = await client.get(pid, headers=_HEADERS, timeout=12)
    if rr.status_code != 200:
        return {}
    body = (rr.json() or {}).get("productText") or ""
    return {
        "id": latest.get("id") or "",
        "wfo": wfo,
        "product": product,
        "issued": latest.get("issuanceTime"),
        "text": body,
    }


def _strip_text_product(raw: str) -> str:
    """Strip teletype headers / line padding from the raw NWS text product."""
    if not raw:
        return ""
    # Remove the 3-line WMO header and AWIPS ID block at the top
    lines = raw.split("\n")
    # Find first content line — usually after the dateline like "245 PM EDT TUE…"
    skip = 0
    for i, ln in enumerate(lines[:25]):
        if re.match(r"^\d{3,4}\s+(AM|PM)\s+[A-Z]{2,4}", ln.strip()):
            skip = i + 2  # skip the dateline + the blank line that often follows
            break
    return "\n".join(lines[skip:]).strip()


@router.get("/afd")
async def get_afd(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
):
    """Latest Area Forecast Discussion for the WFO covering the given point."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"afd:{lat:.2f}:{lon:.2f}"
    cached = _text_cache.get(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            wfo = await _wfo_for_point(client, lat, lon)
            if not wfo:
                raise HTTPException(status_code=502, detail="couldn't resolve WFO for point")
            data = await _latest_text_product(client, "AFD", wfo)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"AFD fetch failed: {e}")

    result = {
        **data,
        "stripped_text": _strip_text_product(data.get("text", "")),
        "fetched_at": _time.time(),
    }
    _text_cache[cache_key] = result
    return result


@router.get("/hwo")
async def get_hwo(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
):
    """Latest Hazardous Weather Outlook — the WFO's plain-English summary of
    threats over the next 7 days."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"hwo:{lat:.2f}:{lon:.2f}"
    cached = _text_cache.get(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            wfo = await _wfo_for_point(client, lat, lon)
            if not wfo:
                raise HTTPException(status_code=502, detail="couldn't resolve WFO for point")
            data = await _latest_text_product(client, "HWO", wfo)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"HWO fetch failed: {e}")

    result = {
        **data,
        "stripped_text": _strip_text_product(data.get("text", "")),
        "fetched_at": _time.time(),
    }
    _text_cache[cache_key] = result
    return result


@router.get("/spc-discussion")
async def get_spc_discussion():
    """Latest SPC Day 1 Convective Outlook narrative discussion."""
    cache_key = "spc:swody1"
    cached = _text_cache.get(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            r = await client.get(
                "https://www.spc.noaa.gov/products/outlook/day1otlk.txt",
                headers=_HEADERS,
                timeout=12,
            )
            text = r.text if r.status_code == 200 else ""
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"SPC discussion fetch failed: {e}")

    result = {
        "id": "swody1",
        "product": "SWODY1",
        "text": text,
        "stripped_text": _strip_text_product(text),
        "fetched_at": _time.time(),
    }
    _text_cache[cache_key] = result
    return result
