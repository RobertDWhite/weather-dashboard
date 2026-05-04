import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

from app.config import settings

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=20, ttl=900)


@router.get("/gauges")
async def get_gauges(state: str = None):
    state = (state or settings.observer_state).upper()
    if state in _cache:
        return _cache[state]
    async with httpx.AsyncClient(timeout=30) as client:
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
                gauges.append(
                    {
                        "siteCode": sv.get("siteCode", [{}])[0].get("value", ""),
                        "siteName": sv.get("siteName", ""),
                        "lat": float(geo.get("latitude", 0)),
                        "lon": float(geo.get("longitude", 0)),
                        "height": height,
                        "unit": "ft",
                        "time": latest.get("dateTime", ""),
                        "qualifiers": latest.get("qualifiers", []),
                    }
                )
            result = {"gauges": gauges, "state": state}
            _cache[state] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
