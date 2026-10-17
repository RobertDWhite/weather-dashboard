import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx

from app.routers import openmeteo


class ForecastWindowTests(unittest.IsolatedAsyncioTestCase):
    async def test_keeps_seven_days_and_unambiguous_dst_hours(self):
        start = int(datetime(2026, 11, 1, tzinfo=timezone.utc).timestamp())
        hourly = {key: [1] * 168 for key in openmeteo._HOURLY_VARS}
        hourly['time'] = [start + i * 3600 for i in range(168)]
        hourly['precipitation'] = list(range(168))
        hourly['wind_gusts_10m'] = list(range(168))
        daily = {key: [1] * 7 for key in openmeteo._DAILY_VARS}
        daily.update(time=[start + 4 * 3600 + i * 86400 for i in range(7)],
                     sunrise=[start + i * 86400 for i in range(7)], sunset=[start + i * 86400 + 40000 for i in range(7)])

        def respond(request):
            self.assertEqual(request.url.params['forecast_days'], '7')
            self.assertEqual(request.url.params['timeformat'], 'unixtime')
            return httpx.Response(200, json={'hourly': hourly, 'daily': daily, 'timezone': 'America/New_York', 'utc_offset_seconds': -14400})

        openmeteo._cache.clear()
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with patch.object(openmeteo.httpx, 'AsyncClient') as factory:
                factory.return_value.__aenter__.return_value = client
                result = await openmeteo.get_forecast(39, -84)
        self.assertEqual(len(result['hourly']), 168)
        self.assertEqual(result['hourly'][0]['precipitation'], 1)
        self.assertEqual(result['hourly'][0]['windGusts'], 1)
        self.assertIsNone(result['hourly'][-1]['precipitation'])
        self.assertTrue(result['hourly'][0]['time'].endswith('+00:00'))
        self.assertNotEqual(result['hourly'][5]['time'], result['hourly'][6]['time'])
        self.assertEqual(result['daily'][0]['date'], '2026-11-01')
        self.assertEqual(result['daily'][1]['date'], '2026-11-02')
        openmeteo._cache.clear()
