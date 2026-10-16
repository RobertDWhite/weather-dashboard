import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
import { useEffect, useState } from 'react'
import { fetchMesoanalysisCatalog } from '../api'

export default function Mesoanalysis() {
  const feed = useFeed('mesoanalysis', fetchMesoanalysisCatalog, { interval: 300_000 })
  const catalog = feed.data
  const [groupIdx, setGroupIdx] = useState(0)
  const [paramCode, setParamCode] = useState<string>('mlcp')
  const [sector, setSector] = useState<string>('s19')
  const [bust, setBust] = useState<number>(() => Date.now())
  const [imgOk, setImgOk] = useState(true)

  // Auto-refresh image every 5 min
  useEffect(() => {
    const t = setInterval(() => setBust(Date.now()), 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  if (!catalog) return <FeedStatus feed={feed} name="Mesoanalysis" />
  if (!catalog.groups.length) return <p className="notice">No mesoanalysis products available.</p>
  const group = catalog.groups[groupIdx] ?? catalog.groups[0]
  const param = group.params.find((p) => p.code === paramCode) ?? group.params[0]
  const baseUrl = param?.urls[sector]
  // Strip any pre-existing cache-bust param the backend baked in, then add our own
  const url = baseUrl ? `${baseUrl.split('?')[0]}?t=${bust}` : ''

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <FeedStatus feed={feed} name="Mesoanalysis" />
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>SPC Mesoanalysis</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 'auto' }}>
          {param?.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 8px 0' }}>
        {catalog.groups.map((g, i) => (
          <button
            key={g.name}
            onClick={() => {
              setGroupIdx(i)
              setParamCode(g.params[0]?.code ?? paramCode)
            }}
            style={{
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 3,
              border: '1px solid var(--border)',
              background: i === groupIdx ? 'var(--accent-cyan)' : 'transparent',
              color: i === groupIdx ? '#000' : 'var(--text-secondary)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {g.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 8px' }}>
        <select
          value={paramCode}
          onChange={(e) => { setParamCode(e.target.value); setImgOk(true) }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 11,
            padding: '3px 6px',
            borderRadius: 3,
            flex: 1,
            minWidth: 140,
          }}
        >
          {group.params.map((p) => (
            <option key={p.code} value={p.code}>{p.label}</option>
          ))}
        </select>

        <select
          value={sector}
          onChange={(e) => { setSector(e.target.value); setImgOk(true) }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 11,
            padding: '3px 6px',
            borderRadius: 3,
          }}
        >
          {Object.entries(catalog.sectors).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div style={{ background: '#000', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {url && imgOk ? (
          <a href={catalog.page} target="_blank" rel="noopener noreferrer" style={{ display: 'block', maxWidth: '100%' }}>
            <img
              src={url}
              alt={`${param?.label} — ${catalog.sectors[sector]?.label}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onError={() => setImgOk(false)}
            />
          </a>
        ) : (
          <div style={{ padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>
            Image unavailable. Try another parameter or sector.
          </div>
        )}
      </div>

      <div style={{ padding: '4px 8px', fontSize: 9, color: 'var(--text-muted)', textAlign: 'right' }}>
        Source: NOAA SPC · auto-refresh 5min
      </div>
    </div>
  )
}
