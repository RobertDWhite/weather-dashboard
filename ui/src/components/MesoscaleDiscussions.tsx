import type { MesoscaleDiscussion } from '../types'

interface Props {
  items: MesoscaleDiscussion[]
  onLocate?: (lat: number, lon: number) => void
}

function centroidFromCollection(geo: MesoscaleDiscussion['geometry']): [number, number] | null {
  if (!geo) return null
  const feat = geo.features?.[0]
  if (!feat?.geometry) return null
  let coords: number[][] = []
  if (feat.geometry.type === 'Polygon') {
    coords = (feat.geometry.coordinates as number[][][])[0] as number[][]
  } else if (feat.geometry.type === 'MultiPolygon') {
    coords = (feat.geometry.coordinates as number[][][][])[0][0]
  }
  if (!coords.length) return null
  return [
    coords.reduce((s, c) => s + c[1], 0) / coords.length,
    coords.reduce((s, c) => s + c[0], 0) / coords.length,
  ]
}

export default function MesoscaleDiscussions({ items, onLocate }: Props) {
  if (!items?.length) return null
  return (
    <div className="card">
      <div className="card-title">SPC Mesoscale Discussions ({items.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
        {items.slice(0, 8).map((it) => {
          const c = centroidFromCollection(it.geometry)
          return (
            <button
              key={it.md_num ?? it.link}
              onClick={() => {
                if (c && onLocate) onLocate(c[0], c[1])
                else if (it.link) window.open(it.link, '_blank', 'noopener,noreferrer')
              }}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderLeft: '3px solid #22d3ee',
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee' }}>
                MD {it.md_num ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: 2 }}>
                {(it.title ?? '').replace(/^Mesoscale Discussion\s+\d+\s*-\s*/i, '').slice(0, 140)}
              </div>
              {it.link && (
                <a
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 9, color: 'var(--accent-cyan)', marginTop: 3, display: 'inline-block' }}
                >
                  Read full text →
                </a>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
