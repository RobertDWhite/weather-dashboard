"""VTEC (Valid Time Event Code) parser.

NWS alert IDs include a string like:
   /O.NEW.KILN.TO.W.0042.260503T1820Z-260503T1900Z/

  O    operational vs T(test) / E(experimental) / X(experimental-vtec)
  NEW  action: NEW / CON (continued) / EXT (extended) / EXA (extended-area)
                / EXB (extended both) / UPG (upgraded) / CAN (cancelled)
                / EXP (expired) / COR (corrected) / ROU (routine)
  KILN office (4 letters)
  TO   phenomena (2 letters; e.g. TO=tornado, SV=severe T-storm, FF=flash flood)
  W    significance (W=warning, A=watch, Y=advisory, S=statement)
  0042 ETN (event tracking number, padded 4 digits)
  ...  validity timestamps

Two alerts with the same (office, phenomena, significance, ETN) are the
SAME event over time — different VTEC actions just indicate state changes.
"""
import re
from typing import Iterable

_VTEC_RE = re.compile(
    r"/(?P<vclass>[OTEX])\."
    r"(?P<action>NEW|CON|EXT|EXA|EXB|UPG|CAN|EXP|COR|ROU)\."
    r"(?P<office>[A-Z]{4})\."
    r"(?P<phenom>[A-Z]{2})\."
    r"(?P<sig>[WAYS])\."
    r"(?P<etn>\d{4})\."
    r"(?P<start>\d{6}T\d{4}Z)-"
    r"(?P<end>\d{6}T\d{4}Z)/"
)

PHENOMENA = {
    "TO": "Tornado", "SV": "Severe Thunderstorm", "FF": "Flash Flood",
    "FA": "Areal Flood", "FL": "River Flood", "MA": "Marine",
    "WS": "Winter Storm", "WW": "Winter Weather", "BZ": "Blizzard",
    "IS": "Ice Storm", "SQ": "Snow Squall", "HW": "High Wind",
    "EH": "Excessive Heat", "HT": "Heat", "WC": "Wind Chill", "FZ": "Freeze",
    "FR": "Frost", "DS": "Dust Storm", "DU": "Dust",
    "TR": "Tropical Storm", "HU": "Hurricane", "TY": "Typhoon",
    "SS": "Storm Surge", "TS": "Tsunami",
    "FW": "Fire Weather", "RP": "Rip Current", "BH": "Beach Hazards",
}

SIGNIFICANCE = {"W": "Warning", "A": "Watch", "Y": "Advisory", "S": "Statement"}


def parse(vtec_string: str) -> dict | None:
    """Parse a single VTEC code (the slash-delimited portion). Returns None
    if the string isn't a recognizable VTEC."""
    m = _VTEC_RE.search(vtec_string or "")
    if not m:
        return None
    g = m.groupdict()
    return {
        "vclass": g["vclass"],
        "action": g["action"],
        "office": g["office"],
        "phenom_code": g["phenom"],
        "phenom": PHENOMENA.get(g["phenom"], g["phenom"]),
        "sig_code": g["sig"],
        "significance": SIGNIFICANCE.get(g["sig"], g["sig"]),
        "etn": int(g["etn"]),
        "start_z": g["start"],
        "end_z": g["end"],
        # Stable event-key: same alert across NEW→CON→CAN updates
        "event_key": f"{g['office']}.{g['phenom']}.{g['sig']}.{g['etn']}",
    }


def parse_all(text: str) -> list[dict]:
    """Some products carry multiple VTEC strings (eg upgrades). Return all."""
    return [parse(m.group(0)) for m in _VTEC_RE.finditer(text or "") if parse(m.group(0))]


def derive_event_key(properties: dict) -> str | None:
    """Given an NWS alert properties dict, return its stable VTEC event_key
    if available. Falls back to sender + event + areaDesc hash if VTEC is
    absent (some non-warning products)."""
    raw = properties.get("parameters", {}).get("VTEC") if properties else None
    if isinstance(raw, list) and raw:
        raw = raw[0]
    if isinstance(raw, str):
        parsed = parse(raw)
        if parsed:
            return parsed["event_key"]
    # No VTEC — synthesize a stable-ish key from event + sender + area
    sender = (properties or {}).get("senderName", "")
    event = (properties or {}).get("event", "")
    area = (properties or {}).get("areaDesc", "")
    if not (event or area):
        return None
    return f"_no_vtec:{sender}:{event}:{area}"[:200]


def dedupe(alerts: Iterable[dict]) -> list[dict]:
    """Collapse a list of alert features into one entry per VTEC event_key,
    keeping the most-recent state (NEW < CON < EXT < UPG < CAN/EXP). Adds a
    `_vtec_history` field so the UI can show the lifecycle."""
    by_key: dict[str, dict] = {}
    for a in alerts:
        props = a.get("properties") or {}
        ek = derive_event_key(props)
        if not ek:
            # Can't dedupe — pass through with a synthetic key
            by_key[a.get("id") or id(a)] = a
            continue
        existing = by_key.get(ek)
        new_sent = props.get("sent") or props.get("effective") or ""
        if existing is None:
            a.setdefault("_vtec_event_key", ek)
            a.setdefault("_vtec_history", [props.get("messageType") or "?"])
            by_key[ek] = a
            continue
        old_sent = (existing.get("properties") or {}).get("sent") or ""
        # Keep newer; merge history
        if new_sent > old_sent:
            new_a = dict(a)
            new_a["_vtec_event_key"] = ek
            new_a["_vtec_history"] = (existing.get("_vtec_history") or []) + [props.get("messageType") or "?"]
            by_key[ek] = new_a
        else:
            existing.setdefault("_vtec_history", []).append(props.get("messageType") or "?")
    return list(by_key.values())
