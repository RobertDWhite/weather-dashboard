import { useEffect, useState } from 'react'

const SPC_LABELS = [
  { label: 'HIGH', color: '#ff0000', full: 'High Risk' },
  { label: 'MDT',  color: '#ff6600', full: 'Moderate Risk' },
  { label: 'ENH',  color: '#ddaa00', full: 'Enhanced Risk' },
  { label: 'SLGT', color: '#339900', full: 'Slight Risk' },
  { label: 'MRGL', color: '#006600', full: 'Marginal Risk' },
]

type Day = 'day1' | 'day2' | 'day3'

// Proxy through our API: SPC's direct image URLs return 403 to browser
// requests with a Referer (cross-origin block). The /api/spc/outlook-image
// endpoint fetches server-side, caches, and serves with permissive CORS.
const URLS: Record<Day, string> = {
  day1: '/api/spc/outlook-image/day1',
  day2: '/api/spc/outlook-image/day2',
  day3: '/api/spc/outlook-image/day3',
}
const LABELS: Record<Day, string> = {
  day1: 'Day 1',
  day2: 'Day 2',
  day3: 'Day 3',
}

export default function SpcOutlook() {
  const [tab, setTab] = useState<Day>('day1')
  const [imgError, setImgError] = useState(false)
  // Cache-bust timestamp — initialized once, refreshed every 10 min so the
  // browser pulls a fresh outlook GIF after SPC issues an update.
  const [bust, setBust] = useState<number>(() => Date.now())

  useEffect(() => { setImgError(false) }, [tab])

  useEffect(() => {
    const t = setInterval(() => setBust(Date.now()), 10 * 60_000)
    return () => clearInterval(t)
  }, [])

  const imgUrl = `${URLS[tab]}?t=${bust}`

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">
        🌪️ SPC Outlook
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['day1', 'day2', 'day3'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setTab(d)}
              style={{
                padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: tab === d ? 'var(--accent-blue)' : 'var(--bg-base)',
                color: tab === d ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${tab === d ? 'var(--accent-blue)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!imgError ? (
          <a
            href="https://www.spc.noaa.gov/products/outlook/"
            target="_blank"
            rel="noopener noreferrer"
            title="Open full SPC outlook"
            style={{ display: 'block' }}
          >
            <img
              src={imgUrl}
              alt={`SPC ${LABELS[tab]} convective outlook`}
              onError={() => setImgError(true)}
              loading="lazy"
              style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)', display: 'block' }}
            />
          </a>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            Outlook image unavailable
            <button
              onClick={() => { setImgError(false); setBust(Date.now()) }}
              style={{
                display: 'block', margin: '8px auto 0',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--accent-cyan)', borderRadius: 3,
                padding: '3px 10px', fontSize: 10, cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SPC_LABELS.map(({ label, color, full }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <div style={{ width: 10, height: 10, background: color, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-muted)' }}>{full}</span>
            </div>
          ))}
        </div>

        <a
          href="https://www.spc.noaa.gov/products/outlook/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--accent-cyan)', textDecoration: 'none' }}
        >
          → Full SPC Outlook ↗
        </a>
      </div>
    </div>
  )
}
