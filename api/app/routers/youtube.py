import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from cachetools import TTLCache
from app.config import settings

router = APIRouter()

# 10-minute cache — each search costs 100 units, 10k/day free limit
_cache: TTLCache = TTLCache(maxsize=128, ttl=600)

YOUTUBE_SEARCH = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS = "https://www.googleapis.com/youtube/v3/videos"

# Pinned weather channels to always monitor for live status
PINNED_CHANNELS = {
    "UCvXIFPMKQ2s4cHlT-dBiPCg": "Ryan Hall, Y'all",
    # Add more channel IDs here as needed
}

_pinned_cache: TTLCache = TTLCache(maxsize=1, ttl=120)  # 2-minute check interval


def _parse_result(item: dict) -> dict:
    vid_id = item["id"]["videoId"]
    thumbs = item["snippet"].get("thumbnails", {})
    thumb = (thumbs.get("medium") or thumbs.get("high") or thumbs.get("default") or {}).get("url")
    return {
        "id": vid_id,
        "title": item["snippet"]["title"],
        "channel": item["snippet"]["channelTitle"],
        "description": item["snippet"]["description"][:200],
        "thumbnail": thumb,
        "published_at": item["snippet"]["publishedAt"],
        "watch_url": f"https://www.youtube.com/watch?v={vid_id}",
        "embed_url": f"https://www.youtube.com/embed/{vid_id}?autoplay=1&mute=1",
    }


async def _search(params: dict) -> list:
    params["key"] = settings.youtube_key
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(YOUTUBE_SEARCH, params=params)
    if resp.status_code == 403:
        reason = resp.json().get("error", {}).get("errors", [{}])[0].get("reason", "")
        if reason == "quotaExceeded":
            raise HTTPException(status_code=429, detail="YouTube quota exceeded for today")
        raise HTTPException(status_code=403, detail=resp.text)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return [_parse_result(i) for i in resp.json().get("items", []) if i.get("id", {}).get("videoId")]


@router.get("/live")
async def youtube_live(
    lat: Optional[float] = Query(default=None),
    lon: Optional[float] = Query(default=None),
    radius: str = Query(default="100km"),
    q: Optional[str] = Query(default=None),
    max_results: int = Query(default=10, le=25),
):
    """
    Search for live YouTube streams.
    - With q: keyword search (best for alerts — uses event name + county names)
    - With lat/lon: location-radius search (for home station area)
    - Both can be combined to merge results
    """
    if not settings.youtube_key:
        raise HTTPException(status_code=503, detail="YouTube API key not configured")

    cache_key = f"q={q}|loc={lat:.2f},{lon:.2f}|r={radius}" if lat and lon else f"q={q}"
    if cache_key in _cache:
        return _cache[cache_key]

    base = {"part": "snippet", "type": "video", "eventType": "live",
            "order": "relevance", "relevanceLanguage": "en", "maxResults": max_results}

    seen: set[str] = set()
    results: list[dict] = []

    # Terms that bias results toward relevant live feeds without over-restricting
    WEATHER_FILTER = "weather OR storm OR tornado OR traffic OR radar OR news OR camera OR webcam OR \"live cam\" OR \"shelter in place\" OR emergency"

    # Keyword search — most reliable for alert-area streams
    if q:
        # Combine the specific alert query with a relevance filter
        full_q = f"({q}) ({WEATHER_FILTER})"
        kw_results = await _search({**base, "q": full_q})
        for r in kw_results:
            if r["id"] not in seen:
                seen.add(r["id"])
                results.append(r)

    # Location search — for home station; filter to weather/traffic/cam streams
    if lat is not None and lon is not None:
        loc_results = await _search({
            **base,
            "location": f"{lat},{lon}",
            "locationRadius": radius,
            "q": WEATHER_FILTER,
            "maxResults": max(5, max_results - len(results)),
        })
        for r in loc_results:
            if r["id"] not in seen:
                seen.add(r["id"])
                results.append(r)

    _cache[cache_key] = results
    return results


@router.get("/pinned-live")
async def pinned_channels_live():
    """
    Check whether any pinned weather channels are currently live.
    Uses search (100 units each) but cached for 2 minutes to limit spend.
    Returns only channels that are actively streaming right now.
    """
    if not settings.youtube_key:
        raise HTTPException(status_code=503, detail="YouTube API key not configured")

    if "result" in _pinned_cache:
        return _pinned_cache["result"]

    live_streams = []
    async with httpx.AsyncClient(timeout=10) as client:
        for channel_id, channel_name in PINNED_CHANNELS.items():
            params = {
                "part": "snippet",
                "channelId": channel_id,
                "type": "video",
                "eventType": "live",
                "maxResults": 1,
                "key": settings.youtube_key,
            }
            resp = await client.get(YOUTUBE_SEARCH, params=params)
            if resp.status_code != 200:
                continue
            items = resp.json().get("items", [])
            for item in items:
                vid_id = item.get("id", {}).get("videoId")
                if not vid_id:
                    continue
                live_streams.append({
                    **_parse_result(item),
                    "channel_label": channel_name,
                    "pinned": True,
                })

    _pinned_cache["result"] = live_streams
    return live_streams
