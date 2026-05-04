"""Application metrics for Grafana / Prometheus.

The HTTP-level metrics (req count, latency histograms, in-flight) are produced
automatically by prometheus-fastapi-instrumentator. This module adds custom
counters/gauges for things that don't get captured automatically:
  - Upstream cache hit / miss / coalesce-share counters per backend source
  - Ollama briefing generation count + duration
  - Webhook delivery outcomes
  - Active NWS alert counts (gauge updated on each /nws/alerts request)
"""
from prometheus_client import Counter, Gauge, Histogram

# ── Cache outcomes ──────────────────────────────────────────────────
cache_hits = Counter(
    "weather_cache_hits_total",
    "Cache lookups that returned a fresh entry",
    ["source"],
)
cache_misses = Counter(
    "weather_cache_misses_total",
    "Cache lookups that triggered an upstream fetch",
    ["source"],
)
coalesce_shared = Counter(
    "weather_coalesce_shared_total",
    "Concurrent requests that joined an in-flight upstream call",
    ["key_kind"],
)

# ── Upstream calls ──────────────────────────────────────────────────
upstream_requests = Counter(
    "weather_upstream_requests_total",
    "Outbound HTTP requests to data sources",
    ["source", "outcome"],   # outcome: ok / error / timeout
)
upstream_latency = Histogram(
    "weather_upstream_latency_seconds",
    "Upstream HTTP latency",
    ["source"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30),
)

# ── Briefing (Ollama) ───────────────────────────────────────────────
briefing_generated = Counter(
    "weather_briefing_generated_total",
    "AI briefings actually generated (cache misses for unique fingerprints)",
    ["model", "source"],   # source: ollama / fallback
)
briefing_duration = Histogram(
    "weather_briefing_duration_seconds",
    "Wall-clock time to generate one briefing (Ollama call + context fetch)",
    buckets=(1, 2, 5, 10, 20, 30, 60, 120),
)

# ── Webhook deliveries ──────────────────────────────────────────────
webhook_deliveries = Counter(
    "weather_webhook_deliveries_total",
    "Outbound webhook attempts",
    ["outcome"],   # sent / deduped / unconfigured / error
)

# ── Live state gauges ───────────────────────────────────────────────
active_alerts = Gauge(
    "weather_active_alerts",
    "Number of active NWS alerts at home point (updated on each /nws/alerts hit)",
    ["severity"],
)
active_storm_cells = Gauge(
    "weather_active_storm_cells",
    "Active radar storm cells reported by NEXRAD attribute table",
)
active_lsrs = Gauge(
    "weather_active_lsrs",
    "Local storm reports in last 2h",
    ["category"],
)

# ── Snapshotter (time-machine) ──────────────────────────────────────
snapshots_written = Counter(
    "weather_snapshots_written_total",
    "Time-machine snapshots written to SQLite",
)
snapshot_errors = Counter(
    "weather_snapshot_errors_total",
    "Time-machine snapshot failures",
)
