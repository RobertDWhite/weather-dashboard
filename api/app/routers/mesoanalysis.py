"""SPC Mesoscale Analysis image catalog. Returns labeled URLs for the parameter
maps meteorologists use to assess severe weather potential (CAPE, helicity,
shear, etc.). Images regenerate ~hourly; we serve them via the spc/proxy
image proxy because SPC blocks browser cross-origin image fetches by Referer."""
import time

from cachetools import TTLCache
from fastapi import APIRouter

router = APIRouter()

_cache: TTLCache = TTLCache(maxsize=2, ttl=300)

# SPC mesoanalysis sectors. Discovered by probing /exper/mesoanalysis/<sN>/...
# with HEAD requests; only the codes that returned 200 are listed.
SECTORS = {
    "s19": {"label": "National (CONUS)", "code": "s19"},
    "s11": {"label": "Northwest", "code": "s11"},
    "s12": {"label": "Southwest", "code": "s12"},
    "s13": {"label": "Northern Plains", "code": "s13"},
    "s14": {"label": "Central Plains", "code": "s14"},
    "s15": {"label": "Southern Plains", "code": "s15"},
    "s16": {"label": "Northeast", "code": "s16"},
    "s17": {"label": "East Central", "code": "s17"},
    "s18": {"label": "Southeast", "code": "s18"},
    "s20": {"label": "Midwest", "code": "s20"},
    "s21": {"label": "Great Lakes", "code": "s21"},
    "s22": {"label": "Great Basin", "code": "s22"},
}

# Verified parameter codes (SPC's internal short codes — different from what I
# guessed earlier). All of these have been confirmed to return 200 from
# /exper/mesoanalysis/s19/<code>/<code>.gif with a browser User-Agent.
PARAMETERS = {
    "Instability": [
        ("sbcp", "Surface CAPE"),
        ("mucp", "Most-Unstable CAPE"),
        ("mlcp", "Mixed-Layer CAPE"),
        ("dcape", "Downdraft CAPE"),
    ],
    "Wind / Shear": [
        ("eshr", "Effective Bulk Shear"),
        ("shr6", "0-6 km Bulk Shear"),
        ("srh1", "0-1 km Storm-Relative Helicity"),
        ("srh3", "0-3 km Storm-Relative Helicity"),
    ],
    "Composites": [
        ("scp", "Supercell Composite"),
        ("ehi1", "0-1 km Energy-Helicity Index"),
        ("ehi3", "0-3 km Energy-Helicity Index"),
        ("snsq", "Snow Squall Parameter"),
    ],
    "Precip / Surface": [
        ("pwtr", "Precipitable Water"),
        ("ttd", "Surface Temperature / Dewpoint"),
        ("pmsl", "Mean Sea Level Pressure"),
    ],
}


def _build_image_url(sector: str, param: str) -> str:
    """Build the proxied URL — we route SPC images through our /spc/proxy
    endpoint to bypass the browser-side referer block. Cache-bust rotates
    every 10 minutes."""
    bust = int(time.time() // 600)
    return f"/api/spc/proxy/meso/{sector}/{param}?_={bust}"


@router.get("/catalog")
async def get_catalog():
    """Returns the available sectors + parameters with proxied image URLs."""
    if "catalog" in _cache:
        return _cache["catalog"]
    catalog = {
        "sectors": SECTORS,
        "groups": [
            {
                "name": group,
                "params": [
                    {
                        "code": code,
                        "label": label,
                        "urls": {
                            sector: _build_image_url(sector, code)
                            for sector in SECTORS
                        },
                    }
                    for code, label in entries
                ],
            }
            for group, entries in PARAMETERS.items()
        ],
        "attribution": "NOAA Storm Prediction Center Mesoscale Analysis",
        "page": "https://www.spc.noaa.gov/exper/mesoanalysis/",
    }
    _cache["catalog"] = catalog
    return catalog
