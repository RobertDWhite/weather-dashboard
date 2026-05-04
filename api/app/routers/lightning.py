"""Lightning Potential Index — sourced from Open-Meteo's hourly forecast.
LPI is a model-derived metric (J/kg) of how favorable conditions are for
lightning generation. Not real-time strike data, but useful as a now-and-near
proxy when no live lightning feed is available."""
import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=64, ttl=900)


@router.get("/potential")
async def get_lightning_potential(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    hours: int = Query(12, ge=1, le=48),
):
    """Hourly lightning potential index (LPI, J/kg) for the next N hours."""
    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon
    cache_key = f"{lat:.2f}:{lon:.2f}:{hours}"
    if cache_key in _cache:
        return _cache[cache_key]

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&hourly=lightning_potential,cape,convective_inhibition,thunderstorm_probability"
        f"&forecast_hours={hours}"
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=_HEADERS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Open-Meteo lightning unavailable: {e}")

    h = (data.get("hourly") or {})
    times = h.get("time") or []
    lpi = h.get("lightning_potential") or []
    cape = h.get("cape") or []
    cin = h.get("convective_inhibition") or []
    tprob = h.get("thunderstorm_probability") or []

    items: list[dict] = []
    for i, t in enumerate(times):
        items.append({
            "time": t,
            "lightning_potential": lpi[i] if i < len(lpi) else None,
            "cape": cape[i] if i < len(cape) else None,
            "cin": cin[i] if i < len(cin) else None,
            "thunderstorm_probability": tprob[i] if i < len(tprob) else None,
        })

    peak_lpi = max((x for x in lpi if x is not None), default=None)
    peak_tprob = max((x for x in tprob if x is not None), default=None)
    result = {
        "lat": lat,
        "lon": lon,
        "hours": hours,
        "items": items,
        "peak_lpi": peak_lpi,
        "peak_thunderstorm_probability": peak_tprob,
    }
    _cache[cache_key] = result
    return result
