"""VAPID web push — real OS-level push notifications, lockscreen alerts even
when the dashboard tab is closed. Subscribers stored in SQLite (alongside
the time-machine DB). VAPID keys generated on first run; public key
returned via /webpush/key for the service worker to use during subscription.
"""
import asyncio
import base64
import json
import os
import sqlite3
import time
from typing import Optional

from cachetools import TTLCache
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()

# Optional dependency — if pywebpush isn't installed, push delivery is disabled
# but subscription endpoints still work.
try:
    from pywebpush import WebPushException, webpush
    _HAVE_PUSH = True
except ImportError:
    webpush = None  # type: ignore
    WebPushException = Exception  # type: ignore
    _HAVE_PUSH = False

try:
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    _HAVE_CRYPTO = True
except ImportError:
    _HAVE_CRYPTO = False


_VAPID_KEY_PATH = "/data/vapid_keys.json"
_dedupe_cache: TTLCache = TTLCache(maxsize=1024, ttl=3600)


def _b64url_no_pad(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _ensure_vapid_keys() -> dict:
    """Create or load the VAPID key pair. Stored on the time-machine PVC so
    it survives restarts and stays consistent across browser subscriptions."""
    if os.path.exists(_VAPID_KEY_PATH):
        try:
            with open(_VAPID_KEY_PATH) as fh:
                return json.load(fh)
        except Exception:
            pass

    if not _HAVE_CRYPTO:
        return {"public": "", "private": "", "ready": False}

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    private_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")

    keys = {
        "public": _b64url_no_pad(public_bytes),
        # pywebpush expects the PEM (base64) form
        "private_pem": private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode(),
        "private_raw": _b64url_no_pad(private_bytes),
        "ready": True,
    }
    try:
        os.makedirs(os.path.dirname(_VAPID_KEY_PATH), exist_ok=True)
        with open(_VAPID_KEY_PATH, "w") as fh:
            json.dump(keys, fh)
    except Exception:
        pass
    return keys


_keys = _ensure_vapid_keys()


def _ensure_table() -> None:
    try:
        conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                endpoint TEXT PRIMARY KEY,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_ts INTEGER NOT NULL,
                user_agent TEXT,
                last_seen_ts INTEGER
            )
        """)
        conn.close()
    except Exception:
        pass


_ensure_table()


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscription(BaseModel):
    endpoint: str
    keys: PushKeys
    user_agent: Optional[str] = None


@router.get("/key")
async def get_public_key():
    """Return the VAPID public key (base64url, no padding) for the service
    worker's `applicationServerKey`. Also reports whether push delivery is
    actually enabled server-side."""
    return {
        "public_key": _keys.get("public", ""),
        "ready": _keys.get("ready", False) and _HAVE_PUSH,
        "have_pywebpush": _HAVE_PUSH,
    }


@router.post("/subscribe")
async def subscribe(sub: PushSubscription):
    """Register a browser push subscription."""
    try:
        conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
        conn.execute(
            "INSERT OR REPLACE INTO push_subscriptions "
            "(endpoint, p256dh, auth, created_ts, user_agent, last_seen_ts) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (sub.endpoint, sub.keys.p256dh, sub.keys.auth,
             int(time.time()), (sub.user_agent or "")[:200], int(time.time())),
        )
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"subscribed": True}


@router.post("/unsubscribe")
async def unsubscribe(sub: dict):
    endpoint = sub.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint required")
    try:
        conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        conn.close()
    except Exception:
        pass
    return {"unsubscribed": True}


@router.get("/status")
async def status():
    try:
        conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
        n = conn.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0]
        conn.close()
    except Exception:
        n = 0
    return {
        "ready": _keys.get("ready", False) and _HAVE_PUSH,
        "subscribers": n,
        "have_pywebpush": _HAVE_PUSH,
        "have_cryptography": _HAVE_CRYPTO,
    }


async def fan_out(payload: dict, dedupe_key: str | None = None) -> dict:
    """Send `payload` to every subscriber. Used internally by the alert
    snapshotter when a new tornado warning lands. Server-side dedupe so
    replays don't double-fire."""
    if not _HAVE_PUSH or not _keys.get("ready"):
        return {"sent": 0, "skipped": "push unavailable"}
    if dedupe_key:
        if dedupe_key in _dedupe_cache:
            return {"sent": 0, "skipped": "deduped"}
        _dedupe_cache[dedupe_key] = True

    rows = []
    try:
        conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
        rows = conn.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions"
        ).fetchall()
        conn.close()
    except Exception:
        return {"sent": 0, "error": "db"}

    sent = 0
    failed: list[str] = []

    def _push_one(endpoint: str, p256dh: str, auth: str) -> bool:
        try:
            webpush(  # type: ignore[misc]
                subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
                data=json.dumps(payload),
                vapid_private_key=_keys.get("private_pem"),
                vapid_claims={"sub": f"mailto:{settings.sender_email}"},
            )
            return True
        except WebPushException as exc:  # type: ignore
            # 410 / 404 → subscription dead; mark for cleanup
            resp = getattr(exc, "response", None)
            if resp is not None and resp.status_code in (404, 410):
                failed.append(endpoint)
            return False
        except Exception:
            return False

    # Run pushes in a thread pool — pywebpush is synchronous
    loop = asyncio.get_running_loop()
    results = await asyncio.gather(*[
        loop.run_in_executor(None, _push_one, e, p, a) for e, p, a in rows
    ])
    sent = sum(1 for r in results if r)

    # Clean up dead subscriptions
    if failed:
        try:
            conn = sqlite3.connect(settings.timemachine_db_path, isolation_level=None)
            conn.executemany(
                "DELETE FROM push_subscriptions WHERE endpoint = ?",
                [(e,) for e in failed],
            )
            conn.close()
        except Exception:
            pass

    return {"sent": sent, "total": len(rows), "pruned": len(failed)}


@router.post("/test")
async def test_push():
    """Send a synthetic test push to all subscribers."""
    return await fan_out({
        "title": "Weather Dashboard test",
        "body": "If you see this, push notifications are working.",
        "url": "/",
    })
