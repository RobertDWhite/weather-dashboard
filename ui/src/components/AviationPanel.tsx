/** Aviation Weather Center products: TAFs (terminal area forecasts), PIREPs
 * (pilot reports), and the active SIGMET/AIRMET counts. Intended for the
 * sidebar — the overlay layers (PIREP markers) live in HazardLayers. */
import { useEffect, useState } from 'react'
import type { PirepEntry, TafEntry } from '../types'
import { fetchAirmets, fetchPireps, fetchSigmets, fetchTafs } from '../api'

interface Props {
  homeLat: number
  homeLon: number
  onLocate?: (lat: number, lon: number) => void
}

type Tab = 'taf' | 'pirep' | 'sigmet'

const TAB_LABELS: Record<Tab, string> = {
  taf: 'TAF',
  pirep: 'PIREP',
  sigmet: 'SIG/AIR',
}

export default function AviationPanel({ homeLat, homeLon, onLocate }: Props) {
  const [tab, setTab] = useState<Tab>('taf')
  const [tafs, setTafs] = useState<TafEntry[]>([])
  const [pireps, setPireps] = useState<PirepEntry[]>([])
  const [counts, setCounts] = useState<{ sigmet: number; airmet: number }>({ sigmet: 0, airmet: 0 })

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const [t, p, s, a] = await Promise.allSettled([
          fetchTafs(homeLat, homeLon),
          fetchPireps(homeLat, homeLon),
          fetchSigmets(),
          fetchAirmets(),
        ])
        if (cancelled) return
        if (t.status === 'fulfilled') setTafs(t.value.tafs)
        if (p.status === 'fulfilled') setPireps(p.value.pireps)
        const c = { sigmet: 0, airmet: 0 }
        if (s.status === 'fulfilled') c.sigmet = s.value.count
        if (a.status === 'fulfilled') c.airmet = a.value.count
        setCounts(c)
      } catch { /* */ }
    }
    tick()
    const t = setInterval(tick, 5 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [homeLat, homeLon])

  return (
    <div className="card">
      <div className="card-title">
        ✈ Aviation
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['taf', 'pirep', 'sigmet'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              style={{
                padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: tab === t ? 'var(--accent-cyan)' : 'var(--bg-base)',
                color: tab === t ? '#000' : 'var(--text-muted)',
                border: `1px solid ${tab === t ? 'var(--accent-cyan)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 6, maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tab === 'taf' && tafs.map((t) => (
          <button
            key={t.icao || `${t.lat}-${t.lon}`}
            onClick={() => onLocate?.(t.lat, t.lon)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderLeft: '3px solid #22d3ee', borderRadius: 4,
              padding: '4px 8px', cursor: 'pointer', textAlign: 'left',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: '#22d3ee' }}>{t.icao}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t.distance_km} km</span>
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.3, marginTop: 2 }}>
              {(t.raw_taf || '').slice(0, 280)}
            </div>
          </button>
        ))}

        {tab === 'pirep' && pireps.map((p, i) => (
          <button
            key={i}
            onClick={() => onLocate?.(p.lat, p.lon)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderLeft: '3px solid #fbbf24', borderRadius: 4,
              padding: '4px 8px', cursor: 'pointer', textAlign: 'left',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              <span>{p.aircraft_type || '—'}</span>
              <span>FL{p.altitude_ft != null ? Math.round(p.altitude_ft / 100) : '—'}</span>
              <span style={{ marginLeft: 'auto' }}>{p.obs_time?.slice(11, 16)}Z</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.35 }}>
              {(p.raw_text || '').slice(0, 220)}
            </div>
          </button>
        ))}

        {tab === 'sigmet' && (
          <div style={{ padding: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: 4 }}>Active SIGMETs: <b style={{ color: '#ef4444' }}>{counts.sigmet}</b></div>
            <div>Active AIRMETs: <b style={{ color: '#facc15' }}>{counts.airmet}</b></div>
            <a
              href="https://aviationweather.gov/airsigmet"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10, color: 'var(--accent-cyan)', display: 'inline-block', marginTop: 8 }}
            >
              View on aviationweather.gov →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
