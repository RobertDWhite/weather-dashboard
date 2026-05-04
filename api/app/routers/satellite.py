from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()

_GOES16 = "https://cdn.star.nesdis.noaa.gov/GOES16/ABI"
_GOES18 = "https://cdn.star.nesdis.noaa.gov/GOES18/ABI"


@router.get("/goes")
async def get_goes_urls():
    ts = int(datetime.now(timezone.utc).timestamp())
    return {
        "generated": ts,
        "GOES16": {
            "CONUS": {
                "GeoColor": f"{_GOES16}/CONUS/GEOCOLOR/latest.jpg?t={ts}",
                "Visible": f"{_GOES16}/CONUS/02/latest.jpg?t={ts}",
                "CleanIR": f"{_GOES16}/CONUS/13/latest.jpg?t={ts}",
                "WaterVapor": f"{_GOES16}/CONUS/09/latest.jpg?t={ts}",
                "NightMicrophysics": f"{_GOES16}/CONUS/NightMicrophysics/latest.jpg?t={ts}",
                "Sandwich": f"{_GOES16}/CONUS/Sandwich/latest.jpg?t={ts}",
            },
            "FULL_DISK": {
                "GeoColor": f"{_GOES16}/FD/GEOCOLOR/latest.jpg?t={ts}",
                "Visible": f"{_GOES16}/FD/02/latest.jpg?t={ts}",
            },
        },
        "GOES18": {
            "CONUS": {
                "GeoColor": f"{_GOES18}/CONUS/GEOCOLOR/latest.jpg?t={ts}",
                "Visible": f"{_GOES18}/CONUS/02/latest.jpg?t={ts}",
                "CleanIR": f"{_GOES18}/CONUS/13/latest.jpg?t={ts}",
                "WaterVapor": f"{_GOES18}/CONUS/09/latest.jpg?t={ts}",
            },
        },
        "channels": {
            "GeoColor": "True Color / Night Microphysics",
            "Visible": "Visible (0.64 µm)",
            "CleanIR": "Clean IR Longwave (10.3 µm)",
            "WaterVapor": "Mid-level Water Vapor (6.9 µm)",
            "NightMicrophysics": "Night Microphysics RGB",
            "Sandwich": "Sandwich RGB",
        },
    }
