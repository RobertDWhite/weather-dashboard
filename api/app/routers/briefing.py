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
    """A stable, coarse signature of the alert context. The briefing is keyed
    on this so identical contexts return the same cached text — pure page
    refreshes don't trigger regeneration. Recomputes when something material
    changes: a new urgent event type, a different count tier, or a new
    tornado-emergency/PDS situation appears."""
    alerts = ctx.get("alerts") or []
    # Count alerts by event type
    by_event: dict[str, int] = {}
    has_emergency = False
    has_pds = False
    for a in alerts:
        ev = (a.get("event") or "").strip()
        hl = (a.get("headline") or "").lower()
        by_event[ev] = by_event.get(ev, 0) + 1
        if "emergency" in ev.lower() or "emergency" in hl:
            has_emergency = True
        if "particularly dangerous" in hl or "pds" in hl:
            has_pds = True

    # Coarsen counts so adding 1 alert in the same bucket doesn't churn the
    # fingerprint: bucket sizes 0,1,2-5,6-15,16-50,50+
    def _bucket(n: int) -> str:
        if n <= 0: return "0"
        if n == 1: return "1"
        if n <= 5: return "2-5"
        if n <= 15: return "6-15"
        if n <= 50: return "16-50"
        return "50+"

    parts = sorted(f"{ev}:{_bucket(n)}" for ev, n in by_event.items())
    if has_emergency:
        parts.append("EMERGENCY")
    if has_pds:
        parts.append("PDS")
    # LSR tornado count (sub-bucketed) — a new tornado report should re-brief
    lsrs = ctx.get("lsrs") or []
    tor_lsrs = sum(1 for r in lsrs if "TORNADO" in (r.get("type") or "").upper())
    parts.append(f"lsrtor:{_bucket(tor_lsrs)}")
    return "|".join(parts) or "quiet"


SYSTEM_PROMPT = """You are an operational meteorologist writing a brief summary for a
weather operations dashboard. Style: terse, factual, no fluff, no caveats, no
greetings. Plain sentences. Lead with the highest-impact threat. Mention specific
watch/warning types, areas, and timing where given. If nothing severe is active,
state that conditions are quiet and what to keep an eye on. Maximum 60 words. Output
plain text only — no markdown headers, no bullets, no lists."""


def _user_prompt(ctx: dict) -> str:
    parts: list[str] = []

    parts.append(f"Location: {ctx.get('location', 'unknown')}.")

    alerts = ctx.get("alerts", [])
    if alerts:
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
        parts.append("No active NWS alerts at this point.")

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


async def _gather_context(client: httpx.AsyncClient, lat: float, lon: float) -> dict:
    """Pull together the dashboard's current state. We re-fetch source data
    rather than coupling to other in-process state so this endpoint works
    even before the UI has loaded."""
    ctx: dict = {"location": settings.observer_location}

    async def _try_json(url: str, *, headers: dict | None = None):
        try:
            r = await client.get(url, headers=headers or _HEADERS, timeout=10)
            if r.status_code == 200:
                return r.json()
        except Exception:
            return None
        return None

    # Active alerts at our point
    alerts_payload = await _try_json(
        f"https://api.weather.gov/alerts/active?point={lat},{lon}",
    )
    if alerts_payload and isinstance(alerts_payload.get("features"), list):
        ctx["alerts"] = [
            (f.get("properties") or {})
            for f in alerts_payload["features"]
            if isinstance(f, dict)
        ]
    else:
        ctx["alerts"] = []

    # LSRs (last 2h) + SPC reports today (server-local cache hit)
    lsr = await _try_json("https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours=2")
    if lsr:
        items: list[dict] = []
        for f in (lsr.get("features") or []):
            p = (f.get("properties") or {})
            items.append({
                "type": p.get("type"),
                "city": p.get("city"),
                "state": p.get("st") or p.get("state"),
                "remark": p.get("remark"),
            })
        ctx["lsrs"] = items[:25]
        # Crude category counts
        cats: dict[str, int] = {}
        for it in items:
            t = (it.get("type") or "").upper()
            if "TORNADO" in t: cats["tornado"] = cats.get("tornado", 0) + 1
            elif "HAIL" in t: cats["hail"] = cats.get("hail", 0) + 1
            elif "WND" in t or "WIND" in t: cats["wind"] = cats.get("wind", 0) + 1
            elif "FLOOD" in t: cats["flood"] = cats.get("flood", 0) + 1
        ctx["lsr_by_category"] = cats

    # Local AFD + HWO via our own /text endpoints (avoids re-implementing WFO lookup)
    base = "http://localhost:8000"  # in-process call to ourselves
    afd = await _try_json(f"{base}/text/afd?lat={lat}&lon={lon}")
    if afd:
        ctx["afd_text"] = afd.get("stripped_text") or afd.get("text") or ""
    hwo = await _try_json(f"{base}/text/hwo?lat={lat}&lon={lon}")
    if hwo:
        ctx["hwo_text"] = hwo.get("stripped_text") or hwo.get("text") or ""

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
    return (data.get("response") or "").strip()


@router.get("/now")
async def briefing_now(
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    refresh: bool = Query(False, description="bypass cache and regenerate"),
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
            ctx = await _gather_context(client, lat, lon)
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
    return await coalesce(f"brief:{cache_key}", lambda: _generate_briefing(ctx, lat, lon, fp, cache_key))


async def _generate_briefing(ctx: dict, lat: float, lon: float, fp: str, cache_key: str) -> dict:
    from app.metrics import briefing_duration, briefing_generated
    import time as __t

    # Re-check cache inside the coalesce window — another concurrent caller
    # may have already populated it just before us.
    cached = _cache.get(cache_key)
    if cached:
        return cached

    started = __t.monotonic()
    prompt = _user_prompt(ctx)
    source = "ollama"
    try:
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
        "model": _resolved_model[0] or settings.ollama_model,
        "context": {
            "alerts_count": len(ctx.get("alerts", [])),
            "lsrs_count": len(ctx.get("lsrs", [])),
            "has_afd": bool(ctx.get("afd_text")),
            "has_hwo": bool(ctx.get("hwo_text")),
        },
        "fingerprint": fp,
        "generated_at": _time.time(),
        "cache_ttl_sec": int(_cache.ttl),
        "lat": lat,
        "lon": lon,
    }
    _cache[cache_key] = result
    return result


def _fallback_summary(ctx: dict) -> str:
    """Deterministic 1-sentence summary if Ollama is unreachable."""
    alerts = ctx.get("alerts", [])
    if not alerts:
        return f"No active NWS alerts for {ctx.get('location', 'the area')}. Conditions are quiet."
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
