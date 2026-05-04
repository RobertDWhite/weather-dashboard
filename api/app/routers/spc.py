import csv
import io
import time as _time
from datetime import datetime

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Response

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=20, ttl=900)
# Image proxy cache: keyed by URL, holds (timestamp, content_type, bytes).
# 10-min TTL — most NWS/SPC/WPC products refresh every 10-60 min.
_img_cache: dict[str, tuple[float, str, bytes]] = {}
_IMG_TTL = 600.0
_IMG_MAX_ENTRIES = 30

# Browser-like User-Agent: SPC/WPC return 403 to image requests with the
# vanilla httpx UA when called from the browser via cross-origin <img>.
# Most public mirrors of these products serve fine to a Mozilla UA.
_HEADERS = {"User-Agent": "weather-dashboard (+https://github.com/RobertDWhite/weather-dashboard)"}
_IMG_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; WeatherDashboard/1.0; +https://github.com/"
        "RobertDWhite/whitehouse-rke2)"
    ),
    "Accept": "image/png,image/gif,image/*;q=0.8,*/*;q=0.5",
}


async def _proxy_image(url: str) -> Response:
    """Fetch an image upstream and stream it back. Cached server-side and
    coalesced so concurrent cache misses for the same URL share a single
    upstream fetch. Returns Cache-Control headers so browsers also cache."""
    from app.coalesce import coalesce

    now = _time.time()
    cached = _img_cache.get(url)
    if cached and now - cached[0] < _IMG_TTL:
        return Response(
            content=cached[2],
            media_type=cached[1],
            headers={"Cache-Control": "public, max-age=300"},
        )

    async def _fetch() -> tuple[str, bytes]:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers=_IMG_HEADERS)
            r.raise_for_status()
        ctype = r.headers.get("content-type", "image/png").split(";")[0].strip()
        body = r.content
        _img_cache[url] = (_time.time(), ctype, body)
        # Bound cache size
        if len(_img_cache) > _IMG_MAX_ENTRIES:
            oldest = sorted(_img_cache.items(), key=lambda kv: kv[1][0])[: len(_img_cache) - _IMG_MAX_ENTRIES]
            for k, _ in oldest:
                _img_cache.pop(k, None)
        return ctype, body

    try:
        ctype, body = await coalesce(f"img:{url}", _fetch)
    except Exception as e:
        # If we have a stale cached version, return it rather than 502.
        if cached:
            return Response(
                content=cached[2], media_type=cached[1],
                headers={"Cache-Control": "public, max-age=60"},
            )
        raise HTTPException(status_code=502, detail=f"image fetch failed: {e}")

    return Response(
        content=body,
        media_type=ctype,
        headers={"Cache-Control": "public, max-age=300"},
    )


# ── Image proxy endpoints — bypass cross-origin / referer blocks ────

_OUTLOOK_URL = {
    "day1": "https://www.spc.noaa.gov/products/outlook/day1otlk.png",
    "day2": "https://www.spc.noaa.gov/products/outlook/day2otlk.png",
    "day3": "https://www.spc.noaa.gov/products/outlook/day3otlk.png",
}


@router.get("/outlook-image/{day}")
async def outlook_image(day: str):
    """Proxy SPC convective outlook image. Bypasses SPC's cross-origin / referer
    block that prevents browsers from loading the .png directly."""
    url = _OUTLOOK_URL.get(day)
    if not url:
        raise HTTPException(status_code=404, detail=f"unknown day {day}")
    return await _proxy_image(url)


_PROXY_OPTS: dict[str, str] = {
    # WPC products
    "wpc/fronts": "https://www.wpc.ncep.noaa.gov/sfc/usfntsfcwbg.gif",
    "wpc/qpf24": "https://www.wpc.ncep.noaa.gov/qpf/fill_94qwbg.gif",
    "wpc/qpf120": "https://www.wpc.ncep.noaa.gov/qpf/p120i.gif",
    "wpc/ero1": "https://www.wpc.ncep.noaa.gov/qpf/94ewbg.gif",
    # WPC winter products — snow probability
    "wpc/snow24_4in": "https://www.wpc.ncep.noaa.gov/wwd/24hr_snow_prob_4in.gif",
    "wpc/snow24_8in": "https://www.wpc.ncep.noaa.gov/wwd/24hr_snow_prob_8in.gif",
    "wpc/snow72_8in": "https://www.wpc.ncep.noaa.gov/wwd/72hr_snow_prob_8in.gif",
    "wpc/ice24_quarter": "https://www.wpc.ncep.noaa.gov/wwd/24hr_ice_prob_qtr.gif",
}


@router.get("/proxy/{provider}/{view}")
async def proxy_provider(provider: str, view: str):
    """Generic image proxy keyed by provider/view."""
    key = f"{provider}/{view}"
    url = _PROXY_OPTS.get(key)
    if not url:
        raise HTTPException(status_code=404, detail=f"unknown image {key}")
    return await _proxy_image(url)


# Mesoanalysis proxy: /spc/proxy/meso/{sector}/{param}.
# We allow any well-formed sector/param token to flow through so the
# mesoanalysis catalog can grow without us redeploying.
import re as _re_meso

_MESO_TOKEN_RE = _re_meso.compile(r"^[a-zA-Z0-9_]{1,12}$")


@router.get("/proxy/meso/{sector}/{param}")
async def proxy_meso(sector: str, param: str):
    if not (_MESO_TOKEN_RE.match(sector) and _MESO_TOKEN_RE.match(param)):
        raise HTTPException(status_code=400, detail="invalid sector/param")
    url = f"https://www.spc.noaa.gov/exper/mesoanalysis/{sector}/{param}/{param}.gif"
    return await _proxy_image(url)


# Optional convenience wrapper used by the frontend to look up which keys
# are available without hard-coding them client-side.
@router.get("/proxy")
async def list_proxies():
    return {"available": list(_PROXY_OPTS.keys()) + ["outlook-image/day1", "outlook-image/day2", "outlook-image/day3"]}




@router.get("/outlook/day1")
async def get_day1_outlook():
    if "day1_cat" in _cache:
        return _cache["day1_cat"]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson",
                headers=_HEADERS,
            )
            r.raise_for_status()
            data = r.json()
            _cache["day1_cat"] = data
            return data
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/outlook/day1/tornado")
async def get_day1_tornado():
    if "day1_torn" in _cache:
        return _cache["day1_torn"]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson",
                headers=_HEADERS,
            )
            r.raise_for_status()
            data = r.json()
            _cache["day1_torn"] = data
            return data
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/outlook/day2")
async def get_day2_outlook():
    if "day2_cat" in _cache:
        return _cache["day2_cat"]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://www.spc.noaa.gov/products/outlook/day2otlk_cat.nolyr.geojson",
                headers=_HEADERS,
            )
            r.raise_for_status()
            data = r.json()
            _cache["day2_cat"] = data
            return data
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/reports")
async def get_storm_reports():
    if "reports" in _cache:
        return _cache["reports"]
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            reports: dict = {"tornado": [], "hail": [], "wind": [], "total": 0}
            type_map = {
                "torn": ("tornado", "magnitude", "F_Scale"),
                "hail": ("hail", "size", "Size"),
                "wind": ("wind", "speed", "Speed"),
            }
            for key, (rtype, extra_key, csv_col) in type_map.items():
                r = await client.get(
                    f"https://www.spc.noaa.gov/climo/reports/today_filtered_{key}.csv",
                    headers=_HEADERS,
                )
                if r.status_code != 200 or not r.text.strip():
                    continue
                reader = csv.DictReader(io.StringIO(r.text))
                for row in reader:
                    try:
                        lat = float(row.get("Lat") or 0)
                        lon = float(row.get("Lon") or 0)
                        if not lat or not lon:
                            continue
                        entry = {
                            "time": row.get("Time", ""),
                            "location": row.get("Location", ""),
                            "county": row.get("County", ""),
                            "state": row.get("State", ""),
                            "lat": lat,
                            "lon": lon,
                            "comment": row.get("Comments", ""),
                            extra_key: row.get(csv_col, ""),
                        }
                        reports[rtype].append(entry)
                    except (ValueError, KeyError):
                        continue
                reports[rtype].sort(key=lambda x: x.get("time", ""), reverse=True)

            reports["total"] = (
                len(reports["tornado"]) + len(reports["hail"]) + len(reports["wind"])
            )
            reports["generated"] = datetime.utcnow().isoformat() + "Z"
            _cache["reports"] = reports
            return reports
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/mesoscale")
async def get_mesoscale():
    """Active mesoscale discussions (raw XML — kept for backward compat)."""
    if "meso" in _cache:
        return _cache["meso"]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://www.spc.noaa.gov/products/spcmdrss.xml",
                headers=_HEADERS,
            )
            result = {"raw": r.text if r.status_code == 200 else ""}
            _cache["meso"] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


def _extract_xml(block: str, tag: str) -> str | None:
    import re as _re
    m = _re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", block, _re.DOTALL | _re.IGNORECASE)
    return m.group(1).strip() if m else None


# NOAA ArcGIS GeoJSON endpoints — these are the canonical sources for active
# SPC mesoscale discussion polygons + WWA watches/warnings/advisories.
_ARCGIS_MD = (
    "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/"
    "spc_mesoscale_discussion/MapServer/0/query"
    "?where=1%3D1&outFields=*&f=geojson"
)
_ARCGIS_WWA = (
    "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/"
    "watch_warn_adv/MapServer/0/query"
    "?where=prod_type%20IN%20(%27Tornado%20Watch%27%2C%27Severe%20Thunderstorm%20Watch%27)"
    "&outFields=*&f=geojson"
)


@router.get("/mesoscale/json")
async def get_mesoscale_json():
    """Parsed list of active SPC mesoscale discussions, plus polygon GeoJSON when
    available. Mesoscale discussions identify short-fused convective threats.

    Combines two sources:
      - SPC MD RSS feed for text/title/link/timestamp metadata
      - NOAA ArcGIS feature service for polygon geometry (one bulk fetch)
    """
    import asyncio as _asyncio
    import re as _re

    if "meso_json" in _cache:
        return _cache["meso_json"]

    async with httpx.AsyncClient(timeout=15) as client:
        async def _fetch_rss() -> str:
            try:
                rr = await client.get(
                    "https://www.spc.noaa.gov/products/spcmdrss.xml",
                    headers=_HEADERS,
                    timeout=10,
                )
                return rr.text if rr.status_code == 200 else ""
            except Exception:
                return ""

        async def _fetch_geo() -> dict:
            try:
                rr = await client.get(_ARCGIS_MD, headers=_HEADERS, timeout=10)
                if rr.status_code == 200:
                    return rr.json()
            except Exception:
                pass
            return {}

        try:
            rss_xml, geo_fc = await _asyncio.wait_for(
                _asyncio.gather(_fetch_rss(), _fetch_geo()), timeout=20,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

        # Parse RSS items
        items: list[dict] = []
        for m in _re.finditer(r"<item>(.*?)</item>", rss_xml, _re.DOTALL):
            block = m.group(1)
            link = _extract_xml(block, "link") or ""
            num_match = _re.search(r"md(\d{4})", link)
            md_num = num_match.group(1) if num_match else None
            items.append({
                "title": _extract_xml(block, "title"),
                "link": link,
                "pub_date": _extract_xml(block, "pubDate"),
                "description": _extract_xml(block, "description"),
                "md_num": md_num,
                "geometry": None,
            })

        # Index ArcGIS features by MD number (extracted from "Name" or "FolderPath")
        geo_by_num: dict[str, dict] = {}
        for f in (geo_fc.get("features") or []):
            props = (f.get("properties") or {})
            label = str(props.get("Name") or props.get("FolderPath") or "")
            mm = _re.search(r"\b(\d{4})\b", label)
            if mm:
                geo_by_num[mm.group(1)] = {
                    "type": "FeatureCollection",
                    "features": [f],
                }

        # If RSS produced no items but ArcGIS has features, synthesize entries
        if not items and geo_fc.get("features"):
            for num, gc in geo_by_num.items():
                feat = (gc.get("features") or [{}])[0]
                props = feat.get("properties") or {}
                items.append({
                    "title": f"Mesoscale Discussion {num}",
                    "link": f"https://www.spc.noaa.gov/products/md/md{num}.html",
                    "pub_date": None,
                    "description": props.get("FolderPath"),
                    "md_num": num,
                    "geometry": gc,
                })
        else:
            for it in items:
                num = it.get("md_num")
                if num and num in geo_by_num:
                    it["geometry"] = geo_by_num[num]

        result = {"items": items, "count": len(items)}
        _cache["meso_json"] = result
        return result


@router.get("/watches")
async def get_watches():
    """Active SPC convective watches (Tornado / Severe Thunderstorm watch boxes)
    with polygon geometry, sourced from the canonical NOAA WWA ArcGIS service.

    Note: this returns watches only; warnings come through `nws/alerts`.
    """
    if "watches" in _cache:
        return _cache["watches"]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(_ARCGIS_WWA, headers=_HEADERS, timeout=12)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

        feats = data.get("features") or []
        watches: list[dict] = []
        for f in feats:
            props = (f.get("properties") or {}) if isinstance(f, dict) else {}
            if not isinstance(props, dict):
                continue
            # ArcGIS WWA fields: prod_type, event, msg_type, phenom, sig,
            # wfo, expiration (epoch ms or ISO), issuance, url, headline.
            event = props.get("prod_type") or props.get("event")
            headline = (props.get("headline") or "")
            is_pds = "PARTICULARLY DANGEROUS SITUATION" in headline.upper() \
                or "PDS" in str(props.get("phenom") or "").upper()

            def _ts(v):
                if v is None:
                    return None
                # ArcGIS often returns epoch ms — convert to ISO for the UI
                if isinstance(v, (int, float)):
                    from datetime import datetime, timezone
                    try:
                        return datetime.fromtimestamp(v / 1000, tz=timezone.utc).isoformat()
                    except (OverflowError, OSError, ValueError):
                        return str(v)
                return str(v)

            watches.append({
                "ww": props.get("vtec_etn") or props.get("etn") or props.get("objectid") or props.get("id"),
                "type": event,
                "issued": _ts(props.get("issuance")) or _ts(props.get("vtec_start")),
                "expires": _ts(props.get("expiration")) or _ts(props.get("vtec_end")),
                "is_pds": is_pds,
                "max_hail_in": props.get("max_hail_in") or props.get("max_hail"),
                "max_wind_kt": props.get("max_wind_kt") or props.get("max_wind"),
                "tornado_prob": props.get("tornado_prob"),
                "raw_text_url": props.get("url") or props.get("prod_url"),
                "headline": headline or None,
                "wfo": props.get("wfo"),
                "geometry": f.get("geometry") if isinstance(f, dict) else None,
            })

        result = {"watches": watches, "count": len(watches)}
        _cache["watches"] = result
        return result
