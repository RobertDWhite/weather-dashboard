import type { StormReports } from '../types'

interface Props {
  reports: StormReports | null
  onLocate: (lat: number, lon: number, zoom?: number) => void
}

type ReportType = 'tornado' | 'hail' | 'wind'

const TABS: { key: ReportType; label: string; emoji: string; color: string }[] = [
  { key: 'tornado', label: 'Tornado', emoji: '🌪️', color: '#ff2d55' },
  { key: 'hail',    label: 'Hail',    emoji: '🧊', color: '#00ccff' },
  { key: 'wind',    label: 'Wind',    emoji: '💨', color: '#ffd60a' },
]

export default function StormReportsPanel({ reports, onLocate }: Props) {
  if (!reports) {
    return (
      <div className="card">
        <div className="card-title">⚡ Storm Reports</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">
        ⚡ Storm Reports
        <span style={{ marginLeft: 'auto', color: reports.total > 0 ? 'var(--warn-orange)' : 'var(--warn-green)', fontWeight: 700 }}>
          {reports.total}
        </span>
      </div>

      {reports.total === 0 ? (
        <div style={{ color: 'var(--warn-green)', fontSize: 12, padding: '8px 0' }}>
          ✓ No storm reports today
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 220 }}>
          {TABS.map(({ key, emoji, color }) => {
            const items = reports[key].slice(0, 10)
            if (!items.length) return null
            return (
              <div key={key}>
                <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  {emoji} {key} ({reports[key].length})
                </div>
                {items.map((r, i) => (
                  <div
                    key={i}
                    onClick={() => onLocate(r.lat, r.lon, 10)}
                    style={{
                      padding: '4px 6px',
                      borderRadius: 4,
                      background: 'var(--bg-base)',
                      marginBottom: 3,
                      cursor: 'pointer',
                      fontSize: 11,
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{r.time}Z</span>
                    {' '}
                    <span style={{ color: 'var(--text-primary)' }}>{r.location}, {r.state}</span>
                    {key === 'tornado' && r.magnitude && (
                      <span style={{ color, fontWeight: 700 }}> {r.magnitude}</span>
                    )}
                    {key === 'hail' && r.size && (
                      <span style={{ color }}> {r.size}"</span>
                    )}
                    {key === 'wind' && r.speed && (
                      <span style={{ color }}> {r.speed}mph</span>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <a
        href="https://www.spc.noaa.gov/climo/reports/today.html"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 10, color: 'var(--accent-cyan)', textDecoration: 'none', marginTop: 6 }}
      >
        → Full SPC Reports ↗
      </a>
    </div>
  )
}
