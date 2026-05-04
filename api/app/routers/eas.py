"""EAS (Emergency Alert System) ingest endpoint. Designed to be POST'd to
by the SDR cluster's NWR (NOAA Weather Radio) decoder when it sees a SAME
header. The dashboard surfaces these in real time — typically several
seconds before NWS api.weather.gov publishes the same alert.

Storage: in-memory ring buffer (last 200 events) + persisted to the same
SQLite DB the time-machine uses, table `eas_events`."""
import asyncio
import json
import sqlite3
import time
from collections import deque
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()

_buffer: deque = deque(maxlen=200)
_subscribers: list[asyncio.Queue] = []
_db_lock = asyncio.Lock()


class EasEvent(BaseModel):
    same_code: Optional[str] = None         # e.g. "WXR-TOR-039165+0030-1241830"
    originator: Optional[str] = None        # WXR / EAS / CIV / PEP
    event_code: Optional[str] = None        # TOR / SVR / FFW / EAN ...
    event_name: Optional[str] = None        # plain-English event
    fips_codes: list[str] = []              # affected FIPS area codes
    issued_utc: Optional[str] = None        # when broadcast
    duration_min: Optional[int] = None
    station_id: Optional[str] = None        # transmitting WX office
    audio_url: Optional[str] = None         # optional pointer to recording
    raw_message: Optional[str] = None       # full SAME burst text
    source_pod: Optional[str] = None        # which SDR pod decoded it


def _ensure_table() -> None:
    """Create the eas_events table in the time-machine DB if needed."""
    path = settings.timemachine_db_path
    try:
        conn = sqlite3.connect(path, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS eas_events (
                ts INTEGER NOT NULL,
                same_code TEXT,
                originator TEXT,
                event_code TEXT,
                event_name TEXT,
                fips_codes TEXT,
                issued_utc TEXT,
                duration_min INTEGER,
                station_id TEXT,
                audio_url TEXT,
                raw_message TEXT,
                source_pod TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_eas_ts ON eas_events(ts DESC)")
        conn.close()
    except Exception:
        pass


_ensure_table()


@router.post("/event")
async def post_event(event: EasEvent):
    """Ingest one decoded SAME/EAS event. Called by the SDR-cluster decoder."""
    rec = event.model_dump()
    rec["received_ts"] = int(time.time())
    _buffer.appendleft(rec)

    # Persist (best-effort)
    async with _db_lock:
        try:
            conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
            conn.execute(
                "INSERT INTO eas_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    rec["received_ts"], rec.get("same_code"), rec.get("originator"),
                    rec.get("event_code"), rec.get("event_name"),
                    json.dumps(rec.get("fips_codes") or []),
                    rec.get("issued_utc"), rec.get("duration_min"),
                    rec.get("station_id"), rec.get("audio_url"),
                    rec.get("raw_message"), rec.get("source_pod"),
                ),
            )
            conn.close()
        except Exception:
            pass

    # Fan out to SSE subscribers
    for q in list(_subscribers):
        try:
            q.put_nowait(rec)
        except asyncio.QueueFull:
            pass

    return {"received": True, "ts": rec["received_ts"]}


@router.get("/recent")
async def get_recent(limit: int = 50):
    """In-memory recent events (most recent first)."""
    return {"events": list(_buffer)[:limit], "count": min(len(_buffer), limit)}


@router.get("/history")
async def get_history(hours: int = 24):
    """Historical EAS events from the SQLite store."""
    cutoff = int(time.time()) - hours * 3600
    try:
        conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
        rows = conn.execute(
            "SELECT ts, same_code, originator, event_code, event_name, "
            "fips_codes, issued_utc, duration_min, station_id, source_pod "
            "FROM eas_events WHERE ts >= ? ORDER BY ts DESC LIMIT 500",
            (cutoff,),
        ).fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    out = [
        {
            "ts": r[0], "same_code": r[1], "originator": r[2],
            "event_code": r[3], "event_name": r[4],
            "fips_codes": json.loads(r[5] or "[]"),
            "issued_utc": r[6], "duration_min": r[7],
            "station_id": r[8], "source_pod": r[9],
        }
        for r in rows
    ]
    return {"events": out, "count": len(out)}
