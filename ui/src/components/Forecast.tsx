import { useState } from 'react'
import type { DailyPeriod, HourlyPeriod } from '../types'
import {
  localDate,
  localHour,
  nextDate,
  overnightHours,
  weatherTime,
  isReading,
  reading,
  precipitationAmount,
} from '../weatherTime'

export default function Forecast({
  daily,
  hourly,
  timezone,
  now,
}: {
  daily: DailyPeriod[]
  hourly: HourlyPeriod[]
  timezone: string
  now: number
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const today = localDate(now, timezone)
  if (!daily.length)
    return (
      <div className="card">
        <h2 className="card-title">7-Day Forecast</h2>
        <p className="notice">No daily forecast available.</p>
      </div>
    )
  return (
    <section className="card daily-forecast" aria-label="7-day forecast">
      <h2 className="card-title">7-Day Forecast</h2>
      <p className="chart-note">Select a day for rain timing, wind and overnight temperatures.</p>
      {daily.map((day) => {
        const isToday = day.date === today,
          open = expanded === day.date
        const hours = hourly.filter(
          (h) =>
            localDate(h.time, timezone) === day.date &&
            (!isToday || Date.parse(h.time) >= Math.floor(now / 3_600_000) * 3_600_000),
        )
        const night = overnightHours(hourly, day.date, timezone)
        const completeNight =
          night.length > 0 &&
          localDate(night[0].time, timezone) === day.date &&
          localHour(night[0].time, timezone) === 18 &&
          localDate(night[night.length - 1].time, timezone) === nextDate(day.date) &&
          localHour(night[night.length - 1].time, timezone) === 8 &&
          night.every((h, i) => i === 0 || Date.parse(h.time) - Date.parse(night[i - 1].time) === 3_600_000)
        const nightTemps = night.map((h) => h.temperature).filter(isReading)
        const overnight = nightTemps.length ? Math.round(Math.min(...nightTemps)) : null
        const label = isToday
          ? 'Today'
          : new Date(`${day.date}T12:00:00Z`).toLocaleDateString([], {
              timeZone: 'UTC',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
        return (
          <div key={day.date} className={isToday ? 'forecast-day today' : 'forecast-day'}>
            <button
              className="forecast-day-toggle"
              aria-expanded={open}
              aria-controls={`forecast-${day.date}`}
              onClick={() => setExpanded(open ? null : day.date)}
            >
              <span className="forecast-date">{label}</span>
              <span aria-hidden="true">{day.icon}</span>
              <span className="forecast-condition">{day.condition}</span>
              <span>
                <b>{reading(day.tempMax, '°')}</b> / {reading(day.tempMin, '°')}
              </span>
              <span>
                {day.precipProbability ?? '—'}% <span aria-hidden="true">{open ? '−' : '+'}</span>
              </span>
            </button>
            {open && (
              <div id={`forecast-${day.date}`} className="forecast-details">
                <h3>
                  {label} · {timezone.replace(/_/g, ' ')}
                </h3>
                <p>
                  Daily precipitation: {precipitationAmount(day.precipSum)} in · Peak chance:{' '}
                  {reading(day.precipProbability, '%')}.
                </p>
                <p>
                  Wind up to {reading(day.windMax, ' mph')} · Gusts up to {reading(day.windGusts, ' mph')}.
                </p>
                <p>
                  Overnight low: {overnight === null ? 'Unavailable' : `${overnight}°F`}{' '}
                  <small>
                    (6 PM–9 AM
                    {!completeNight || nightTemps.length < night.length ? '; partial forecast coverage' : ''})
                  </small>
                  .
                </p>
                {hours.length ? (
                  <div
                    className="forecast-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label={`Hourly forecast for ${label}`}
                  >
                    <table>
                      <caption>Hourly forecast · precip/gusts in following hour · °F, in, mph</caption>
                      <thead>
                        <tr>
                          <th scope="col">Time</th>
                          <th scope="col">Conditions</th>
                          <th scope="col">Temp</th>
                          <th scope="col">Precip</th>
                          <th scope="col">Wind / gust</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hours.map((h) => (
                          <tr key={h.time}>
                            <th scope="row">
                              <time dateTime={h.time}>{weatherTime(h.time, timezone)}</time>
                            </th>
                            <td>
                              {h.icon} {h.condition}
                            </td>
                            <td>{reading(h.temperature, '°')}</td>
                            <td>
                              {reading(h.precipProbability, '%')} / {precipitationAmount(h.precipitation)} in
                            </td>
                            <td>
                              {reading(h.windSpeed)} / {reading(h.windGusts)} mph
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No upcoming hourly forecast available for this day.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
