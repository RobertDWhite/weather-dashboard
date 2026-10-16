import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.routers import timemachine, usgs


EMPTY = {"type": "FeatureCollection", "features": []}


class ReplayIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def fetch(self, alerts, lsrs):
        def respond(request):
            payload = alerts if request.url.host == "api.weather.gov" else lsrs
            return httpx.Response(503 if payload is None else 200, json=payload)

        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with patch.object(timemachine, "_maybe_push_new_alerts", new_callable=AsyncMock) as push:
                snapshot = await timemachine._fetch_snapshot(client)
                return snapshot, push

    async def test_successful_empty_sources_are_a_valid_snapshot(self):
        snapshot, _ = await self.fetch(EMPTY, EMPTY)
        self.assertEqual(snapshot["alerts"], EMPTY)
        self.assertEqual(snapshot["lsrs"], EMPTY)

    async def test_failed_alert_feed_does_not_become_empty_archive(self):
        snapshot, push = await self.fetch(None, EMPTY)
        self.assertIsNone(snapshot)
        push.assert_not_awaited()

    async def test_failed_lsr_feed_skips_archive_without_suppressing_live_push(self):
        snapshot, push = await self.fetch(EMPTY, None)
        self.assertIsNone(snapshot)
        push.assert_awaited_once()
        self.assertEqual(push.call_args.args[0]["alerts"], EMPTY)

    async def test_malformed_source_does_not_become_empty_archive(self):
        snapshot, _ = await self.fetch({"error": "source unavailable"}, EMPTY)
        self.assertIsNone(snapshot)


class GaugeFeedTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_noaa_thresholds_preserve_valid_usgs_observations(self):
        def series(height, code):
            return {
                "sourceInfo": {"siteCode": [{"value": code}], "siteName": "Test river",
                               "geoLocation": {"geogLocation": {"latitude": 39, "longitude": -84}}},
                "variable": {"unit": {"unitCode": "ft"}, "noDataValue": -999},
                "values": [{"value": [{"value": str(height), "dateTime": "2026-10-16T18:00:00Z"}]}],
            }

        def respond(request):
            if request.url.host == "waterservices.usgs.gov":
                return httpx.Response(200, json={"value": {"timeSeries": [
                    series(8, "03245500"), series(-999, "missing"), series("NaN", "invalid")
                ]}})
            return httpx.Response(404)

        usgs._cache.clear()
        usgs._threshold_cache.clear()
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with patch.object(usgs.httpx, "AsyncClient") as factory:
                factory.return_value.__aenter__.return_value = client
                result = await usgs.get_gauges("OH")
        self.assertEqual(len(result["gauges"]), 1)
        self.assertEqual(result["gauges"][0]["height"], 8)
        self.assertEqual(result["gauges"][0]["unit"], "ft")
        self.assertIsNone(result["gauges"][0]["thresholds"])
        usgs._cache.clear()
        usgs._threshold_cache.clear()
