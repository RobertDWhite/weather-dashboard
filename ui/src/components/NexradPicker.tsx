import { useEffect, useMemo } from 'react'
import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
import type { NexradProduct } from '../types'
import { fetchNexradSites } from '../api'

interface Props {
  enabled: boolean
  setEnabled: (b: boolean) => void
  site: string
  setSite: (s: string) => void
  product: string
  setProduct: (p: string) => void
  homeLat: number
  homeLon: number
  /** Optional: callback fires when user picks a site so the parent can fly the map. */
  onSitePicked?: (lat: number, lon: number) => void
}

export default function NexradPicker({
  enabled, setEnabled, site, setSite, product, setProduct,
  homeLat, homeLon, onSitePicked,
}: Props) {
  const feed = useFeed(`nexrad-sites:${homeLat}:${homeLon}`, s => fetchNexradSites(homeLat, homeLon, s), { interval: 3600_000 })
  const sites = feed.data?.sites ?? []
  const products = feed.data?.products ?? []
  useEffect(() => {
    const picked = sites.find(s => s.id === site) ?? sites[0]
    if (!picked) return
    if (!site) setSite(picked.id)
    onSitePicked?.(picked.lat, picked.lon)
  // Report coordinates once per catalog load; user picks are handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.data])

  const groups = useMemo(() => {
    const g: Record<string, NexradProduct[]> = {}
    for (const p of products) (g[p.group] ??= []).push(p)
    return g
  }, [products])

  const selectedSite = sites.find((s) => s.id === site)

  return (
    <div
      style={{
        // Flow inline within the floating-controls column in App.tsx instead
        // of absolute-positioning ourselves (which previously stacked us on
        // top of the other layer toggles).
        background: 'rgba(6,11,20,0.92)',
        border: '1px solid var(--border-bright)',
        borderRadius: 6,
        padding: '6px 8px',
        backdropFilter: 'blur(4px)',
        minWidth: enabled ? 240 : 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      <FeedStatus feed={feed} name="NEXRAD sites" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => setEnabled(!enabled)}
          style={{
            background: enabled ? 'var(--accent-cyan)' : 'transparent',
            color: enabled ? '#000' : 'var(--accent-cyan)',
            border: '1px solid var(--accent-cyan)',
            padding: '3px 9px',
            borderRadius: 3,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          title={enabled ? 'Hide single-site NEXRAD' : 'Show single-site NEXRAD (Z/V/ZDR/CC)'}
        >
          📡 NEXRAD {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {enabled && (
        <>
          <select
            aria-label="Radar station"
            value={site}
            onChange={(e) => {
              setSite(e.target.value)
              const s = sites.find((x) => x.id === e.target.value)
              if (s && onSitePicked) onSitePicked(s.lat, s.lon)
            }}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '3px 6px',
              borderRadius: 3,
            }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.name} ({s.distance_km.toFixed(0)} km)
              </option>
            ))}
          </select>
          <select
            aria-label="Radar product"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '3px 6px',
              borderRadius: 3,
            }}
          >
            {Object.entries(groups).map(([g, ps]) => (
              <optgroup key={g} label={g}>
                {ps.map((p) => (
                  <option key={p.code} value={p.code}>{p.code} — {p.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedSite && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
              Range: ~250 km · NOAA GeoServer · refresh 2m
            </div>
          )}
        </>
      )}
    </div>
  )
}
