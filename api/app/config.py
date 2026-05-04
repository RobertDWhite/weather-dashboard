"""Application configuration.

Loads from a YAML config file (path via WX_CONFIG, defaulting to
/etc/weather-dashboard/config.yaml or ./config.yaml) and overlays environment
variables on top so single values can still be tweaked without editing the
file. All keys are optional — sensible defaults make a no-config run land on
a US central-ish location with no API keys.

Resolution order: explicit env var → YAML file → hard-coded default.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None


class WebhookTarget(BaseModel):
    """A single outbound notification target.

    `kind` selects the payload format. `url` is the only required field.
    Severity filter limits which events fire — by default, everything fires.
    """

    name: str = "default"
    kind: Literal["discord", "slack", "generic"] = "generic"
    url: str
    min_severity: Literal["minor", "moderate", "severe", "extreme"] = "minor"
    events: list[str] = Field(default_factory=list)  # empty = all events


def _load_yaml() -> dict:
    """Read the YAML config if present. Silent no-op if file or parser missing."""
    candidates = []
    if env_path := os.environ.get("WX_CONFIG"):
        candidates.append(Path(env_path))
    candidates.extend([
        Path("/etc/weather-dashboard/config.yaml"),
        Path("config.yaml"),
        Path("./config/config.yaml"),
    ])
    for p in candidates:
        if p.is_file() and yaml is not None:
            try:
                with p.open("r") as f:
                    data = yaml.safe_load(f) or {}
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
    return {}


_YAML = _load_yaml()


def _yaml_get(*keys, default=None):
    cur = _YAML
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


class Settings(BaseSettings):
    observer_lat: float = Field(default_factory=lambda: float(_yaml_get("observer", "lat", default=39.5)))
    observer_lon: float = Field(default_factory=lambda: float(_yaml_get("observer", "lon", default=-98.5)))
    observer_location: str = Field(default_factory=lambda: str(_yaml_get("observer", "location", default="United States")))
    observer_state: str = Field(default_factory=lambda: str(_yaml_get("observer", "state", default="")))

    openweathermap_key: str = Field(default_factory=lambda: str(_yaml_get("api_keys", "openweathermap", default="")))
    airnow_key: str = Field(default_factory=lambda: str(_yaml_get("api_keys", "airnow", default="")))
    windy_key: str = Field(default_factory=lambda: str(_yaml_get("api_keys", "windy", default="")))
    ohgo_key: str = Field(default_factory=lambda: str(_yaml_get("api_keys", "ohgo", default="")))
    youtube_key: str = Field(default_factory=lambda: str(_yaml_get("api_keys", "youtube", default="")))

    # NOAA/NWS asks for an identifying User-Agent on api.weather.gov requests.
    # Format: "(AppName/version, contact@email)"
    nws_user_agent: str = Field(
        default_factory=lambda: str(
            _yaml_get(
                "nws_user_agent",
                default="(weather-dashboard, https://github.com/RobertDWhite/weather-dashboard)",
            )
        )
    )

    ollama_url: str = Field(default_factory=lambda: str(_yaml_get("ollama", "url", default="")))
    ollama_model: str = Field(default_factory=lambda: str(_yaml_get("ollama", "model", default="llama3.1:8b")))

    timemachine_db_path: str = Field(default_factory=lambda: str(_yaml_get("timemachine", "db_path", default="/data/timemachine.db")))
    timemachine_interval_sec: int = Field(default_factory=lambda: int(_yaml_get("timemachine", "interval_sec", default=60)))
    timemachine_retention_hours: int = Field(default_factory=lambda: int(_yaml_get("timemachine", "retention_hours", default=12)))

    # Branding / public URL — used in CAP feed metadata and footer.
    public_url: str = Field(default_factory=lambda: str(_yaml_get("public_url", default="")))
    sender_email: str = Field(default_factory=lambda: str(_yaml_get("sender_email", default="noreply@example.org")))

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


def _load_webhook_targets() -> list[WebhookTarget]:
    """Build webhook target list from YAML (preferred) or single WEBHOOK_URL env var."""
    targets: list[WebhookTarget] = []
    raw = _yaml_get("webhooks", default=[]) or []
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict) or "url" not in entry:
                continue
            try:
                targets.append(WebhookTarget(**entry))
            except Exception:
                continue
    if not targets and (env_url := os.environ.get("WEBHOOK_URL")):
        kind: Literal["discord", "slack", "generic"] = "generic"
        if "discord.com" in env_url or "discordapp.com" in env_url:
            kind = "discord"
        elif "slack.com" in env_url or "hooks.slack" in env_url:
            kind = "slack"
        targets.append(WebhookTarget(name="env", kind=kind, url=env_url))
    return targets


settings = Settings()
webhook_targets: list[WebhookTarget] = _load_webhook_targets()
