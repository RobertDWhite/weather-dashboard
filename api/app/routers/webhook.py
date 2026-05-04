"""Outbound webhook fan-out for severe weather notifications.

Posts a Discord/Slack/generic JSON message to each configured target when the
frontend calls /webhook/notify with a new alert. Targets are loaded from the
YAML config (see app/config.py — webhook_targets) or from a single WEBHOOK_URL
env var as a back-compat shim.

Backend dedupes server-side so multiple browser tabs don't fire the same alert
N times.
"""
import time as _time

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import WebhookTarget, webhook_targets

router = APIRouter()

_seen: dict[str, float] = {}
_SEEN_MAX = 1024
_SEEN_TTL = 3600.0

_SEVERITY_RANK = {"minor": 0, "moderate": 1, "severe": 2, "extreme": 3}


class WebhookPayload(BaseModel):
    id: str
    event: str | None = None
    severity: str | None = None
    headline: str | None = None
    area: str | None = None
    expires: str | None = None
    description: str | None = None
    instruction: str | None = None
    url: str | None = None


def _color_for_event(event: str | None) -> int:
    """Embed sidebar color (Discord). Plain ints — no leading 0x in JSON."""
    if not event:
        return 0x94a3b8
    e = event.lower()
    if "tornado emergency" in e or "flash flood emergency" in e:
        return 0xff00ff
    if "tornado" in e:
        return 0xef4444
    if "severe thunderstorm" in e:
        return 0xf97316
    if "flood" in e:
        return 0x22c55e
    if "winter" in e or "blizzard" in e or "ice" in e:
        return 0x60a5fa
    return 0x94a3b8


def _gc_seen():
    now = _time.time()
    if len(_seen) > _SEEN_MAX:
        sorted_items = sorted(_seen.items(), key=lambda kv: kv[1])
        for k, _ in sorted_items[: max(1, _SEEN_MAX // 4)]:
            _seen.pop(k, None)
    expired = [k for k, ts in _seen.items() if now - ts > _SEEN_TTL]
    for k in expired:
        _seen.pop(k, None)


def _passes_filter(target: WebhookTarget, payload: WebhookPayload) -> bool:
    if target.events:
        ev = (payload.event or "").lower()
        if not any(filt.lower() in ev for filt in target.events):
            return False
    if payload.severity:
        rank = _SEVERITY_RANK.get(payload.severity.lower(), 0)
        if rank < _SEVERITY_RANK.get(target.min_severity, 0):
            return False
    return True


def _build_body(target: WebhookTarget, payload: WebhookPayload) -> dict:
    title = payload.event or "Weather alert"
    area = payload.area or ""
    headline = (payload.headline or "")[:1500]
    instruction = (payload.instruction or "")[:500]

    if target.kind == "discord":
        return {
            "username": "Weather Dashboard",
            "embeds": [
                {
                    "title": f"⚠ {title}",
                    "description": headline or area,
                    "color": _color_for_event(payload.event),
                    "fields": [
                        *([{"name": "Area", "value": area[:1000], "inline": False}] if area else []),
                        *([{"name": "Severity", "value": payload.severity, "inline": True}] if payload.severity else []),
                        *([{"name": "Expires", "value": payload.expires, "inline": True}] if payload.expires else []),
                        *([{"name": "Instructions", "value": instruction, "inline": False}] if instruction else []),
                    ],
                    "url": payload.url,
                }
            ],
        }
    if target.kind == "slack":
        text = f"⚠ *{title}* — {area}\n{headline}"
        if instruction:
            text += f"\n\n*Instructions:* {instruction}"
        return {"text": text}
    return {
        "id": payload.id,
        "event": payload.event,
        "severity": payload.severity,
        "headline": payload.headline,
        "area": payload.area,
        "expires": payload.expires,
        "description": payload.description,
        "instruction": payload.instruction,
        "url": payload.url,
    }


async def _deliver(target: WebhookTarget, payload: WebhookPayload) -> dict:
    body = _build_body(target, payload)
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(target.url, json=body)
            r.raise_for_status()
        try:
            from app.metrics import webhook_deliveries
            webhook_deliveries.labels(outcome="sent").inc()
        except Exception:
            pass
        return {"target": target.name, "ok": True, "status": r.status_code}
    except Exception as e:
        try:
            from app.metrics import webhook_deliveries
            webhook_deliveries.labels(outcome="error").inc()
        except Exception:
            pass
        return {"target": target.name, "ok": False, "error": str(e)[:200]}


@router.post("/notify")
async def notify(payload: WebhookPayload):
    if not webhook_targets:
        return {"sent": False, "configured": False, "deduped": False, "results": []}

    _gc_seen()
    if payload.id in _seen:
        return {"sent": False, "configured": True, "deduped": True, "results": []}
    _seen[payload.id] = _time.time()

    matching = [t for t in webhook_targets if _passes_filter(t, payload)]
    if not matching:
        return {"sent": False, "configured": True, "deduped": False, "results": [], "filtered": True}

    import asyncio
    results = await asyncio.gather(*[_deliver(t, payload) for t in matching])
    return {
        "sent": any(r["ok"] for r in results),
        "configured": True,
        "deduped": False,
        "results": list(results),
    }


@router.get("/status")
async def status():
    return {
        "configured": bool(webhook_targets),
        "targets": [
            {"name": t.name, "kind": t.kind, "min_severity": t.min_severity, "events": t.events}
            for t in webhook_targets
        ],
    }


@router.post("/test")
async def test():
    """Send a synthetic test alert through all configured webhooks."""
    if not webhook_targets:
        raise HTTPException(status_code=400, detail="No webhook targets configured")
    payload = WebhookPayload(
        id=f"test-{int(_time.time())}",
        event="Tornado Warning (TEST)",
        severity="extreme",
        headline="This is a test from the Weather Dashboard.",
        area="Test County",
        expires="—",
        instruction="No action required. This is a test.",
    )
    return await notify(payload)
