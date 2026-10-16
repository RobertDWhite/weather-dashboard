import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
/** Alert verification — last 24h hit-rate + average lead time per category.
 * Useful retrospective view; quietly hides when there are no events to score. */
import { fetchVerification } from '../api'

const BUCKET_LABELS: Record<string, { label: string; color: string }> = {
  tornado: { label: 'Tornado', color: '#ef4444' },
  severe: { label: 'Severe', color: '#f97316' },
  flood: { label: 'Flash Flood', color: '#22c55e' },
}

export default function VerificationPanel() {
  const feed = useFeed('verification', fetchVerification, { interval: 300_000 })
  const data = feed.data
  if (!data) return <FeedStatus feed={feed} name="Verification" />
  const totalEvents = Object.values(data.summary).reduce((s, b) => s + b.events, 0)
  if (totalEvents === 0) return <><FeedStatus feed={feed} name="Verification" />{feed.status === 'success' && <p className="notice">No verification reports available.</p>}</>

  return (
    <div className="card">
      <FeedStatus feed={feed} name="Verification" />
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
