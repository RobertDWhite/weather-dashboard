from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import (
    airnow, aprs, aviation, briefing, cameras, cap, cell_tracks, damage,
    drought, earthquakes, eas, hazards, hrrr, lightning, lsr, marine,
    mesoanalysis, metars, nexrad, nhc, nws, nws_text, nws_zones, ohgo,
    openmeteo, radar, satellite, soundings, spc, spotters, storm_cells,
    timemachine, usgs, verification, webhook, webpush, wildfire, youtube,
)
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio as _asyncio
    # Kick off the time-machine snapshotter as a background task. Survives
    # request lifecycles; cancelled cleanly on shutdown.
    snap_task = _asyncio.create_task(timemachine.snapshot_loop())
    try:
        yield
    finally:
        snap_task.cancel()
        try:
            await snap_task
        except _asyncio.CancelledError:
            pass


app = FastAPI(title="Weather Dashboard API", version="0.1.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nws.router, prefix="/nws", tags=["NWS"])
app.include_router(radar.router, prefix="/radar", tags=["Radar"])
app.include_router(spc.router, prefix="/spc", tags=["SPC"])
app.include_router(satellite.router, prefix="/satellite", tags=["Satellite"])
app.include_router(openmeteo.router, prefix="/openmeteo", tags=["Open-Meteo"])
app.include_router(usgs.router, prefix="/usgs", tags=["USGS"])
app.include_router(cameras.router, prefix="/cameras", tags=["Cameras"])
app.include_router(ohgo.router, prefix="/ohgo", tags=["OHGO"])
app.include_router(youtube.router, prefix="/youtube", tags=["YouTube"])
app.include_router(aprs.router, prefix="/aprs", tags=["APRS"])
app.include_router(nhc.router, prefix="/nhc", tags=["NHC"])
app.include_router(mesoanalysis.router, prefix="/mesoanalysis", tags=["Mesoanalysis"])
app.include_router(metars.router, prefix="/metars", tags=["METAR"])
app.include_router(lsr.router, prefix="/lsr", tags=["LSRs"])
app.include_router(nexrad.router, prefix="/nexrad", tags=["NEXRAD"])
app.include_router(webhook.router, prefix="/webhook", tags=["Webhook"])
app.include_router(nws_text.router, prefix="/text", tags=["Text Products"])
app.include_router(airnow.router, prefix="/airnow", tags=["AirNow"])
app.include_router(hrrr.router, prefix="/hrrr", tags=["HRRR"])
app.include_router(briefing.router, prefix="/briefing", tags=["AI Briefing"])
app.include_router(timemachine.router, prefix="/timemachine", tags=["Time Machine"])
app.include_router(storm_cells.router, prefix="/cells", tags=["Storm Cells"])
app.include_router(wildfire.router, prefix="/wildfire", tags=["Wildfire"])
app.include_router(earthquakes.router, prefix="/earthquakes", tags=["Earthquakes"])
app.include_router(drought.router, prefix="/drought", tags=["Drought"])
app.include_router(lightning.router, prefix="/lightning", tags=["Lightning"])
app.include_router(spotters.router, prefix="/spotters", tags=["Spotter Network"])
app.include_router(aviation.router, prefix="/aviation", tags=["Aviation"])
app.include_router(nws_zones.router, prefix="/nws_zones", tags=["NWS Zones"])
app.include_router(marine.router, prefix="/marine", tags=["Marine"])
app.include_router(cap.router, prefix="/cap", tags=["CAP"])
app.include_router(damage.router, prefix="/damage", tags=["Damage Paths"])
app.include_router(hazards.router, prefix="/hazards", tags=["Hazards"])
app.include_router(soundings.router, prefix="/soundings", tags=["Soundings"])
app.include_router(eas.router, prefix="/eas", tags=["EAS"])
app.include_router(webpush.router, prefix="/webpush", tags=["Web Push"])
app.include_router(verification.router, prefix="/verification", tags=["Verification"])
app.include_router(cell_tracks.router, prefix="/cell_tracks", tags=["Cell Tracks"])

# Prometheus metrics. Exposes /metrics with standard request/latency series
# plus our app-specific counters (see app/metrics.py). Excluded from probe
# noise by default — /health and /metrics aren't traced as request metrics.
Instrumentator(
    excluded_handlers=["/health", "/health/upstreams", "/metrics"],
).instrument(app).expose(app, include_in_schema=False)


@app.get("/health")
async def health():
    """Shallow liveness/readiness probe — returns immediately. Designed to
    pass kubelet probes even when upstream sources are flaky. The deep probe
    (/health/upstreams) is what the UI footer status dots query."""
    return {"status": "ok"}


@app.get("/health/upstreams")
async def health_upstreams():
    """Per-source health probe — pings each upstream and reports status.
    Used by the dashboard footer to surface stale/broken feeds."""
    import asyncio
    import httpx

    sources = {
        "nws_alerts": "https://api.weather.gov/alerts/active?limit=1",
        "spc_outlook": "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson",
        "spc_reports": "https://www.spc.noaa.gov/climo/reports/today_filtered_torn.csv",
        "rainviewer": "https://api.rainviewer.com/public/weather-maps.json",
        "open_meteo": "https://api.open-meteo.com/v1/forecast?latitude=40&longitude=-90&current=temperature_2m",
        "nhc": "https://www.nhc.noaa.gov/CurrentStorms.json",
        "aviation_metar": "https://aviationweather.gov/api/data/metar?format=json&ids=KORD",
        "iem_lsr": "https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours=1",
        "iem_ridge": "https://mesonet.agron.iastate.edu/data/gis/images/4326/ridge/KILN/N0Q_0.json",
    }

    async def _probe(name: str, url: str):
        # Use GET universally — many of these upstreams (NWS api.weather.gov,
        # AviationWeather, NHC) reject HEAD outright with 4xx, so HEAD-with-
        # GET-fallback isn't reliable. GET with a tiny range header keeps the
        # body transfer small enough that this stays cheap.
        try:
            async with httpx.AsyncClient(timeout=6, follow_redirects=True) as client:
                r = await client.get(
                    url,
                    headers={
                        "User-Agent": settings.nws_user_agent,
                        "Range": "bytes=0-1023",
                    },
                )
            ok = r.status_code < 400
            return name, {"ok": ok, "status": r.status_code}
        except Exception as e:
            return name, {"ok": False, "status": 0, "error": str(e)[:120]}

    probes = await asyncio.gather(*[_probe(n, u) for n, u in sources.items()])
    return {"status": "ok", "sources": dict(probes)}


_API_BUILD_TIME: str | None = None


def _api_build_time() -> str:
    """File mtime of main.py — proxy for "when this image was built"."""
    global _API_BUILD_TIME
    if _API_BUILD_TIME is not None:
        return _API_BUILD_TIME
    import os
    from datetime import datetime, timezone
    try:
        ts = os.path.getmtime(__file__)
        _API_BUILD_TIME = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except OSError:
        _API_BUILD_TIME = ""
    return _API_BUILD_TIME


@app.get("/config")
async def get_config():
    import os
    return {
        "lat": settings.observer_lat,
        "lon": settings.observer_lon,
        "location": settings.observer_location,
        "state": settings.observer_state,
        "hasOwmKey": bool(settings.openweathermap_key),
        "hasAirnowKey": bool(settings.airnow_key),
        "hasWebhook": bool(os.environ.get("WEBHOOK_URL")),
        "hasOllama": bool(settings.ollama_url),
        "ollamaModel": settings.ollama_model,
        "apiVersion": app.version,
        "apiBuiltAt": _api_build_time(),
    }
