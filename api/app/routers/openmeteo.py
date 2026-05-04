import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

from app.config import settings

router = APIRouter()
_cache: TTLCache = TTLCache(maxsize=200, ttl=600)

WMO: dict[int, tuple[str, str]] = {
    0: ("Clear Sky", "☀️"),
    1: ("Mainly Clear", "🌤️"),
    2: ("Partly Cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Foggy", "🌫️"),
    48: ("Rime Fog", "🌫️"),
    51: ("Light Drizzle", "🌦️"),
    53: ("Moderate Drizzle", "🌧️"),
    55: ("Dense Drizzle", "🌧️"),
    56: ("Freezing Drizzle", "🌧️"),
    57: ("Heavy Freezing Drizzle", "🌧️"),
    61: ("Light Rain", "🌧️"),
    63: ("Moderate Rain", "🌧️"),
    65: ("Heavy Rain", "🌧️"),
    66: ("Light Freezing Rain", "🌧️"),
    67: ("Heavy Freezing Rain", "🌧️"),
    71: ("Light Snow", "🌨️"),
    73: ("Moderate Snow", "❄️"),
    75: ("Heavy Snow", "❄️"),
    77: ("Snow Grains", "❄️"),
    80: ("Light Showers", "🌦️"),
    81: ("Moderate Showers", "🌧️"),
    82: ("Violent Showers", "⛈️"),
    85: ("Snow Showers", "🌨️"),
    86: ("Heavy Snow Showers", "❄️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm w/ Hail", "⛈️"),
    99: ("Thunderstorm w/ Large Hail", "⛈️"),
}

_CURRENT_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "pressure_msl",
    "surface_pressure",
    "visibility",
    "is_day",
    "dew_point_2m",
]

_HOURLY_VARS = [
    "temperature_2m",
    "dew_point_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "cloud_cover",
    "visibility",
]

_DAILY_VARS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
    "sunrise",
    "sunset",
    "uv_index_max",
]

_BASE_PARAMS = {
    "temperature_unit": "fahrenheit",
    "wind_speed_unit": "mph",
    "precipitation_unit": "inch",
    "timezone": "auto",
}


@router.get("/current")
async def get_current(lat: float = None, lon: float = None):
    lat = lat or settings.observer_lat
    lon = lon or settings.observer_lon
    key = f"cur_{lat:.3f},{lon:.3f}"
    if key in _cache:
        return _cache[key]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    **_BASE_PARAMS,
                    "latitude": lat,
                    "longitude": lon,
                    "current": _CURRENT_VARS,
                },
            )
            r.raise_for_status()
            d = r.json()
            c = d["current"]
            code = c.get("weather_code", 0)
            cond, icon = WMO.get(code, ("Unknown", "❓"))
            result = {
                "temperature": c["temperature_2m"],
                "feelsLike": c["apparent_temperature"],
                "dewPoint": c.get("dew_point_2m"),
                "humidity": c["relative_humidity_2m"],
                "precipitation": c["precipitation"],
                "weatherCode": code,
                "condition": cond,
                "icon": icon,
                "cloudCover": c["cloud_cover"],
                "windSpeed": c["wind_speed_10m"],
                "windDirection": c["wind_direction_10m"],
                "windGusts": c["wind_gusts_10m"],
                "pressure": c["pressure_msl"],
                "visibility": c.get("visibility", 0),
                "isDay": c.get("is_day", 1),
                "time": c["time"],
                "timezone": d["timezone"],
                "lat": lat,
                "lon": lon,
            }
            _cache[key] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.get("/forecast")
async def get_forecast(lat: float = None, lon: float = None):
    lat = lat or settings.observer_lat
    lon = lon or settings.observer_lon
    key = f"fcst_{lat:.3f},{lon:.3f}"
    if key in _cache:
        return _cache[key]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    **_BASE_PARAMS,
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": _HOURLY_VARS,
                    "daily": _DAILY_VARS,
                    "forecast_days": 7,
                },
            )
            r.raise_for_status()
            d = r.json()
            h = d["hourly"]
            hourly = []
            for i in range(min(48, len(h["time"]))):
                code = h["weather_code"][i]
                cond, icon = WMO.get(code, ("Unknown", "❓"))
                hourly.append(
                    {
                        "time": h["time"][i],
                        "temperature": h["temperature_2m"][i],
                        "dewPoint": h["dew_point_2m"][i],
                        "feelsLike": h["apparent_temperature"][i],
                        "precipProbability": h["precipitation_probability"][i],
                        "precipitation": h["precipitation"][i],
                        "weatherCode": code,
                        "condition": cond,
                        "icon": icon,
                        "windSpeed": h["wind_speed_10m"][i],
                        "windDirection": h["wind_direction_10m"][i],
                        "windGusts": h["wind_gusts_10m"][i],
                        "cloudCover": h["cloud_cover"][i],
                        "visibility": h["visibility"][i],
                    }
                )
            dy = d["daily"]
            daily = []
            for i in range(len(dy["time"])):
                code = dy["weather_code"][i]
                cond, icon = WMO.get(code, ("Unknown", "❓"))
                daily.append(
                    {
                        "date": dy["time"][i],
                        "tempMax": dy["temperature_2m_max"][i],
                        "tempMin": dy["temperature_2m_min"][i],
                        "feelsMax": dy["apparent_temperature_max"][i],
                        "feelsMin": dy["apparent_temperature_min"][i],
                        "precipSum": dy["precipitation_sum"][i],
                        "precipProbability": dy["precipitation_probability_max"][i],
                        "windMax": dy["wind_speed_10m_max"][i],
                        "windGusts": dy["wind_gusts_10m_max"][i],
                        "windDir": dy["wind_direction_10m_dominant"][i],
                        "sunrise": dy["sunrise"][i],
                        "sunset": dy["sunset"][i],
                        "uvIndex": dy["uv_index_max"][i],
                        "weatherCode": code,
                        "condition": cond,
                        "icon": icon,
                    }
                )
            result = {
                "hourly": hourly,
                "daily": daily,
                "timezone": d["timezone"],
                "lat": lat,
                "lon": lon,
            }
            _cache[key] = result
            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
