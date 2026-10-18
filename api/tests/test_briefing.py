import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.routers import briefing
from app.routers import nws


class BriefingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        briefing._cache.clear()
        briefing._resolved_model[0] = None

    def tearDown(self):
        briefing._cache.clear()
        briefing._resolved_model[0] = None

    async def ask(self, response):
        requests = []

        def respond(request):
            requests.append(request)
            if request.url.path == '/api/tags':
                return httpx.Response(200, json={"models": [{"name": "qwen3.8:27b"}]})
            return httpx.Response(200, json=response)

        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with patch.object(briefing.httpx, 'AsyncClient') as factory:
                factory.return_value.__aenter__.return_value = client
                with patch.object(briefing.settings, 'ollama_url', 'http://ollama-5090.ai-stack.svc.cluster.local:11434'), patch.object(briefing.settings, 'ollama_model', 'qwen3.8:27b'):
                    result = await briefing._ask_ollama('Summarize the supplied weather observations.')
        return result, requests

    async def test_generates_non_thinking_summary_on_configured_instance(self):
        text, requests = await self.ask({"response": "Rain is expected this afternoon."})
        self.assertEqual(text, 'Rain is expected this afternoon.')
        self.assertTrue(all(r.url.host == 'ollama-5090.ai-stack.svc.cluster.local' for r in requests))
        payload = json.loads(requests[-1].content)
        self.assertFalse(payload['think'])
        self.assertEqual(payload['model'], 'qwen3.8:27b')

    async def test_thinking_only_output_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'no briefing text'):
            await self.ask({"response": "", "thinking": "Internal reasoning", "done": True})

    async def test_offline_fallback_is_labelled_and_not_cached(self):
        with patch.object(briefing, '_ask_ollama', new_callable=AsyncMock, side_effect=RuntimeError('offline')):
            result = await briefing._generate_briefing({"alerts": []}, 39, -84, 'fp', 'key')
        self.assertEqual(result['source'], 'fallback')
        self.assertNotIn('key', briefing._cache)

    async def test_refresh_bypasses_cached_briefing(self):
        briefing._cache['key'] = {"text": "old"}
        with patch.object(briefing, '_ask_ollama', new_callable=AsyncMock, return_value='Updated forecast.') as ask:
            result = await briefing._generate_briefing({"alerts": []}, 39, -84, 'fp', 'key', refresh=True)
        ask.assert_awaited_once()
        self.assertEqual(result['text'], 'Updated forecast.')
        self.assertEqual(result['source'], 'ollama')

    async def test_unavailable_alerts_are_disclosed_to_ollama(self):
        context = {'alerts': [], 'sources': {'alerts': 'unavailable', 'afd': 'available'}}
        with patch.object(briefing, '_ask_ollama', new_callable=AsyncMock, return_value='NWS alert coverage is unavailable; other weather threats remain possible.') as ask:
            result = await briefing._generate_briefing(context, 39, -84, 'fp', 'key')
        ask.assert_awaited_once()
        self.assertIn('UNAVAILABLE source: alerts', ask.await_args.args[0])
        self.assertIn('unknown', ask.await_args.args[0])
        self.assertEqual(result['source'], 'ollama')
        self.assertIsNone(result['context']['alerts_count'])
        self.assertEqual(result['sources']['alerts'], 'unavailable')
        self.assertIn('key', briefing._cache)

    async def test_context_uses_the_dashboard_scope_and_reports_partial_sources(self):
        def respond(request):
            if '/lsr.' in str(request.url):
                return httpx.Response(200, json={'features': []})
            return httpx.Response(503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with patch.object(nws, 'get_alerts', new_callable=AsyncMock, side_effect=RuntimeError('offline')) as alerts:
                context = await briefing._gather_context(client, 39, -84, 'nearby', 50)
        self.assertEqual(alerts.call_args.kwargs['radius_miles'], 50)
        self.assertEqual(alerts.call_args.kwargs['scope'], 'nearby')
        self.assertEqual(context['sources'], {'alerts': 'unavailable', 'lsrs': 'available', 'afd': 'unavailable', 'hwo': 'unavailable'})
        prompt = briefing._user_prompt(context)
        self.assertIn('UNAVAILABLE source: alerts', prompt)
        self.assertNotIn('No active NWS alerts', prompt)

    def test_context_fingerprint_changes_on_revised_alert_or_recovered_source(self):
        context = {'alerts': [{'id': 'one', 'expires': 'old'}], 'sources': {'alerts': 'available'}, 'checked_at': 1}
        first = briefing._fingerprint(context)
        context['checked_at'] = 2
        self.assertEqual(first, briefing._fingerprint(context))
        context['alerts'][0]['expires'] = 'new'
        self.assertNotEqual(first, briefing._fingerprint(context))
        revised = briefing._fingerprint(context)
        context['sources']['alerts'] = 'unavailable'
        self.assertNotEqual(revised, briefing._fingerprint(context))

    async def test_home_scope_requests_the_exact_nws_point(self):
        def respond(request):
            self.assertEqual(request.url.params['point'], '39,-84')
            return httpx.Response(200, json={'type': 'FeatureCollection', 'features': []})
        nws._home_alerts_cache.clear()
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with patch.object(nws.httpx, 'AsyncClient') as factory:
                factory.return_value.__aenter__.return_value = client
                result = await nws.get_alerts(dedupe=True, local=True, lat=39, lon=-84, radius_miles=75, scope='home')
        self.assertEqual(result['scope'], 'home')
        self.assertEqual(result['features'], [])
        nws._home_alerts_cache.clear()

    async def test_partial_zone_resolution_is_not_an_all_clear(self):
        nws._local_alerts_cache.clear()
        data = {'features': [{'geometry': None, 'properties': {'affectedZones': ['https://api.weather.gov/zones/forecast/OHZ001']}}]}
        with patch.object(nws, '_fetch_zone', new_callable=AsyncMock, return_value=('forecast/OHZ001', None)):
            result = await nws._local_alerts(data, 39, -84, 75)
        self.assertTrue(result['incomplete'])
        self.assertEqual(result['features'], [])
        nws._local_alerts_cache.clear()
