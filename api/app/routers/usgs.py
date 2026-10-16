import asyncio
import math

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.river_thresholds import flood_thresholds

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=20, ttl=900)
_threshold_cache: TTLCache = TTLCache(maxsize=2000, ttl=6 * 3600)
_threshold_limit = asyncio.Semaphore(6)


async def _thresholds(client: httpx.AsyncClient, site_code: str) -> dict | None:
    if site_code in _threshold_cache:
        return _threshold_cache[site_code]
    try:
        async with _threshold_limit:
            response = await client.get(f"https://api.water.noaa.gov/nwps/v1/gauges/{site_code}", timeout=3)
            if response.status_code == 404:
                _threshold_cache[site_code] = None
                return None
            response.raise_for_status()
            thresholds = flood_thresholds(response.json(), site_code)
            _threshold_cache[site_code] = thresholds
            return thresholds
    except (httpx.HTTPError, ValueError, TypeError):
        # A missing NWS classification must not erase the USGS observation.
        return None



@router.get("/gauges")
async def get_gauges(state: str = None):
    state = (state or settings.observer_state).upper()
    if state in _cache:
        return _cache[state]
    async with httpx.AsyncClient(timeout=12) as client:
        try:
            r = await client.get(
                "https://waterservices.usgs.gov/nwis/iv/",
                params={
                    "format": "json",
                    "stateCd": state.lower(),
                    "parameterCd": "00065",
                    "siteStatus": "active",
                    "siteType": "ST",
                    "period": "PT2H",
                },
            )
            r.raise_for_status()
            data = r.json()
            gauges = []
            for site in data.get("value", {}).get("timeSeries", [])[:40]:
                sv = site.get("sourceInfo", {})
                geo = sv.get("geoLocation", {}).get("geogLocation", {})
                vals = site.get("values", [{}])[0].get("value", [])
                if not vals or not geo:
                    continue
                latest = vals[-1]
                try:
                    height = float(latest["value"])
                except (ValueError, KeyError, TypeError):
                    continue
                variable = site.get("variable", {})
                if not math.isfinite(height) or height == variable.get("noDataValue", -999999):
                    continue
                gauges.append(
                    {
                        "siteCode": sv.get("siteCode", [{}])[0].get("value", ""),
                        "siteName": sv.get("siteName", ""),
                        "lat": float(geo.get("latitude", 0)),
                        "lon": float(geo.get("longitude", 0)),
                        "height": height,
                        "unit": variable.get("unit", {}).get("unitCode", "unknown"),
                        "time": latest.get("dateTime", ""),
                        "qualifiers": latest.get("qualifiers", []),
                    }
                )
            # Bound the whole enrichment step, including queued requests.
            async def enrich(gauge):
                try:
                    gauge["thresholds"] = await asyncio.wait_for(_thresholds(client, gauge["siteCode"]), timeout=6)
                except asyncio.TimeoutError:
                    gauge["thresholds"] = None
            await asyncio.gather(*(enrich(gauge) for gauge in gauges))
            result = {"gauges": gauges, "state": state}
            _cache[state] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
