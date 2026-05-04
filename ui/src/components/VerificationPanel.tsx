/** Alert verification — last 24h hit-rate + average lead time per category.
 * Useful retrospective view; quietly hides when there are no events to score. */
import { useEffect, useState } from 'react'
import type { VerificationResponse } from '../types'
import { fetchVerification } from '../api'

const BUCKET_LABELS: Record<string, { label: string; color: string }> = {
  tornado: { label: 'Tornado', color: '#ef4444' },
  severe: { label: 'Severe', color: '#f97316' },
  flood: { label: 'Flash Flood', color: '#22c55e' },
}

export default function VerificationPanel() {
  const [data, setData] = useState<VerificationResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const d = await fetchVerification()
        if (!cancelled) setData(d)
      } catch { /* */ }
    }
    tick()
    const t = setInterval(tick, 5 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  if (!data) return null
  const totalEvents = Object.values(data.summary).reduce((s, b) => s + b.events, 0)
  if (totalEvents === 0) return null

  return (
    <div className="card">
      <div className="card-title">🎯 NWS Verification (24h)</div>
      <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(['tornado', 'severe', 'flood'] as const).map((cat) => {
          const b = data.summary[cat]
          if (b.events === 0) return null
          const meta = BUCKET_LABELS[cat]
          return (
            <div
              key={cat}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${meta.color}`, borderRadius: 4, padding: '4px 8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {b.verified}/{b.events} verified
                  {b.verification_pct != null && ` (${b.verification_pct}%)`}
                </span>
              </div>
              {b.avg_lead_min != null && (
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  Avg lead time: <b style={{ color: meta.color }}>{b.avg_lead_min}m</b>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
