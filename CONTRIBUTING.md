# Contributing

Thanks for the interest. This is a small project — I keep the bar deliberately low for accepting PRs that scratch your own itch.

## Quick start (local dev)

```bash
# API
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# UI (separate terminal)
cd ui
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:8000`.

## What I'll merge

- Bug fixes — always.
- New NOAA / NWS / NDBC / FAA / USGS data sources — yes, especially if they're free and public-API.
- New webhook delivery formats (Teams, Mattermost, ntfy, etc.) — yes, follow the pattern in `api/app/routers/webhook.py`.
- Performance / caching improvements — yes.
- A11y, i18n, mobile improvements — yes.

## What I probably won't merge

- Paid / commercial data sources that require account signup as the *only* path.
- Region-specific features without a config-driven enable flag (the dashboard should still render fine in Iowa, Alaska, or Maine).
- Hardcoded branding or "powered by X" links.
- Heavy dependencies for marginal features.

## Style

- Python: trust the framework, no defensive fluff. See [code-quality](api/app/) for examples.
- TypeScript: strict mode, no `any` unless wrapping an external API.
- No comments explaining what well-named code already says. Comments explain *why*, not *what*.

## Testing

There isn't a test suite yet. If you add one, please use pytest for the API and Vitest for the UI.

## Reporting issues

Include:
- Your `config.yaml` (redact webhook URLs / API keys)
- The deployment method (docker-compose / k8s / bare metal)
- Browser + version for UI bugs
- The output of `curl localhost:8000/health/upstreams` for data source bugs
