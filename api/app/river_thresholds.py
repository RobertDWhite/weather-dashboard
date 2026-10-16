"""NWS flood categories are per station, never universal gage heights."""
import math


def flood_thresholds(data: dict, usgs_id: str) -> dict | None:
    if data.get("usgsId") != usgs_id:
        return None
    flood = data.get("flood") or {}
    if flood.get("stageUnits") != "ft":
        return None
    values = {}
    for category in ("action", "minor", "moderate", "major"):
        value = (flood.get("categories", {}).get(category) or {}).get("stage")
        # NWPS uses -9999 for missing thresholds. Negative valid stages are allowed.
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value != -9999:
            values[category] = value
    if not values or any(a > b for a, b in zip(values.values(), list(values.values())[1:])):
        return None
    return {**values, "source": "NWS NWPS", "lid": data.get("lid"), "unit": "ft"}
