import type { HourlyPeriod } from './types'

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(key: string, options: Intl.DateTimeFormatOptions, locale?: string) {
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale, options))
  return formatters.get(key)!
}
export function localDate(value: string | number | Date, timezone: string) {
  const parts = formatter(
    `date:${timezone}`,
    {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
    'en-US',
  ).formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function localHour(value: string, timezone: string) {
  return Number(
    formatter(`hour:${timezone}`, { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }, 'en-US').format(
      new Date(value),
    ),
  )
}
export function weatherTime(value: string | number, timezone: string, withDay = false) {
  return formatter(`time:${timezone}:${withDay}`, {
    timeZone: timezone,
    ...(withDay ? { weekday: 'short' as const } : {}),
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
export function upcomingHours(hourly: HourlyPeriod[], now = Date.now(), count = 36) {
  const start = Math.floor(now / 3_600_000) * 3_600_000
  return hourly
    .filter((h) => Number.isFinite(Date.parse(h.time)) && Date.parse(h.time) >= start)
    .slice(0, count)
}
export function nextDate(date: string) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}
export function overnightHours(hourly: HourlyPeriod[], date: string, timezone: string) {
  const following = nextDate(date)
  return hourly.filter((h) => {
    const day = localDate(h.time, timezone),
      hour = localHour(h.time, timezone)
    return (day === date && hour >= 18) || (day === following && hour < 9)
  })
}

export function isReading(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
export function reading(value: number | null | undefined, unit = '', digits = 0) {
  return isReading(value) ? `${value.toFixed(digits)}${unit}` : 'Unavailable'
}
export function precipitationAmount(value: number | null | undefined) {
  return isReading(value) ? (value > 0 && value < 0.01 ? '<0.01' : value.toFixed(2)) : 'Unavailable'
}
