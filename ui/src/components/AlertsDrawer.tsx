import { useEffect, useRef, useState } from 'react'
import { useWindowWidth } from '../hooks/useWindowWidth'
import { format, parseISO } from 'date-fns'
import type { NWSAlert } from '../types'
import CameraPanel from './CameraPanel'
import { buildAlertQuery } from '../alertQuery'

interface Props {
  alerts: NWSAlert[]
  onLocate: (lat: number, lon: number, zoom?: number) => void
  onClose: () => void
  focusAlertId?: string
}

const SEV_ORDER: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 }
const SEV_COLOR: Record<string, string> = {
  Extreme: '#ff2d55', Severe: '#ff6b35', Moderate: '#ffd60a', Minor: '#30d158',
}
const SEV_BG: Record<string, string> = {
  Extreme: 'rgba(255,45,85,0.07)',
  Severe: 'rgba(255,107,53,0.06)',
  Moderate: 'rgba(255,214,10,0.05)',
  Minor: 'rgba(48,209,88,0.04)',
}

const EVENT_EMOJI: Record<string, string> = {
  'Tornado Warning': '🌪️',
  'Tornado Watch': '👁️',
  'Severe Thunderstorm Warning': '⛈️',
  'Severe Thunderstorm Watch': '⛅',
  'Flash Flood Emergency': '🚨',
  'Flash Flood Warning': '🌊',
  'Flash Flood Watch': '🌧️',
  'Flood Warning': '💧',
  'Flood Watch': '💧',
  'Winter Storm Warning': '❄️',
  'Winter Storm Watch': '❄️',
  'Blizzard Warning': '🌨️',
  'Ice Storm Warning': '🧊',
  'High Wind Warning': '💨',
  'Wind Advisory': '💨',
  'Hurricane Warning': '🌀',
  'Tropical Storm Warning': '🌀',
  'Freeze Watch': '🌡️',
  'Freeze Warning': '🌡️',
  'Frost Advisory': '❄️',
  'Special Weather Statement': '📢',
  'Dense Fog Advisory': '🌫️',
}

function centroid(geo: NWSAlert['geometry']): [number, number] | null {
  if (!geo) return null
  let coords: number[][] = []
  if (geo.type === 'Polygon') coords = geo.coordinates[0] as number[][]
  else if (geo.type === 'MultiPolygon') coords = (geo.coordinates as number[][][][])[0][0]
  if (!coords.length) return null
  return [
    coords.reduce((s, c) => s + c[1], 0) / coords.length,
    coords.reduce((s, c) => s + c[0], 0) / coords.length,
  ]
}

export default function AlertsDrawer({ alerts, onLocate, onClose, focusAlertId }: Props) {
  const isMobile = useWindowWidth() < 768
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(focusAlertId ?? null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusAlertId) return
    const t = setTimeout(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-alert-id="${focusAlertId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(t)
  }, [focusAlertId])

  const filtered = [...alerts]
    .sort((a, b) => (SEV_ORDER[a.properties.severity] ?? 4) - (SEV_ORDER[b.properties.severity] ?? 4))
    .filter((a) =>
      !search ||
      a.properties.event.toLowerCase().includes(search.toLowerCase()) ||
      a.properties.areaDesc.toLowerCase().includes(search.toLowerCase()) ||
      (a.properties.senderName ?? '').toLowerCase().includes(search.toLowerCase())
    )

  const bySeverity: Record<string, NWSAlert[]> = {}
  filtered.forEach((a) => {
    const s = a.properties.severity
    if (!bySeverity[s]) bySeverity[s] = []
    bySeverity[s].push(a)
  })

  const handleLocate = (a: NWSAlert) => {
    const c = centroid(a.geometry)
    if (c) { onLocate(c[0], c[1], 8); onClose() }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(6,11,20,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        className="alerts-drawer-panel"
        style={{
          width: 500,
          maxWidth: '96vw',
          height: '100vh',
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-bright)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slide-in-right 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-bright)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
            background: 'rgba(255,45,85,0.06)',
          }}
        >
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warn-red)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Active Alerts
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {alerts.length} total · click any alert to jump map
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              borderRadius: 5,
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            autoFocus={!isMobile}
            placeholder="Filter by event, area, or office…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)',
              borderRadius: 5,
              padding: '6px 10px',
              fontSize: 16,
              outline: 'none',
            }}
          />
        </div>

        {/* Alert list */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px' }}>
          {Object.entries(bySeverity).map(([sev, sevAlerts]) => {
            const color = SEV_COLOR[sev] ?? '#888'
            return (
              <div key={sev} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 2,
                    color,
                    textTransform: 'uppercase',
                    padding: '6px 0 5px',
                    borderBottom: `1px solid ${color}33`,
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  {sev} · {sevAlerts.length} alert{sevAlerts.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {sevAlerts.map((a) => {
                    const emoji = EVENT_EMOJI[a.properties.event] ?? '⚠️'
                    const endsAt = a.properties.ends || a.properties.expires
                    const endsStr = endsAt ? format(parseISO(endsAt), 'MMM d, h:mm a') : null
                    const bg = SEV_BG[sev] ?? 'transparent'
                    const canLocate = !!centroid(a.geometry)
                    const isExpanded = expandedId === a.properties.id

                    return (
                      <div
                        key={a.properties.id}
                        data-alert-id={a.properties.id}
                        style={{
                          borderRadius: 6,
                          background: bg,
                          border: `1px solid ${isExpanded ? color + '66' : color + '33'}`,
                          borderLeft: `3px solid ${color}`,
                          overflow: 'hidden',
                          boxShadow: isExpanded ? `0 0 0 1px ${color}33` : 'none',
                        }}
                      >
                        {/* Summary row */}
                        <div
                          onClick={() => setExpandedId(isExpanded ? null : a.properties.id)}
                          style={{
                            padding: '8px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{emoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>
                              {a.properties.event}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
                              {a.properties.areaDesc}
                            </div>
                            {endsStr && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                Until {endsStr}
                                {a.properties.senderName ? ` · ${a.properties.senderName.replace('NWS ', '')}` : ''}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 9, color: isExpanded ? color : 'var(--text-muted)', letterSpacing: 0.5 }}>
                              {isExpanded ? '▲ LESS' : '▼ MORE'}
                            </span>
                            {canLocate && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleLocate(a) }}
                                style={{
                                  fontSize: 9,
                                  color: 'var(--accent-cyan)',
                                  background: 'rgba(0,212,255,0.08)',
                                  border: '1px solid rgba(0,212,255,0.25)',
                                  borderRadius: 3,
                                  padding: '2px 6px',
                                  cursor: 'pointer',
                                  letterSpacing: 0.5,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                ↗ MAP
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: '0 10px 10px 33px',
                              borderTop: `1px solid ${color}22`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            {a.properties.headline && (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 8 }}>
                                {a.properties.headline}
                              </div>
                            )}
                            {a.properties.description && (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: 'var(--text-muted)',
                                  lineHeight: 1.6,
                                  whiteSpace: 'pre-wrap',
                                  maxHeight: 200,
                                  overflowY: 'auto',
                                  background: 'var(--bg-base)',
                                  borderRadius: 4,
                                  padding: '6px 8px',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {a.properties.description}
                              </div>
                            )}
                            {a.properties.instruction && (
                              <div style={{ fontSize: 10, color: color, lineHeight: 1.5, fontWeight: 600 }}>
                                ⚡ {a.properties.instruction}
                              </div>
                            )}
                            {(() => {
                              const c = centroid(a.geometry)
                              return c ? (
                                <CameraPanel
                                  lat={c[0]}
                                  lon={c[1]}
                                  label={a.properties.areaDesc.split(';')[0].trim()}
                                  radiusMiles={50}
                                  youtubeQuery={buildAlertQuery(a)}
                                />
                              ) : null
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 48 }}>
              No alerts match your filter
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
