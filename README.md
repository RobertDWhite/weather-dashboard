# weather-dashboard

A self-hosted, NWS-grade weather operations dashboard. Free public data only — no paid feeds required.

Built around the US National Weather Service `api.weather.gov`, NOAA SPC, AviationWeather Center, NDBC marine, USGS earthquakes, RainViewer / IEM / NOAA radar mosaics, and a handful of other public sources. Render it in a browser, on a kiosk, on a TV.

> **Status:** alpha. The author runs it 24/7 on his own cluster, but the OSS extraction is fresh — expect rough edges. PRs welcome.

> **Disclaimer:** unofficial. Not affiliated with NOAA, NWS, FAA, or any government agency. Not for life-safety decisions — always defer to your local NWS office and EAS/IPAWS.

## Features

- **Active alerts** — NWS warnings/watches/advisories with VTEC parsing, severity coloring, polygon overlays, and an emergency banner that announces tornado emergencies via screen reader.
- **Radar** — NOAA NEXRAD per-site (5 products), MRMS composite, RainViewer animated, NOAA GeoServer WMS overlays, time-machine playback.
- **Severe weather** — SPC outlooks, mesoanalysis, ProbSevere v3, GLM lightning, storm cells, LSRs, damage paths.
- **Aviation** — METAR, TAF, PIREP, AIRMET, SIGMET, G-AIRMET, CWA.
- **Marine** — NDBC buoys, CO-OPS tides.
- **Earth & sky** — USGS earthquakes, NOAA satellite, drought monitor, NIFC wildfires.
- **Forecast & climate** — NWS hourly + 7-day, hazards graphic, forecast soundings, Open-Meteo, AirNow AQI.
- **Notifications** — VAPID web push (browser), CAP 1.2 feed (`/api/cap/active.xml`), and webhook fan-out to Slack / Discord / generic HTTP.
- **PWA** — installable, offline shell, dark-mode native, prefers-reduced-motion friendly.

## Screenshots

<!-- TODO: add screenshots before launch. Suggested shots:
     1. Main map view with active alerts overlay
     2. Radar with NEXRAD + ProbSevere
     3. Aviation panel with METARs
     4. Mobile / PWA view
-->
_Coming soon — running [demo](https://weather.example.org) is in the works._

## Quickstart (Docker Compose)

```bash
git clone https://github.com/RobertDWhite/weather-dashboard.git
cd weather-dashboard
cp config.example.yaml config.yaml
# Edit config.yaml — at minimum, set observer.lat / observer.lon
docker compose up -d
```

Open <http://localhost:8080>.

## Configuration (`config.yaml`)

Every key is optional. The minimum you'll want to set is your observer location (used for forecast lookups and map centering):

```yaml
observer:
  lat: 39.5
  lon: -84.5
  location: "Dayton, OH"
  state: "OH"

# NOAA asks for an identifying User-Agent on api.weather.gov requests.
nws_user_agent: "(my-weather-dashboard, contact@example.org)"

# Optional API keys (free signup at each provider).
api_keys:
  airnow: ""              # https://docs.airnowapi.org/
  openweathermap: ""      # https://openweathermap.org/api
  windy: ""               # https://api.windy.com/
  ohgo: ""                # Ohio DOT cameras (regional)
  youtube: ""             # YouTube live cameras

# Webhook fan-out for severe weather alerts.
# Multiple targets, each with its own severity floor and event filter.
webhooks:
  - name: "ops-channel"
    kind: "slack"          # slack | discord | generic
    url: "https://hooks.slack.com/services/T00/B00/XXX"
    min_severity: "severe" # minor | moderate | severe | extreme
    events: []             # empty = all events
  - name: "tornado-only"
    kind: "discord"
    url: "https://discord.com/api/webhooks/.../..."
    events: ["tornado"]    # case-insensitive substring match

# Optional Ollama (LLM) for the AI briefing endpoint. Empty = disabled.
ollama:
  url: ""                  # e.g. "http://ollama.local:11434"
  model: "llama3.1:8b"

# Branding / metadata used in CAP feed + push payloads.
public_url: ""             # e.g. "https://weather.example.org"
sender_email: "noreply@example.org"
```

Environment variables override YAML values for single-key tweaks (e.g. `WX_CONFIG=/etc/foo.yaml`, `WEBHOOK_URL=...`).

## Running without Docker

```bash
# API
cd api
pip install -r requirements.txt
WX_CONFIG=../config.yaml uvicorn app.main:app --port 8000

# UI
cd ui
npm install
npm run build
# Serve ui/dist with any static server; reverse-proxy /api -> :8000
```

## Kubernetes

Example manifests live under `deploy/k8s/`. They're a starting point — adapt the ingress, storage class, and replicas to your cluster:

```bash
kubectl apply -k deploy/k8s/
```

## Data sources & licensing

All upstream data is public-domain US Government work or open-licensed:

| Source | Used for | License |
| --- | --- | --- |
| api.weather.gov (NWS) | Alerts, forecasts, zones | Public domain |
| spc.noaa.gov | Convective outlooks, mesoanalysis, reports | Public domain |
| aviationweather.gov | METAR, TAF, AIRMET, SIGMET | Public domain |
| ndbc.noaa.gov | Buoys, marine | Public domain |
| tidesandcurrents.noaa.gov | Tides, water levels | Public domain |
| usgs.gov | Earthquakes, river gauges | Public domain |
| rainviewer.com | Animated radar mosaic | [Free tier](https://www.rainviewer.com/api.html) |
| mesonet.agron.iastate.edu (IEM) | Radar tiles, LSRs | [CC-BY](https://mesonet.agron.iastate.edu/) |
| realearth.ssec.wisc.edu | ProbSevere, GLM | [SSEC terms](https://www.ssec.wisc.edu/) |
| openweathermap.org | (Optional) extended forecast | [Free tier](https://openweathermap.org/price) |
| airnowapi.org | (Optional) AQI | [Free with key](https://docs.airnowapi.org/) |

Please respect rate limits. The dashboard caches aggressively (10s–30min TTL depending on endpoint) and uses a single-worker async backend to keep upstream load minimal.

## Code license

MIT. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
