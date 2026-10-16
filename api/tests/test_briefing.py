import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.routers import briefing


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
