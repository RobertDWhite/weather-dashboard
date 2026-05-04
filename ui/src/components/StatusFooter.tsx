import { useEffect, useState } from 'react'
import type { HealthResponse } from '../types'
import { fetchHealth } from '../api'
import PushSubscribeButton from './PushSubscribeButton'
import LocaleSelector from './LocaleSelector'

const SOURCE_LABELS: Record<string, string> = {
  nws_alerts: 'NWS Alerts',
  spc_outlook: 'SPC Outlook',
  spc_reports: 'SPC Reports',
  rainviewer: 'RainViewer',
  open_meteo: 'Open-Meteo',
  nhc: 'NHC',
  aviation_metar: 'METAR',
}

interface Props {
  alarmEnabled: boolean
  onAlarmToggle: (enabled: boolean) => void
  onTestAlarm?: () => void
  apiVersion?: string
  apiBuiltAt?: string
  alarmRepeating?: boolean
  alarmSilenced?: boolean
  onSilenceAlarm?: () => void
  webhookConfigured?: boolean
  tvMode?: boolean
  onTvModeToggle?: (b: boolean) => void
}

const UI_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

function shortDate(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function StatusFooter({
  alarmEnabled, onAlarmToggle, onTestAlarm, apiVersion, apiBuiltAt,
  alarmRepeating, alarmSilenced, onSilenceAlarm, webhookConfigured,
  tvMode, onTvModeToggle,
}: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const h = await fetchHealth()
        if (!cancelled) setHealth(h)
      } catch {
        if (!cancelled) setHealth(null)
      }
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const sources = health?.sources ?? {}
  const sourceKeys = Object.keys(SOURCE_LABELS)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 10px',
        background: 'var(--bg-base)',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {sourceKeys.map((k) => {
          const s = sources[k]
          const ok = s?.ok
          const color = ok === true ? '#22c55e' : ok === false ? '#ef4444' : '#6b7280'
          return (
            <span
              key={k}
              title={s?.error || (s ? `${s.status}` : 'unknown')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 4px ${color}88`,
                  flexShrink: 0,
                }}
              />
              {SOURCE_LABELS[k]}
            </span>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          title={`UI v${UI_VERSION}${BUILD_TIME ? ` (built ${shortDate(BUILD_TIME)})` : ''}${apiVersion ? `\nAPI v${apiVersion}${apiBuiltAt ? ` (built ${shortDate(apiBuiltAt)})` : ''}` : ''}`}
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '2px 6px',
            border: '1px solid var(--border)',
            borderRadius: 3,
            background: 'transparent',
            cursor: 'help',
          }}
        >
          UI {UI_VERSION}
          {apiVersion && <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}> · API {apiVersion}</span>}
        </span>

        <LocaleSelector />
        <PushSubscribeButton />

        {onTvModeToggle && (
          <button
            onClick={() => onTvModeToggle(!tvMode)}
            style={{
              background: tvMode ? '#0f172a' : 'transparent',
              border: '1px solid var(--border)',
              color: tvMode ? 'var(--accent-cyan)' : 'var(--text-muted)',
              padding: '3px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
            title="Kiosk / TV mode — hides side panels and maximizes the map"
          >
            📺 {tvMode ? 'EXIT TV' : 'TV'}
          </button>
        )}

        {webhookConfigured && (
          <span
            title="Outbound webhook configured — Discord/Slack notifications will fire on new tornado/severe alerts"
            style={{
              fontSize: 9,
              color: '#22c55e',
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              padding: '2px 6px',
              border: '1px solid #22c55e55',
              borderRadius: 3,
            }}
          >
            🪝 Webhook
          </span>
        )}

        <button
          onClick={() => onAlarmToggle(!alarmEnabled)}
          style={{
            background: alarmEnabled ? '#7f1d1d' : 'var(--bg-card)',
            border: `1px solid ${alarmEnabled ? '#ef4444' : 'var(--border)'}`,
            color: alarmEnabled ? '#fecaca' : 'var(--text-muted)',
            padding: '3px 8px',
            borderRadius: 3,
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            boxShadow: alarmRepeating ? '0 0 0 2px rgba(239,68,68,0.4)' : undefined,
            animation: alarmRepeating ? 'pulse-red 1.5s ease-in-out infinite' : undefined,
          }}
          title={alarmEnabled ? 'Audio alarm enabled — click to disable' : 'Click to enable audio alarm for tornado/severe warnings'}
        >
          {alarmRepeating ? '🚨 ALERT ACTIVE' : alarmEnabled ? '🔊 Alarm ON' : '🔇 Alarm OFF'}
        </button>

        {alarmRepeating && onSilenceAlarm && !alarmSilenced && (
          <button
            onClick={onSilenceAlarm}
            style={{
              background: 'transparent',
              border: '1px solid #facc15',
              color: '#facc15',
              padding: '3px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
            title="Silence the repeating alarm for 30 minutes (auto-clears when alerts end)"
          >
            🔕 Silence 30m
          </button>
        )}

        {onTestAlarm && alarmEnabled && !alarmRepeating && (
          <button
            onClick={onTestAlarm}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '3px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
            }}
          >
            Test
          </button>
        )}
      </div>
    </div>
  )
}
