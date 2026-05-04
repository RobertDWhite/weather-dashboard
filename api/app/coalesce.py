"""Request coalescing helper.

Under load, many users may request the same expensive upstream simultaneously
(e.g. /briefing/now, /spc/proxy/...). Without coalescing, every concurrent
cache-miss spawns a duplicate upstream call. With coalescing, the first
caller fires the upstream and subsequent in-flight callers await the same
future. After completion, the result is whatever the cache layer stored —
this helper doesn't manage the cache itself, just the in-flight fan-in.
"""
import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

_inflight: dict[str, asyncio.Future] = {}


async def coalesce(key: str, factory: Callable[[], Awaitable[T]]) -> T:
    """Run `factory()` for `key`. Concurrent callers with the same key wait
    on the first call instead of duplicating work. The factory is awaited
    only once; all callers receive its result (or its exception)."""
    fut = _inflight.get(key)
    if fut is not None:
        return await fut

    fut = asyncio.get_running_loop().create_future()
    _inflight[key] = fut
    try:
        result = await factory()
        fut.set_result(result)
        return result
    except Exception as exc:
        fut.set_exception(exc)
        raise
    finally:
        # Drop the future once resolved so subsequent calls re-enter the
        # cache lookup path (which may now be a hit).
        _inflight.pop(key, None)
