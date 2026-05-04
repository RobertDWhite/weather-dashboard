/** AI-generated weather briefing — 2-3 sentence summary of current threats.
 * Backed by Ollama via /briefing/now. Only renders when Ollama is reachable
 * (auto-checks /briefing/status on mount). */
import { useEffect, useState } from 'react'
import type { BriefingResponse } from '../types'
import { fetchBriefing, fetchBriefingStatus } from '../api'

export default function BriefingPanel() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [data, setData] = useState<BriefingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-poll status every 5 min so we recover from transient outages without
  // requiring a full page reload
  useEffect(() => {
    let cancelled = false
    const tick = () => fetchBriefingStatus()
      .then((s) => { if (!cancelled) setAvailable(s.ok) })
      .catch(() => { if (!cancelled) setAvailable(false) })
    tick()
    const t = setInterval(tick, 5 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchBriefing()
      setData(d)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (available !== true) return
    refresh()
    // Refresh every 10 min
    const t = setInterval(refresh, 10 * 60_000)
    return () => clearInterval(t)
  }, [available])

  if (available === false) return null
  if (available === null) return null

  return (
    <div
      className="card"
      style={{
        borderTop: '2px solid #22d3ee',
      }}
    >
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
            <div style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}>
              {data.text || 'No active threats.'}
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
