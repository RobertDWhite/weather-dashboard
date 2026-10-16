import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
import { useState } from 'react'
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
  const [expanded, setExpanded] = useState(false)
  const feed = useFeed(`text:${tab}:${homeLat}:${homeLon}`, s => tab === 'afd' ? fetchAfd(homeLat, homeLon, s) : tab === 'hwo' ? fetchHwo(homeLat, homeLon, s) : fetchSpcDiscussion(s), { interval: 300_000 })
  const cur = feed.data
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

        <FeedStatus feed={feed} name={TAB_TITLES[tab]} />
        {text && (
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
        {text && (
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
