import type { HourlyPeriod } from '../types'
import { upcomingHours, weatherTime, isReading, precipitationAmount } from '../weatherTime'
export default function NextHours({
  hourly,
  timezone,
  now,
}: {
  hourly: HourlyPeriod[]
  timezone: string
  now: number
}) {
  const hours = upcomingHours(hourly, now, 12)
  if (!hours.length)
    return (
      <div className="card">
        <h2 className="card-title">Next 12 hours</h2>
        <p>No upcoming hourly forecast available.</p>
      </div>
    )
  const temperatures = hours.map((h) => h.temperature).filter(isReading)
  const gusts = hours.map((h) => h.windGusts).filter(isReading)
  const probabilities = hours.map((h) => h.precipProbability).filter(isReading)
  const completePrecip = hours.every((h) => isReading(h.precipProbability) && isReading(h.precipitation))
  const wet = hours.filter((h) => (h.precipProbability ?? 0) >= 30 || (h.precipitation ?? 0) > 0)
  const amount = hours.reduce((sum, h) => sum + (h.precipitation || 0), 0)
  return (
    <section className="card next-hours" aria-label="Next 12 hours">
      <h2 className="card-title">Next {hours.length} hours</h2>
      <p>
        {temperatures.length
          ? `${Math.round(Math.min(...temperatures))}–${Math.round(Math.max(...temperatures))}°F`
          : 'Temperature unavailable'}{' '}
        · {gusts.length ? `Gusts up to ${Math.round(Math.max(...gusts))} mph` : 'Gust forecast unavailable'}.
      </p>
      <p>
        {wet.length ? (
          <>
            Precipitation possible {weatherTime(wet[0].time, timezone, true)}–
            {weatherTime(Date.parse(wet[wet.length - 1].time) + 3_600_000, timezone, true)} · up to{' '}
            {probabilities.length ? `${Math.max(...probabilities)}% chance` : 'Chance unavailable'} ·{' '}
            {precipitationAmount(amount)} in forecast
            {completePrecip ? '.' : ' in available hours; precipitation data is incomplete.'}
          </>
        ) : completePrecip ? (
          'No precipitation indicated in these forecast hours.'
        ) : (
          'Precipitation data is incomplete; rain timing cannot be confirmed.'
        )}
      </p>
      <small>
        {timezone.replace(/_/g, ' ')} · {weatherTime(hours[0].time, timezone, true)}–
        {weatherTime(Date.parse(hours[hours.length - 1].time) + 3_600_000, timezone, true)}
      </small>
    </section>
  )
}
