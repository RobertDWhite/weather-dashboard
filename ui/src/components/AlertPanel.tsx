import type { NWSAlert } from '../types'
export function alertTiming(alert: NWSAlert, timezone = 'UTC') {
  const p = alert.properties
  const format = (value: string) =>
    new Date(value).toLocaleString([], {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  const start = p.onset || p.effective,
    end = p.ends || p.expires
  return [
    start && Number.isFinite(Date.parse(start)) ? `Starts ${format(start)}` : '',
    end && Number.isFinite(Date.parse(end)) ? `Ends ${format(end)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
export function shortAlertArea(area: string) {
  const parts = area
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 2 ? `${parts.slice(0, 2).join('; ')} +${parts.length - 2} more areas` : area
}
interface Props {
  title?: string
  emptyLabel?: string
  alerts: NWSAlert[]
  onLocate: (lat: number, lon: number, zoom?: number) => void
  onOpenDrawer: (id: string) => void
  compact?: boolean
  timezone?: string
  incomplete?: boolean
}
export default function AlertPanel({
  alerts,
  onLocate,
  onOpenDrawer,
  title = 'Active Alerts',
  emptyLabel = 'No active watches or warnings',
  compact = true,
  timezone = 'UTC',
  incomplete = false,
}: Props) {
  const order: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 }
  const sorted = [...alerts].sort(
    (a, b) => (order[a.properties.severity] ?? 4) - (order[b.properties.severity] ?? 4),
  )
  return (
    <section className={`card alert-panel ${compact ? 'compact-alerts' : ''}`} aria-label={title}>
      <h2 className="card-title">
        {title}
        <span>
          {compact && alerts.length > 1 ? (
            <button
              className="alert-count-button"
              onClick={() => onOpenDrawer(sorted[0].properties.id || sorted[0].id)}
            >
              View all {alerts.length}
            </button>
          ) : alerts.length > 0 ? (
            alerts.length
          ) : (
            ''
          )}
        </span>
      </h2>
      {incomplete && (
        <p className="source-warning">
          Some alert areas could not be checked. These are verified alerts; additional nearby threats may be
          missing.
        </p>
      )}
      {!alerts.length ? (
        incomplete ? (
          <p className="source-warning">Alert status is incomplete. An all-clear cannot be confirmed.</p>
        ) : (
          <p className="empty-alerts">✓ {emptyLabel}</p>
        )
      ) : (
        <div className="alert-list">
          {sorted.map((a) => (
            <article className="alert-summary" key={a.properties.id || a.id}>
              <button
                className="alert-open"
                onClick={() => {
                  const geo = a.geometry
                  const ring =
                    geo?.type === 'Polygon'
                      ? (geo.coordinates[0] as number[][])
                      : geo?.type === 'MultiPolygon'
                        ? (geo.coordinates as number[][][][])[0]?.[0]
                        : null
                  if (ring?.length)
                    onLocate(
                      ring.reduce((sum, c) => sum + c[1], 0) / ring.length,
                      ring.reduce((sum, c) => sum + c[0], 0) / ring.length,
                      8,
                    )
                  onOpenDrawer(a.properties.id || a.id)
                }}
              >
                <span className={`sev-pill sev-${a.properties.severity.toLowerCase()}`}>
                  {a.properties.severity}
                </span>{' '}
                <strong>{a.properties.event}</strong>
                <span className="alert-timing">{alertTiming(a, timezone)}</span>
                <span className="alert-area-short">{shortAlertArea(a.properties.areaDesc)}</span>
              </button>
              {compact ? (
                <details className="alert-areas">
                  <summary>All affected areas</summary>
                  <p>{a.properties.areaDesc}</p>
                </details>
              ) : (
                <p className="alert-area-full">{a.properties.areaDesc}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
