"""HRRR forecast loop catalog. Pre-validates that the latest run's frames are
actually published before returning them — frees the UI to hide the panel
cleanly when no working source exists.

Tries multiple known image catalogs in order; first one that returns 200 for
forecast hour 1 wins."""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, Query

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=8, ttl=300)

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept": "image/png,image/gif,image/*;q=0.8,*/*;q=0.5",
}


def _latest_hrrr_run_utc(now: datetime | None = None) -> datetime:
    """HRRR runs hourly. Pick the most-recent run that's likely-published —
    publication lags the hour by ~80 min, so back off 90 min from current UTC."""
    now = (now or datetime.now(timezone.utc)).replace(tzinfo=timezone.utc)
    candidate = (now - timedelta(minutes=90)).replace(minute=0, second=0, microsecond=0)
    return candidate


# Candidate URL templates for HRRR composite reflectivity. Each template uses
# python str.format with: yyyymmdd, hh, fh, fhz3 (zero-padded 3), bust.
_REFC_TEMPLATES = [
    # NCEP MAG conus model graphics — the most reliably-served free source
    "https://mag.ncep.noaa.gov/data/hrrr/{hh}/hrrr_namer_{fhz3}_REFC.gif?_={bust}",
    "https://mag.ncep.noaa.gov/data/hrrr/{hh}/hrrr_conus_{fhz3}_REFC.gif?_={bust}",
    # Iowa Environmental Mesonet legacy path (sometimes published)
    "https://mesonet.agron.iastate.edu/data/hrrr/{yyyymmdd}/refc_{hh}_{fh}.png?_={bust}",
]

# Same idea for HRRR-Smoke
_SMOKE_TEMPLATES = [
    "https://mag.ncep.noaa.gov/data/hrrr/{hh}/hrrr_smoke_namer_{fhz3}.gif?_={bust}",
    "https://rapidrefresh.noaa.gov/hrrr/HRRRsmoke/RT/IMG/full/{yyyymmddhh}/conus/hrrr.t{hh}z.smoke.f{fhz2}.conus.png?_={bust}",
]


async def _probe_template(template: str, run: datetime, bust: int) -> str | None:
    """Return the URL filled-in for forecast hour 1 if it returns 200, else None."""
    fh = 1
    url = template.format(
        yyyymmdd=run.strftime("%Y%m%d"),
        yyyymmddhh=run.strftime("%Y%m%d%H"),
        hh=run.strftime("%H"),
        fh=f"{fh:02d}",
        fhz2=f"{fh:02d}",
        fhz3=f"{fh:03d}",
        bust=bust,
    )
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            r = await client.get(
                url,
                headers={**_BROWSER_HEADERS, "Range": "bytes=0-2047"},
            )
            return template if r.status_code < 400 else None
    except Exception:
        return None


def _build_frames(template: str, run: datetime, hours: int, bust: int) -> list[dict]:
    frames = []
    for fh in range(1, hours + 1):
        valid = run + timedelta(hours=fh)
        url = template.format(
            yyyymmdd=run.strftime("%Y%m%d"),
            yyyymmddhh=run.strftime("%Y%m%d%H"),
            hh=run.strftime("%H"),
            fh=f"{fh:02d}",
            fhz2=f"{fh:02d}",
            fhz3=f"{fh:03d}",
            bust=bust,
        )
        frames.append({
            "fh": fh,
            "valid_utc": valid.isoformat(),
            "valid_local_label": valid.strftime("%a %H:%MZ"),
            "url": url,
        })
    return frames


async def _resolve(templates: list[str], hours: int, model_label: str, field_label: str, page: str) -> dict:
    """Try each template's hour-1 URL; the first that responds 200 wins.
    Returns a frames-empty payload if nothing works (so the UI can hide)."""
    # Try the most-recent run first; if all templates fail, also try the
    # previous run (in case current isn't published yet)
    bust = int(time.time() // 600)
    for run in (_latest_hrrr_run_utc(), _latest_hrrr_run_utc() - timedelta(hours=1)):
        # Probe templates in parallel for this run
        results = await asyncio.gather(
            *[_probe_template(t, run, bust) for t in templates],
            return_exceptions=False,
        )
        winner = next((t for t in results if t), None)
        if winner:
            return {
                "model": model_label,
                "field": field_label,
                "run_utc": run.isoformat(),
                "run_label": run.strftime("%Y-%m-%d %HZ"),
                "frames": _build_frames(winner, run, hours, bust),
                "page": page,
            }
    return {
        "model": model_label,
        "field": field_label,
        "run_utc": None,
        "run_label": "no published run",
        "frames": [],
        "page": page,
    }


@router.get("/forecast")
async def get_hrrr_forecast(
    sector: str = Query("conus", pattern=r"^(conus|midwest|south|east|west|plains)$"),
    hours: int = Query(12, ge=1, le=18),
):
    """Latest HRRR composite reflectivity forecast. Validates frame 1 before
    returning so the UI can hide the panel if no template is reachable."""
    cache_key = f"refc:{sector}:{hours}"
    if cache_key in _cache:
        return _cache[cache_key]
    result = await _resolve(
        _REFC_TEMPLATES, hours,
        model_label="HRRR",
        field_label="Composite Reflectivity",
        page="https://mag.ncep.noaa.gov/model-guidance-model-area.php?group=Model%20Guidance&model=HRRR&area=CONUS",
    )
    result["sector"] = sector
    _cache[cache_key] = result
    return result


@router.get("/smoke")
async def get_hrrr_smoke(
    hours: int = Query(12, ge=1, le=18),
):
    """HRRR-Smoke near-surface smoke forecast. Same multi-template probe."""
    cache_key = f"smoke:{hours}"
    if cache_key in _cache:
        return _cache[cache_key]
    result = await _resolve(
        _SMOKE_TEMPLATES, hours,
        model_label="HRRR-Smoke",
        field_label="Near-Surface Smoke",
        page="https://rapidrefresh.noaa.gov/hrrr/HRRRsmoke/",
    )
    _cache[cache_key] = result
    return result
