"""AI-generated weather briefing. Aggregates the most operationally-relevant
state — active NWS alerts, recent LSRs, the local AFD/HWO, storm reports —
into a short context block, sends it to Ollama (running in the ai-stack
namespace), and returns a 2-3 sentence "what to know right now" summary.

Also exposes /briefing/prioritize which asks the model to rank a list of
active alerts in operational urgency order. Useful when you've got 50+ active
alerts and want the most-actionable ones to the top of the panel.

Designed to be glanceable for kiosk / TV mode and useful as a stream chyron.
Cached 10 min so we don't pound Ollama every refresh."""
import asyncio
import hashlib
import json as _json
import re as _re
import time as _time

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import settings

router = APIRouter()
_HEADERS = {"User-Agent": settings.nws_user_agent, "Accept": "application/geo+json"}
# Long TTL because Ollama generation is expensive. We invalidate before this
# expires whenever the alert fingerprint changes meaningfully (see _fingerprint).
_cache: TTLCache = TTLCache(maxsize=16, ttl=3600)


def _fingerprint(ctx: dict) -> str:
    """Invalidate when source availability, alert revisions, or forecast text changes."""
    content = {k: v for k, v in ctx.items() if k != "checked_at"}
    return hashlib.sha256(_json.dumps(content, sort_keys=True, default=str).encode()).hexdigest()[:24]


SYSTEM_PROMPT = """You are an operational meteorologist writing a brief summary for a
weather operations dashboard. Style: terse, factual, no fluff, no
greetings. Plain sentences. Lead with the highest-impact threat. Mention specific
watch/warning types, areas, and timing where given. If nothing severe is active,
describe only the available forecast. Never infer an all-clear from unavailable sources. Explicitly identify unavailable sources and do not invent their contents. Maximum 60 words. Output
plain text only — no markdown headers, no bullets, no lists."""


def _user_prompt(ctx: dict) -> str:
    parts: list[str] = []

    parts.append(f"Location: {ctx.get('location', 'unknown')}.")

    scope = ctx.get("scope", "nearby")
    parts.append("Alert scope: " + ("at the home location" if scope == "home" else f"within {ctx.get('radius_miles', 75)} miles of home") + ".")
    for name, status in ctx.get("sources", {}).items():
        if status != "available":
            parts.append(f"UNAVAILABLE source: {name}. Its contents and absence of threats are unknown.")
    alerts = ctx.get("alerts", [])
    if ctx.get("sources", {}).get("alerts") == "unavailable":
        parts.append("NWS alert status is unknown. Do not claim there are no alerts or threats.")
    elif alerts:
        # Group by event for compactness
        by_event: dict[str, list[str]] = {}
        for a in alerts[:30]:
            ev = a.get("event") or "Unknown"
            area = (a.get("areaDesc") or "")[:120]
            by_event.setdefault(ev, []).append(area)
        parts.append("Active NWS alerts:")
        for ev, areas in by_event.items():
            parts.append(f"  - {ev} for {len(areas)} area(s): {areas[0]}")
    else:
        parts.append("No active NWS alerts returned for the selected scope.")

    lsrs = ctx.get("lsrs", [])
    if lsrs:
        cats = ctx.get("lsr_by_category") or {}
        cat_summary = ", ".join(f"{v} {k}" for k, v in cats.items() if v)
        parts.append(f"Local storm reports past 2h: {cat_summary or 'misc'}")
        for r in lsrs[:5]:
            parts.append(f"  - {r.get('type')} at {r.get('city')}, {r.get('state')}{(' — ' + r.get('remark', ''))[:120] if r.get('remark') else ''}")

    sr = ctx.get("storm_reports") or {}
    if sr.get("total"):
        parts.append(f"SPC storm reports today: {len(sr.get('tornado', []))} tornado, {len(sr.get('hail', []))} hail, {len(sr.get('wind', []))} wind.")

    afd = (ctx.get("afd_text") or "").strip()
    if afd:
        parts.append("Local AFD excerpt:")
        parts.append(afd[:1500])

    hwo = (ctx.get("hwo_text") or "").strip()
    if hwo:
        parts.append("Local HWO excerpt:")
        parts.append(hwo[:1000])

    return "\n".join(parts)


async def _gather_context(client: httpx.AsyncClient, lat: float, lon: float,
                          scope: str = "nearby", radius_miles: float = 75) -> dict:
    from app.routers.nws import get_alerts

    ctx: dict = {"location": settings.observer_location, "scope": scope, "radius_miles": radius_miles,
                 "sources": {}, "checked_at": _time.time()}

    async def load_alerts():
        try:
            payload = await get_alerts(dedupe=True, local=True, lat=lat, lon=lon,
                                       radius_miles=radius_miles, scope=scope)
            if not isinstance(payload.get("features"), list):
                raise ValueError("Missing alert collection")
            ctx["alerts"] = [(f.get("properties") or {}) for f in payload["features"] if isinstance(f, dict)]
            ctx["sources"]["alerts"] = "unavailable" if payload.get("incomplete") else "available"
        except Exception:
            ctx["alerts"] = []
            ctx["sources"]["alerts"] = "unavailable"

    async def load(name, url):
        try:
            r = await client.get(url, headers=_HEADERS, timeout=10)
            r.raise_for_status()
            value = r.json()
            if name == "lsrs":
                if not isinstance(value.get("features"), list):
                    raise ValueError("Missing report collection")
                items = []
                # Match the selected geographic scope instead of mixing in national reports.
                from app.routers.nws import _haversine_miles
                for feature in value["features"]:
                    geo = feature.get("geometry") or {}
                    coords = geo.get("coordinates") or []
                    if geo.get("type") != "Point" or len(coords) < 2:
                        continue
                    if _haversine_miles(lat, lon, coords[1], coords[0]) > (radius_miles if scope == "nearby" else 1):
                        continue
                    p = feature.get("properties") or {}
                    items.append({"type": p.get("type"), "city": p.get("city"),
                                  "state": p.get("st") or p.get("state"), "remark": p.get("remark"),
                                  "valid": p.get("valid")})
                ctx["lsrs"] = items[:25]
            else:
                text = value.get("stripped_text") or value.get("text")
                if not isinstance(text, str) or not text.strip():
                    raise ValueError("Missing text product")
                ctx[f"{name}_text"] = text
            ctx["sources"][name] = "available"
        except Exception:
            ctx["sources"][name] = "unavailable"

    await asyncio.gather(
        load_alerts(),
        load("lsrs", "https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours=2"),
        load("afd", f"http://localhost:8000/text/afd?lat={lat}&lon={lon}"),
        load("hwo", f"http://localhost:8000/text/hwo?lat={lat}&lon={lon}"),
    )
    return ctx


# Cache the resolved model so we don't probe /api/tags on every request.
# Cleared on Ollama errors so the next call re-discovers.
_resolved_model: list[str | None] = [None]


async def _resolve_model(client: httpx.AsyncClient) -> str:
    """Pick a usable model. Prefer the configured one if Ollama actually has
    it pulled; otherwise fall back to the first available model."""
    if _resolved_model[0]:
        return _resolved_model[0]
    try:
        r = await client.get(f"{settings.ollama_url.rstrip('/')}/api/tags", timeout=8)
        r.raise_for_status()
        data = r.json() or {}
        names = [m.get("name") for m in (data.get("models") or []) if m.get("name")]
    except Exception:
        names = []
    chosen = settings.ollama_model
    if names and chosen not in names:
        chosen = names[0]
    if not names:
        chosen = settings.ollama_model  # we'll let the call fail meaningfully
    _resolved_model[0] = chosen
    return chosen


async def _ask_ollama(prompt: str) -> str:
    """POST a single-shot generate request to Ollama, auto-picking a model
    that's actually pulled if the configured one is missing."""
    url = f"{settings.ollama_url.rstrip('/')}/api/generate"
    async with httpx.AsyncClient(timeout=60) as client:
        model = await _resolve_model(client)
        body = {
            "model": model,
            "prompt": prompt,
            "system": SYSTEM_PROMPT,
            "stream": False,
            # Reasoning models can spend the entire short token budget on
            # thinking and return an empty response. This is a concise summary.
            "think": False,
            "options": {
                "temperature": 0.2,
                "num_predict": 220,
            },
        }
        r = await client.post(url, json=body)
        if r.status_code == 404:
            # Stale resolved-model — invalidate & retry once
            _resolved_model[0] = None
            new_model = await _resolve_model(client)
            if new_model != model:
                body["model"] = new_model
                r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json() or {}
    text = (data.get("response") or "").strip()
    if not text:
        raise ValueError("Ollama returned no briefing text")
    return text


@router.get("/now")
async def briefing_now(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    refresh: bool = Query(False, description="bypass cache and regenerate"),
    scope: str = Query("nearby", pattern="^(home|nearby)$"),
    radius_miles: float = Query(75, ge=1, le=250),
):
    """Generate (or return cached) plain-English briefing of the current
    weather situation. Cached up to 1h, but transparently invalidated when
    the alert fingerprint changes (new urgent event, new tornado emergency,
    different count tier). Pass refresh=true to force regeneration."""
    if not settings.ollama_url:
        raise HTTPException(status_code=503, detail="AI briefing not configured (set ollama.url in config.yaml)")

    lat = lat if lat is not None else settings.observer_lat
    lon = lon if lon is not None else settings.observer_lon

    # Always gather context — it's cheap (small NWS calls) and we need it
    # for the fingerprint anyway. NWS responses themselves are cached upstream
    # so this isn't a real per-request cost.
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            ctx = await _gather_context(client, lat, lon, scope, radius_miles)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"context gather failed: {e}")

    fp = _fingerprint(ctx)
    cache_key = f"{lat:.2f}:{lon:.2f}::{fp}"
    if not refresh:
        cached = _cache.get(cache_key)
        if cached:
            return cached

    # Coalesce concurrent cache-miss requests so we only hit Ollama once per
    # unique fingerprint. Subsequent in-flight callers await the same future.
    from app.coalesce import coalesce
    return await coalesce(f"brief:{cache_key}", lambda: _generate_briefing(ctx, lat, lon, fp, cache_key, refresh=refresh))


async def _generate_briefing(ctx: dict, lat: float, lon: float, fp: str, cache_key: str, *, refresh: bool = False) -> dict:
    from app.metrics import briefing_duration, briefing_generated
    import time as __t

    # Re-check cache inside the coalesce window — another concurrent caller
    # may have already populated it just before us.
    cached = _cache.get(cache_key)
    if cached and not refresh:
        return cached

    started = __t.monotonic()
    prompt = _user_prompt(ctx)
    source = "ollama"
    try:
        # Partial alert coverage is included explicitly in the prompt. Keep
        # the model useful with the remaining observations, while the prompt
        # forbids it from presenting an all-clear or inventing missing alerts.
        text = await _ask_ollama(prompt)
    except Exception as e:
        # Graceful fallback: deterministic summary built from the context alone
        text = _fallback_summary(ctx) + f"  (AI offline: {str(e)[:80]})"
        source = "fallback"
    finally:
        briefing_duration.observe(__t.monotonic() - started)
        briefing_generated.labels(model=_resolved_model[0] or settings.ollama_model, source=source).inc()

    result = {
        "text": text,
        "source": source,
        "model": _resolved_model[0] or settings.ollama_model,
        "context": {
            "alerts_count": None if ctx.get("sources", {}).get("alerts") == "unavailable" else len(ctx.get("alerts", [])),
            "lsrs_count": None if ctx.get("sources", {}).get("lsrs") == "unavailable" else len(ctx.get("lsrs", [])),
            "has_afd": bool(ctx.get("afd_text")),
            "has_hwo": bool(ctx.get("hwo_text")),
        },
        "scope": ctx.get("scope", "nearby"),
        "radius_miles": ctx.get("radius_miles", 75),
        "sources": ctx.get("sources", {}),
        "context_checked_at": ctx.get("checked_at"),
        "fingerprint": fp,
        "generated_at": _time.time(),
        "cache_ttl_sec": int(_cache.ttl),
        "lat": lat,
        "lon": lon,
    }
    # Do not trap a recovered service behind an hour-long offline response.
    if source == "ollama":
        _cache[cache_key] = result
    return result


def _fallback_summary(ctx: dict) -> str:
    """Deterministic 1-sentence summary if Ollama is unreachable."""
    if ctx.get("sources", {}).get("alerts") == "unavailable":
        alerts = ctx.get("alerts") or []
        known = f" At least {len(alerts)} alert(s) were verified: {', '.join(sorted({a.get('event') or 'alert' for a in alerts}))}." if alerts else ""
        return "NWS alert coverage is unavailable or incomplete for the selected area." + known + " Additional alert status is unknown; an all-clear cannot be confirmed."
    alerts = ctx.get("alerts", [])
    if not alerts:
        return f"No active NWS alerts for {ctx.get('location', 'the area')}. Other weather threats are not assessed by this basic summary."
    events = sorted({a.get("event") or "alert" for a in alerts})
    return (
        f"{len(alerts)} active NWS alert(s) for {ctx.get('location', 'the area')}: "
        f"{', '.join(events[:5])}."
    )


@router.get("/status")
async def briefing_status():
    """Quick health check for the Ollama integration — used by the UI to
    show/hide the briefing panel."""
    url = f"{settings.ollama_url.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            r = await client.get(url)
        ok = r.status_code == 200
        models = []
        if ok:
            data = r.json() or {}
            models = [m.get("name") for m in (data.get("models") or [])]
        return {
            "ok": ok,
            "url": settings.ollama_url,
            "configured_model": settings.ollama_model,
            "available_models": models,
        }
    except Exception as e:
        return {"ok": False, "url": settings.ollama_url, "error": str(e)[:200]}


# ── Smart alert prioritization ────────────────────────────────────

_priority_cache: TTLCache = TTLCache(maxsize=8, ttl=180)


PRIORITIZE_SYSTEM = """You are a severe-weather operations dispatcher. You will be
given a JSON array of active NWS alerts. Rank them by OPERATIONAL URGENCY for a
person actively watching their area. Higher urgency:
  - Tornado Emergency / Flash Flood Emergency / PDS situations
  - Tornado Warning > Severe Thunderstorm Warning > Flash Flood Warning
  - Watches and advisories below warnings
  - Things expiring within 30 min get a slight boost (still actionable)
Within ties: shorter expiration first, then more populated areas first.

Output STRICTLY a single JSON object with two keys:
  "order": array of alert ids in priority order (highest first)
  "reasoning": one short sentence summarizing the top 1-3 picks
Do not include any other text, no markdown fences, no commentary."""


class PrioritizeAlertItem(BaseModel):
    id: str
    event: str | None = None
    severity: str | None = None
    headline: str | None = None
    areaDesc: str | None = None
    expires: str | None = None


class PrioritizeRequest(BaseModel):
    alerts: list[PrioritizeAlertItem]


def _local_rank_score(a: PrioritizeAlertItem) -> tuple[int, str]:
    """Deterministic scoring used as a fallback when Ollama is unavailable.
    Lower tuple sorts first (higher urgency).

    Tier order:
      0  Tornado Emergency / Flash Flood Emergency / PDS
      1  Tornado Warning
      2  Severe Thunderstorm Warning / Snow Squall / Extreme Wind / Dust Storm
      3  Flash Flood Warning
      4  Other warnings
      5  Tornado Watch / Severe T-storm Watch
      6  Other watches
      7  Advisories / statements
      9  Unknown
    """
    ev = (a.event or "").lower()
    hl = (a.headline or "").lower()
    if "tornado emergency" in ev or "tornado emergency" in hl:
        tier = 0
    elif "flash flood emergency" in ev or "flash flood emergency" in hl:
        tier = 0
    elif "particularly dangerous" in hl or "pds" in hl:
        tier = 0
    elif "tornado warning" in ev:
        tier = 1
    elif "severe thunderstorm warning" in ev or "snow squall warning" in ev or "extreme wind warning" in ev:
        tier = 2
    elif "flash flood warning" in ev:
        tier = 3
    elif "warning" in ev:
        tier = 4
    elif "tornado watch" in ev or "severe thunderstorm watch" in ev:
        tier = 5
    elif "watch" in ev:
        tier = 6
    elif "advisory" in ev or "statement" in ev:
        tier = 7
    else:
        tier = 9
    # Secondary sort: shorter expires first
    return (tier, a.expires or "")


def _local_rank(req: PrioritizeRequest) -> list[str]:
    return [a.id for a in sorted(req.alerts, key=_local_rank_score)]


@router.post("/prioritize")
async def prioritize(req: PrioritizeRequest):
    """Rank a list of active NWS alerts by operational urgency. Uses Ollama
    when available; falls back to a deterministic rule-based scorer otherwise."""
    if not req.alerts:
        return {"order": [], "reasoning": "", "source": "none"}
    if len(req.alerts) > 80:
        # Cap input size so we don't blow Ollama's context window
        req = PrioritizeRequest(alerts=req.alerts[:80])

    # Cache key: hash of sorted alert ids — same set returns same ranking
    ids_sig = ",".join(sorted(a.id for a in req.alerts))
    if ids_sig in _priority_cache:
        return _priority_cache[ids_sig]

    # Build a compact JSON payload for the model
    payload = [
        {
            "id": a.id,
            "event": a.event,
            "severity": a.severity,
            "expires": a.expires,
            "area": (a.areaDesc or "")[:160],
            "headline": (a.headline or "")[:200],
        }
        for a in req.alerts
    ]

    try:
        url = f"{settings.ollama_url.rstrip('/')}/api/generate"
        async with httpx.AsyncClient(timeout=45) as client:
            model = await _resolve_model(client)
            body = {
                "model": model,
                "prompt": _json.dumps(payload, separators=(",", ":")),
                "system": PRIORITIZE_SYSTEM,
                "stream": False,
                "format": "json",
                "think": False,
                "options": {"temperature": 0.0, "num_predict": 800},
            }
            r = await client.post(url, json=body)
            if r.status_code == 404:
                _resolved_model[0] = None
                new_model = await _resolve_model(client)
                if new_model != model:
                    body["model"] = new_model
                    r = await client.post(url, json=body)
            r.raise_for_status()
            data = r.json() or {}
        text = (data.get("response") or "").strip()
        # Some models still wrap in fences despite the system prompt — strip them
        text = _re.sub(r"^```(?:json)?", "", text).rstrip("`").strip()
        parsed = _json.loads(text)
        order_raw = parsed.get("order") or []
        valid_ids = {a.id for a in req.alerts}
        order = [str(x) for x in order_raw if str(x) in valid_ids]
        # Append any alerts the model dropped, scored by local heuristic
        missing = [a.id for a in req.alerts if a.id not in order]
        if missing:
            missing_sorted = [a.id for a in sorted(
                [a for a in req.alerts if a.id in missing], key=_local_rank_score
            )]
            order.extend(missing_sorted)
        result = {
            "order": order,
            "reasoning": str(parsed.get("reasoning") or "")[:300],
            "source": "ollama",
            "model": _resolved_model[0] or settings.ollama_model,
        }
    except Exception as e:
        result = {
            "order": _local_rank(req),
            "reasoning": "",
            "source": "fallback",
            "error": str(e)[:160],
        }

    _priority_cache[ids_sig] = result
    return result


# Keep asyncio import live (used by future expansion)
_ = asyncio
