/** AI-generated weather briefing — 2-3 sentence summary of current threats.
 * Backed by Ollama via /briefing/now. Only renders when Ollama is reachable
 * (auto-checks /briefing/status on mount). */
import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
import { fetchBriefing, fetchBriefingStatus } from '../api'

export default function BriefingPanel() {
  const availability = useFeed('briefing-status', fetchBriefingStatus, { interval: 300_000 })
  const feed = useFeed('briefing', fetchBriefing, { enabled: availability.data?.ok === true, interval: 600_000 })
  const data = feed.data
  const loading = feed.refreshing
  const error = feed.error
  const refresh = feed.retry
  if (!availability.data) return <FeedStatus feed={availability} name="AI briefing service" />
  if (!availability.data.ok) return <p className="notice">AI briefing is not configured or the model service is unavailable. <button className="quiet-button" onClick={availability.retry}>Retry service</button></p>

  return (
    <div
      className="card"
      style={{
        borderTop: '2px solid #22d3ee',
      }}
    >
      <FeedStatus feed={feed} name="AI briefing" />
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🤖 AI Briefing</span>
        {data && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>
            {data.model}
          </span>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '…' : '↻'}
        </button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {error && (
          <div style={{ fontSize: 11, color: '#fca5a5' }}>
            Briefing unavailable
          </div>
        )}
        {!error && data && (
          <>
            {data.source === 'fallback' && <p className="notice">AI unavailable · showing a basic weather summary. Retry to reconnect.</p>}
            <div style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}>
              {data.text || 'No briefing text returned.'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{data.context.alerts_count} alert(s)</span>
              <span>{data.context.lsrs_count} LSR(s)</span>
              {data.context.has_afd && <span>· AFD ✓</span>}
              {data.context.has_hwo && <span>· HWO ✓</span>}
              <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
                {new Date(data.generated_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </>
        )}
        {!error && !data && loading && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Generating briefing…</div>
        )}
      </div>
    </div>
  )
}
