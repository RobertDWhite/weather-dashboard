import { useState } from 'react'
import { fetchRiverGauges } from '../api'
import { useFeed } from '../hooks/useFeed'
import { riverStatus } from '../riverStatus'
import FeedPanel from './FeedPanel'
interface Props { state?: string; onLocate: (lat: number, lon: number, zoom?: number) => void }
export default function RiverGauges({ state, onLocate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const feed = useFeed(`rivers:${state}`, s => fetchRiverGauges(state, s), { enabled: !!state, interval: 300_000 })
  if (!state) return <p className="notice">River gauges need a configured observer state.</p>
  return <FeedPanel feed={feed} name={`River gauges · ${state}`}>{data => {
    const gauges = [...data.gauges].sort((a, b) => Number(riverStatus(b).elevated) - Number(riverStatus(a).elevated))
    const unknown = gauges.filter(g => !riverStatus(g).known).length
    const elevated = gauges.filter(g => riverStatus(g).elevated).length
    return <div className="card"><div className="card-title">River gauges — {state}</div>
      <p className="notice">{gauges.length === 0 ? 'No gauge observations available.' : `${elevated} at or above action/flood stage · ${unknown} unclassified or stale`}</p>
      <div className="river-grid">{(expanded ? gauges : gauges.slice(0, 8)).map(g => {
        const status = riverStatus(g)
        return <button className="river-gauge" key={g.siteCode} onClick={() => onLocate(g.lat, g.lon, 11)}>
          <strong>{g.siteName}</strong><span>{g.height.toFixed(1)} {g.unit}</span><span style={{ color: status.color }}>{status.label}</span>
          {g.thresholds?.minor != null && <span>Flood stage {g.thresholds.minor} {g.unit} · {g.thresholds.source}</span>}
          <time dateTime={g.time}>Observed {new Date(g.time).toLocaleString()}</time>
        </button>
      })}</div>
      {gauges.length > 8 && <button className="quiet-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer gauges' : `Show all ${gauges.length} gauges`}</button>}
    </div>
  }}</FeedPanel>
}
