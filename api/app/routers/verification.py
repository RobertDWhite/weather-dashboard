"""Alert verification — given today's storm reports (LSRs) and the warnings
that were active at the time, compute lead times and hit/miss/false-alarm
counts. Useful for after-event review (and for the public to see how well
NWS warnings performed)."""
from datetime import datetime, timedelta, timezone
from typing import Iterable

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_cache: TTLCache = TTLCache(maxsize=4, ttl=300)


# Map LSR types to the warning event names that should have covered them.
_LSR_TO_WARNINGS = {
    "TORNADO": ["Tornado Warning"],
    "FUNNEL CLOUD": ["Tornado Warning"],
    "WATERSPOUT": ["Tornado Warning", "Special Marine Warning"],
    "HAIL": ["Severe Thunderstorm Warning"],
    "TSTM WND DMG": ["Severe Thunderstorm Warning"],
    "TSTM WND GST": ["Severe Thunderstorm Warning"],
    "FLASH FLOOD": ["Flash Flood Warning"],
}


def _point_in_polygon(lat: float, lon: float, polygon: list[list[float]]) -> bool:
    """Ray-cast point-in-polygon test. polygon is list of [lon, lat]."""
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][0], polygon[i][1]
        xj, yj = polygon[j][0], polygon[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _alert_contains(alert_geom: dict, lat: float, lon: float) -> bool:
    if not alert_geom:
        return False
    t = alert_geom.get("type")
    coords = alert_geom.get("coordinates") or []
    if t == "Polygon":
        return _point_in_polygon(lat, lon, coords[0])
    if t == "MultiPolygon":
        for p in coords:
            if _point_in_polygon(lat, lon, p[0]):
                return True
    return False


@router.get("/today")
async def verify_today():
    """Hit/miss + lead-time stats for today's tornado/severe/hail/wind LSRs
    against the warnings active at their times."""
    if "today" in _cache:
        return _cache["today"]

    async def _fetch_lsrs() -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    "https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours=24",
                    headers=_HEADERS,
                )
                r.raise_for_status()
                return (r.json().get("features") or [])
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LSR fetch: {e}")

    async def _fetch_alerts() -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    "https://api.weather.gov/alerts",
                    params={"start": (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat(),
                            "limit": 500, "message_type": "alert"},
                    headers={**_HEADERS, "Accept": "application/geo+json"},
                )
                r.raise_for_status()
                return (r.json().get("features") or [])
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"alerts fetch: {e}")

    import asyncio
    lsrs, alerts = await asyncio.gather(_fetch_lsrs(), _fetch_alerts())

    results: list[dict] = []
    summary = {
        "tornado": {"events": 0, "verified": 0, "lead_times_min": []},
        "severe": {"events": 0, "verified": 0, "lead_times_min": []},
        "flood": {"events": 0, "verified": 0, "lead_times_min": []},
    }

    for lsr in lsrs:
        p = lsr.get("properties") or {}
        ltype = (p.get("type") or "").upper()
        valid = p.get("valid")
        if not valid or ltype not in _LSR_TO_WARNINGS:
            continue
        try:
            lsr_time = datetime.fromisoformat(valid.replace("Z", "+00:00"))
        except Exception:
            continue
        coords = (lsr.get("geometry") or {}).get("coordinates") or [None, None]
        lat, lon = coords[1], coords[0]
        if lat is None or lon is None:
            continue

        bucket = (
            "tornado" if "TORNADO" in ltype or "FUNNEL" in ltype or "WATERSPOUT" in ltype
            else "flood" if "FLOOD" in ltype
            else "severe"
        )
        summary[bucket]["events"] += 1

        relevant = _LSR_TO_WARNINGS.get(ltype, [])
        # Find the earliest active matching warning whose polygon contained the point
        best_lead_min: float | None = None
        for a in alerts:
            ap = a.get("properties") or {}
            if ap.get("event") not in relevant:
                continue
            try:
                onset = datetime.fromisoformat((ap.get("onset") or ap.get("effective", "")).replace("Z", "+00:00"))
                expires = datetime.fromisoformat((ap.get("expires") or ap.get("ends", "")).replace("Z", "+00:00"))
            except Exception:
                continue
            if not (onset <= lsr_time <= expires):
                continue
            if not _alert_contains(a.get("geometry") or {}, lat, lon):
                continue
            lead_min = (lsr_time - onset).total_seconds() / 60.0
            if best_lead_min is None or lead_min < best_lead_min:
                best_lead_min = lead_min

        if best_lead_min is not None:
            summary[bucket]["verified"] += 1
            summary[bucket]["lead_times_min"].append(round(best_lead_min, 1))

        results.append({
            "type": ltype,
            "valid": valid,
            "lat": lat,
            "lon": lon,
            "city": p.get("city"),
            "state": p.get("st") or p.get("state"),
            "lead_time_min": round(best_lead_min, 1) if best_lead_min is not None else None,
            "verified": best_lead_min is not None,
        })

    # Compute averages
    for bucket in summary.values():
        lead = bucket["lead_times_min"]
        bucket["avg_lead_min"] = round(sum(lead) / len(lead), 1) if lead else None
        bucket["verification_pct"] = (
            round(bucket["verified"] / bucket["events"] * 100, 1)
            if bucket["events"] else None
        )

    payload = {
        "events": results,
        "summary": summary,
        "total_lsrs": len(results),
    }
    _cache["today"] = payload
    return payload
