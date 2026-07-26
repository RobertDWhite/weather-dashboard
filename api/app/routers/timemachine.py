"""Time machine: SQLite-backed snapshot history of operationally-significant
state (alerts, LSRs, storm reports, watches). Background task in lifespan()
captures a snapshot every TIMEMACHINE_INTERVAL_SEC; old snapshots get pruned
past TIMEMACHINE_RETENTION_HOURS.

UI uses /timemachine/snapshots for the scrubber timeline + /timemachine/at to
fetch the snapshot nearest a target timestamp."""
import asyncio
import gzip
import json
import os
import sqlite3
import time as _time

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
_HEADERS = {"User-Agent": settings.nws_user_agent, "Accept": "application/geo+json"}

# Module-level connection (SQLite is fine for single-writer + many-readers when
# one process owns the file — which is our case)
_conn: sqlite3.Connection | None = None
_lock = asyncio.Lock()
_ready = False
_db_error_until = 0.0


def _db_unavailable_response() -> dict:
    return {
        "ready": False,
        "interval_sec": settings.timemachine_interval_sec,
        "retention_hours": settings.timemachine_retention_hours,
        "count": 0,
        "snapshots": [],
        "error": "time machine storage is temporarily unavailable",
    }


def _mark_db_error() -> None:
    global _db_error_until
    # Avoid repeatedly touching a degraded network block device from the
    # request path. The snapshotter will retry after this short circuit.
    _db_error_until = _time.time() + 60


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        path = settings.timemachine_db_path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        _conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        _conn.execute("PRAGMA busy_timeout=500")
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS snapshot (
                ts INTEGER PRIMARY KEY,
                alert_count INTEGER NOT NULL,
                lsr_count INTEGER NOT NULL,
                tornado_count INTEGER NOT NULL,
                hail_count INTEGER NOT NULL,
                wind_count INTEGER NOT NULL,
                payload BLOB NOT NULL  -- gzipped JSON of full snapshot
            )
        """)
        _conn.execute("CREATE INDEX IF NOT EXISTS ix_snapshot_ts ON snapshot(ts DESC)")
    return _conn


async def _fetch_snapshot(client: httpx.AsyncClient) -> dict | None:
    """Pull the smallest set of dynamic state we want to replay. Best-effort:
    if any sub-fetch fails, we fall back to empty for that section."""
    lat = settings.observer_lat
    lon = settings.observer_lon
    out: dict = {"ts": int(_time.time()), "lat": lat, "lon": lon}

    async def _try(url: str):
        try:
            r = await client.get(url, headers=_HEADERS, timeout=12)
            if r.status_code == 200:
                return r.json()
        except Exception:
            return None
        return None

    alerts = await _try("https://api.weather.gov/alerts/active")
    out["alerts"] = alerts or {"features": []}

    lsr = await _try("https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours=2")
    out["lsrs"] = lsr or {"features": []}

    return out


def _summary_counts(snap: dict) -> dict:
    """Summary integer counts for fast indexing of snapshots."""
    alerts = ((snap.get("alerts") or {}).get("features")) or []
    lsrs = ((snap.get("lsrs") or {}).get("features")) or []
    tor = sum(1 for f in alerts if (f.get("properties") or {}).get("event", "").lower().startswith("tornado warn"))
    hail = sum(1 for f in lsrs if "HAIL" in ((f.get("properties") or {}).get("type") or "").upper())
    wind = sum(1 for f in lsrs if "WND" in ((f.get("properties") or {}).get("type") or "").upper())
    return {
        "alert_count": len(alerts),
        "lsr_count": len(lsrs),
        "tornado_count": tor,
        "hail_count": hail,
        "wind_count": wind,
    }


_seen_event_keys: set[str] = set()


async def _persist_snapshot(snap: dict) -> None:
    if _time.time() < _db_error_until:
        return
    counts = _summary_counts(snap)
    payload = gzip.compress(json.dumps(snap).encode("utf-8"))
    async with _lock:
        conn = _connect()
        conn.execute(
            "INSERT OR REPLACE INTO snapshot (ts, alert_count, lsr_count, tornado_count, hail_count, wind_count, payload) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (snap["ts"], counts["alert_count"], counts["lsr_count"],
             counts["tornado_count"], counts["hail_count"], counts["wind_count"], payload),
        )
        # Prune
        cutoff = int(_time.time()) - settings.timemachine_retention_hours * 3600
        conn.execute("DELETE FROM snapshot WHERE ts < ?", (cutoff,))

    # Fan out web push for new urgent alerts
    await _maybe_push_new_alerts(snap)


async def _maybe_push_new_alerts(snap: dict) -> None:
    """Detect newly-arrived urgent alerts (Tornado / Severe / FFE) since the
    last snapshot, fan-out via VAPID web push. Server-side dedupe by VTEC
    event-key so the same warning doesn't push twice."""
    try:
        from app import vtec as vtec_mod
        from app.routers.webpush import fan_out
    except Exception:
        return

    features = ((snap.get("alerts") or {}).get("features")) or []
    URGENT = {"Tornado Warning", "Tornado Emergency", "Flash Flood Emergency",
              "Severe Thunderstorm Warning", "Snow Squall Warning",
              "Extreme Wind Warning", "Dust Storm Warning"}
    for f in features:
        p = f.get("properties") or {}
        if p.get("event") not in URGENT:
            continue
        event_key = vtec_mod.derive_event_key(p) or p.get("id")
        if not event_key or event_key in _seen_event_keys:
            continue
        _seen_event_keys.add(event_key)
        # Cap memory; rare to need >5k unique events in a session
        if len(_seen_event_keys) > 5000:
            _seen_event_keys.clear()
        try:
            await fan_out({
                "title": p.get("event") or "Weather alert",
                "body": (p.get("areaDesc") or "")[:250],
                "tag": event_key,
                "url": "/",
                "severity": p.get("severity"),
            }, dedupe_key=event_key)
        except Exception:
            pass


async def snapshot_loop():
    """Background task — runs forever inside the FastAPI lifespan. Sleeps on
    cancellation cleanly."""
    global _ready
    interval = max(15, settings.timemachine_interval_sec)
    print(f"[timemachine] starting snapshotter, interval={interval}s, db={settings.timemachine_db_path}")
    async with httpx.AsyncClient() as client:
        while True:
            try:
                snap = await _fetch_snapshot(client)
                if snap is not None:
                    await _persist_snapshot(snap)
                    _ready = True
                    try:
                        from app.metrics import snapshots_written
                        snapshots_written.inc()
                    except Exception:
                        pass
            except asyncio.CancelledError:
                raise
            except Exception as e:
                if isinstance(e, (OSError, sqlite3.Error)):
                    _mark_db_error()
                print(f"[timemachine] snapshot error: {e}")
                try:
                    from app.metrics import snapshot_errors
                    snapshot_errors.inc()
                except Exception:
                    pass
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break


# ── HTTP endpoints ────────────────────────────────────────────────

@router.get("/snapshots")
async def list_snapshots(
    hours: int = Query(6, ge=1, le=24),
):
    """Return timestamps + summary counts for snapshots in the last N hours."""
    if _time.time() < _db_error_until:
        return _db_unavailable_response()
    try:
        conn = _connect()
        cutoff = int(_time.time()) - hours * 3600
        rows = conn.execute(
            "SELECT ts, alert_count, lsr_count, tornado_count, hail_count, wind_count "
            "FROM snapshot WHERE ts >= ? ORDER BY ts ASC",
            (cutoff,),
        ).fetchall()
    except (OSError, sqlite3.Error) as exc:
        # The UI should remain usable while a fresh PVC is mounting or the
        # database is being recovered. An empty, explicit response is more
        # useful than a generic 500 and lets the scrubber retry later.
        _mark_db_error()
        return {**_db_unavailable_response(), "error": f"time machine unavailable: {exc}"}
    return {
        "ready": _ready,
        "interval_sec": settings.timemachine_interval_sec,
        "retention_hours": settings.timemachine_retention_hours,
        "count": len(rows),
        "snapshots": [
            {
                "ts": r[0],
                "alert_count": r[1],
                "lsr_count": r[2],
                "tornado_count": r[3],
                "hail_count": r[4],
                "wind_count": r[5],
            }
            for r in rows
        ],
    }


@router.get("/at")
async def snapshot_at(
    ts: int = Query(..., description="Unix epoch seconds for the desired snapshot"),
):
    """Return the snapshot whose timestamp is nearest the requested ts.
    The full alerts/LSRs payloads are included verbatim so the UI can render
    them with the same components used in live mode."""
    if _time.time() < _db_error_until:
        raise HTTPException(status_code=503, detail="time machine storage is temporarily unavailable")
    try:
        conn = _connect()
        # Get nearest snapshot by absolute time delta
        row = conn.execute(
            "SELECT ts, payload FROM snapshot ORDER BY ABS(ts - ?) ASC LIMIT 1",
            (ts,),
        ).fetchone()
    except (OSError, sqlite3.Error) as exc:
        _mark_db_error()
        raise HTTPException(status_code=503, detail=f"time machine storage unavailable: {exc}")
    if not row:
        raise HTTPException(status_code=404, detail="no snapshots available yet")
    snap_ts = row[0]
    blob = row[1]
    try:
        snap = json.loads(gzip.decompress(blob).decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"snapshot decode failed: {e}")
    snap["snapshot_ts"] = snap_ts
    return snap
