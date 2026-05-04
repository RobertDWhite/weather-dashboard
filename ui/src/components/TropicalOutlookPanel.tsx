import { useEffect, useState } from 'react'
import type { TropicalDisturbance, TropicalOutlookResponse } from '../types'
import { fetchTropicalOutlook } from '../api'

const CAT_COLOR: Record<string, string> = {
  low: '#facc15',
  medium: '#f97316',
  high: '#ef4444',
}

function Pill({ p }: { p: { category: string; probability: string } | null }) {
  if (!p) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
  const color = CAT_COLOR[p.category] || '#94a3b8'
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 3,
      fontSize: 10,
      fontWeight: 700,
      background: `${color}33`,
      color,
      border: `1px solid ${color}77`,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}>
      {p.category} {p.probability}
    </span>
  )
}

function Disturbance({ d }: { d: TropicalDisturbance }) {
  return (
    <a
      href={d.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        padding: '6px 8px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid #22d3ee',
        borderRadius: 4,
        textDecoration: 'none',
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', marginBottom: 2 }}>
        {d.basin === 'AT' ? '🌀 Atlantic' : '🌀 East Pacific'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
        {(d.title || '').replace(/^Atlantic Tropical Weather Outlook\s*-?\s*/i, '').replace(/^East Pacific Tropical Weather Outlook\s*-?\s*/i, '').slice(0, 120)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>2-day:</span>
          <Pill p={d.two_day} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>7-day:</span>
          <Pill p={d.seven_day} />
        </div>
      </div>
    </a>
  )
}

export default function TropicalOutlookPanel() {
  const [data, setData] = useState<TropicalOutlookResponse | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchTropicalOutlook()
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    const t = setInterval(() => {
      fetchTropicalOutlook().then((d) => { if (!cancelled) setData(d) }).catch(() => {})
    }, 30 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  if (!loaded) return null
  const all = [...(data?.atlantic ?? []), ...(data?.east_pacific ?? [])]
  if (all.length === 0) return null

  return (
    <div className="card">
      <div className="card-title">
        🌀 Tropical Weather Outlook
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
          ({all.length})
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
        {all.map((d, i) => (
          <Disturbance key={`${d.basin}-${i}`} d={d} />
        ))}
      </div>
    </div>
  )
}
