import { useEffect, useState } from 'react'
import type { NwsTextProduct } from '../types'
import { fetchAfd, fetchHwo, fetchSpcDiscussion } from '../api'

type Tab = 'afd' | 'hwo' | 'spc'

interface Props {
  homeLat: number
  homeLon: number
}

function formatIssued(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const TAB_LABELS: Record<Tab, string> = {
  afd: 'AFD',
  hwo: 'HWO',
  spc: 'SPC',
}

const TAB_TITLES: Record<Tab, string> = {
  afd: 'Area Forecast Discussion (local WFO)',
  hwo: 'Hazardous Weather Outlook (local WFO)',
  spc: 'SPC Day 1 Convective Outlook discussion',
}

export default function NwsTextPanel({ homeLat, homeLon }: Props) {
  const [tab, setTab] = useState<Tab>('afd')
  const [data, setData] = useState<Record<Tab, NwsTextProduct | null>>({ afd: null, hwo: null, spc: null })
  const [loading, setLoading] = useState<Record<Tab, boolean>>({ afd: false, hwo: false, spc: false })
  const [error, setError] = useState<Record<Tab, string | null>>({ afd: null, hwo: null, spc: null })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (data[tab]) return
    setLoading((s) => ({ ...s, [tab]: true }))
    setError((s) => ({ ...s, [tab]: null }))
    const fn =
      tab === 'afd' ? () => fetchAfd(homeLat, homeLon) :
      tab === 'hwo' ? () => fetchHwo(homeLat, homeLon) :
      () => fetchSpcDiscussion()
    fn()
      .then((d) => {
        if (cancelled) return
        setData((s) => ({ ...s, [tab]: d }))
      })
      .catch((e) => {
        if (cancelled) return
        setError((s) => ({ ...s, [tab]: String(e) }))
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, [tab]: false }))
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, homeLat, homeLon])

  const cur = data[tab]
  const text = cur?.stripped_text || cur?.text || ''

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">
        📝 Text Products
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['afd', 'hwo', 'spc'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              title={TAB_TITLES[t]}
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

      <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{cur?.wfo ? `WFO ${cur.wfo}` : ''}{cur?.product ? ` · ${cur.product}` : ''}</span>
          <span>{cur?.issued ? formatIssued(cur.issued) : ''}</span>
        </div>

        {loading[tab] && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>Loading…</div>}
        {error[tab] && (
          <div style={{ fontSize: 11, color: '#fca5a5', padding: 8 }}>
            Unavailable
          </div>
        )}
        {!loading[tab] && !error[tab] && text && (
          <pre
            style={{
              maxHeight: expanded ? 600 : 220,
              overflowY: 'auto',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              padding: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            {text}
          </pre>
        )}
        {!loading[tab] && !error[tab] && text && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              alignSelf: 'flex-end',
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-cyan)',
              fontSize: 10,
              cursor: 'pointer',
              padding: '2px 4px',
            }}
          >
            {expanded ? 'collapse' : 'expand'}
          </button>
        )}
      </div>
    </div>
  )
}
