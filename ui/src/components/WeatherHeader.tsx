import { useEffect, useState } from 'react'
import { format } from 'date-fns'

interface Props {
  location: string
  lastUpdate: Date
  alertCount: number
  onAlertsClick?: () => void
  compact?: boolean
}

export default function WeatherHeader({ location, lastUpdate, alertCount, onAlertsClick, compact }: Props) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #060b14 0%, #0d1625 40%, #060b14 100%)',
        borderBottom: '1px solid var(--border-bright)',
        padding: compact ? '6px 12px' : '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: compact ? 8 : 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 12 }}>
        <span style={{ fontSize: compact ? 18 : 22 }}>🌩️</span>
        <div>
          {!compact && (
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
              Weather Dashboard
            </div>
          )}
          <div style={{ fontSize: compact ? 13 : 12, fontWeight: compact ? 700 : 400, color: compact ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
            {location}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 24, fontSize: 12 }}>
        {alertCount > 0 ? (
          <button
            onClick={onAlertsClick}
            className="animate-pulse-red"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--warn-red)',
              fontWeight: 700,
              background: 'rgba(255,45,85,0.1)',
              border: '1px solid rgba(255,45,85,0.35)',
              borderRadius: 5,
              padding: compact ? '4px 8px' : '4px 10px',
              cursor: 'pointer',
              fontSize: compact ? 11 : 12,
              letterSpacing: 0.5,
              transition: 'background 0.15s',
            }}
            title="Click to view all active alerts"
          >
            ⚠ {alertCount}{compact ? '' : ` ACTIVE ALERT${alertCount !== 1 ? 'S' : ''}`} ↗
          </button>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--warn-green)', display: 'flex', alignItems: 'center', gap: 5 }}>
            ✓ {compact ? 'Clear' : 'No active alerts'}
          </div>
        )}
        {!compact && (
          <>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Updated {format(lastUpdate, 'HH:mm:ss')}
            </div>
            <div style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>
              {now.toISOString().slice(11, 19)} UTC{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                {now.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </>
        )}
        {compact && (
          <div style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>
            {now.toISOString().slice(11, 16)} UTC
          </div>
        )}
      </div>
    </div>
  )
}
