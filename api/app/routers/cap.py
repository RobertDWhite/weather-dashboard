"""CAP (Common Alerting Protocol) 1.2 feed export. Lets other dashboards or
IPAWS-compatible systems syndicate our active-alerts view as standards-
compliant CAP XML."""
import html
from datetime import datetime, timezone

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Response

from app.config import settings

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=2, ttl=60)
_HEADERS = {"User-Agent": settings.nws_user_agent, "Accept": "application/geo+json"}


_SEVERITY_MAP = {
    "Extreme": "Extreme", "Severe": "Severe",
    "Moderate": "Moderate", "Minor": "Minor", "Unknown": "Unknown",
}
_URGENCY_MAP = {
    "Immediate": "Immediate", "Expected": "Expected",
    "Future": "Future", "Past": "Past", "Unknown": "Unknown",
}


def _xml_escape(s: str | None) -> str:
    return html.escape(str(s or ""), quote=False)


def _to_cap_alert(feature: dict) -> str:
    p = feature.get("properties") or {}
    geom = feature.get("geometry") or {}

    polygon_str = ""
    if geom.get("type") == "Polygon":
        # CAP polygon: "lat,lon lat,lon ..." (lat first, lon second)
        coords = (geom.get("coordinates") or [[]])[0] or []
        polygon_str = " ".join(f"{c[1]:.4f},{c[0]:.4f}" for c in coords)

    # Map NWS event types to CAP event categories (best-effort)
    event = (p.get("event") or "").lower()
    category = "Met"
    if "fire" in event:
        category = "Fire"
    elif "tsunami" in event or "earthquake" in event:
        category = "Geo"
    elif "ice" in event or "winter" in event or "blizzard" in event or "snow" in event:
        category = "Met"

    sent = p.get("sent") or datetime.now(timezone.utc).isoformat()
    effective = p.get("effective") or sent
    expires = p.get("expires") or p.get("ends") or effective

    parts = [
        '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">',
        f'<identifier>{_xml_escape(p.get("id"))}</identifier>',
        f'<sender>{_xml_escape(p.get("senderName") or settings.sender_email)}</sender>',
        f'<sent>{_xml_escape(sent)}</sent>',
        f'<status>{_xml_escape(p.get("status") or "Actual")}</status>',
        f'<msgType>{_xml_escape(p.get("messageType") or "Alert")}</msgType>',
        '<scope>Public</scope>',
        '<info>',
        '<language>en-US</language>',
        f'<category>{category}</category>',
        f'<event>{_xml_escape(p.get("event"))}</event>',
        f'<urgency>{_URGENCY_MAP.get(p.get("urgency", ""), "Unknown")}</urgency>',
        f'<severity>{_SEVERITY_MAP.get(p.get("severity", ""), "Unknown")}</severity>',
        f'<certainty>{_xml_escape(p.get("certainty") or "Unknown")}</certainty>',
        f'<effective>{_xml_escape(effective)}</effective>',
        f'<expires>{_xml_escape(expires)}</expires>',
        f'<senderName>{_xml_escape(p.get("senderName"))}</senderName>',
        f'<headline>{_xml_escape(p.get("headline"))}</headline>',
        f'<description>{_xml_escape(p.get("description"))}</description>',
    ]
    if p.get("instruction"):
        parts.append(f'<instruction>{_xml_escape(p.get("instruction"))}</instruction>')
    parts.extend([
        '<area>',
        f'<areaDesc>{_xml_escape(p.get("areaDesc"))}</areaDesc>',
    ])
    if polygon_str:
        parts.append(f'<polygon>{polygon_str}</polygon>')
    parts.extend([
        '</area>',
        '</info>',
        '</alert>',
    ])
    return "".join(parts)


@router.get("/active.xml")
async def cap_active_xml():
    """Emit currently-active NWS alerts as CAP 1.2 XML wrapped in an Atom feed."""
    if "feed" in _cache:
        return Response(content=_cache["feed"], media_type="application/cap+xml")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://api.weather.gov/alerts/active",
                params={"status": "actual", "message_type": "alert"},
                headers=_HEADERS,
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"alerts unavailable: {e}")

    features = data.get("features") or []
    now_iso = datetime.now(timezone.utc).isoformat()

    alerts_xml = "\n".join(_to_cap_alert(f) for f in features)
    feed_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<feed xmlns="http://www.w3.org/2005/Atom">'
        '<title>Weather Dashboard — Active CAP alerts</title>'
        f'<id>{settings.public_url or "urn:weather-dashboard:cap"}#{now_iso}</id>'
        f'<updated>{now_iso}</updated>'
        f'<author><name>Weather Dashboard</name></author>'
        f'{alerts_xml}'
        '</feed>'
    )
    _cache["feed"] = feed_xml
    return Response(content=feed_xml, media_type="application/cap+xml")
