import { useEffect, useState } from 'react'

type WpcView =
  | 'fronts'
  | 'qpf24'
  | 'qpf120'
  | 'ero1'
  | 'snow24_4in'
  | 'snow24_8in'
  | 'snow72_8in'
  | 'ice24_quarter'

const WPC_LABELS: Record<WpcView, string> = {
  fronts: 'Fronts',
  qpf24: 'QPF 24h',
  qpf120: 'QPF 5-day',
  ero1: 'ERO',
  snow24_4in: 'Snow 4"/24h',
  snow24_8in: 'Snow 8"/24h',
  snow72_8in: 'Snow 8"/72h',
  ice24_quarter: 'Ice ¼"/24h',
}

// Proxy through our API to bypass cross-origin / referer blocks. Backend
// fetches the canonical "current" filename from WPC and caches 10 min.
const WPC_URLS: Record<WpcView, string> = {
  fronts: '/api/spc/proxy/wpc/fronts',
  qpf24: '/api/spc/proxy/wpc/qpf24',
  qpf120: '/api/spc/proxy/wpc/qpf120',
  ero1: '/api/spc/proxy/wpc/ero1',
  snow24_4in: '/api/spc/proxy/wpc/snow24_4in',
  snow24_8in: '/api/spc/proxy/wpc/snow24_8in',
  snow72_8in: '/api/spc/proxy/wpc/snow72_8in',
  ice24_quarter: '/api/spc/proxy/wpc/ice24_quarter',
}

const ERO_LABELS = [
  { label: 'HIGH', color: '#ff00ff' },
  { label: 'MDT',  color: '#ff2d55' },
  { label: 'SLGT', color: '#ddaa00' },
  { label: 'MRGL', color: '#339900' },
]

export default function WpcPanel() {
  const [tab, setTab] = useState<WpcView>('fronts')
  const [imgError, setImgError] = useState(false)
  const [bust, setBust] = useState<number>(() => Date.now())

  useEffect(() => { setImgError(false) }, [tab])
  useEffect(() => {
    const t = setInterval(() => setBust(Date.now()), 10 * 60_000)
    return () => clearInterval(t)
  }, [])

  const url = `${WPC_URLS[tab]}?t=${bust}`
  const isEro = tab === 'ero1'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">
        🌧 WPC
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(Object.keys(WPC_LABELS) as WpcView[]).map((d) => (
            <button
              key={d}
              onClick={() => setTab(d)}
              style={{
                padding: '1px 5px',
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 700,
                background: tab === d ? 'var(--accent-blue)' : 'var(--bg-base)',
                color: tab === d ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${tab === d ? 'var(--accent-blue)' : 'var(--border)'}`,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {WPC_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!imgError ? (
          <a
            href="https://www.wpc.ncep.noaa.gov/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block' }}
            title="Open WPC site"
          >
            <img
              src={url}
              alt={`WPC ${WPC_LABELS[tab]}`}
              onError={() => setImgError(true)}
              loading="lazy"
              style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)', display: 'block', background: '#fff' }}
            />
          </a>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            WPC image unavailable
          </div>
        )}

        {isEro && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ERO_LABELS.map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        <a
          href="https://www.wpc.ncep.noaa.gov/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--accent-cyan)', textDecoration: 'none' }}
        >
          → Weather Prediction Center ↗
        </a>
      </div>
    </div>
  )
}
