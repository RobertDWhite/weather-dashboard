/** Lightning potential — Open-Meteo's hourly LPI + thunderstorm probability
 * for the home point. Not real-time strikes (no free strike feed); shows
 * forecast risk for the next 12h as a sparkline + peak chip. */
import { useEffect, useMemo, useState } from 'react'
import type { LightningResponse } from '../types'
import { fetchLightning } from '../api'

interface Props {
  homeLat: number
  homeLon: number
}

function colorForLpi(lpi: number): string {
  if (lpi >= 8) return '#ef4444'
  if (lpi >= 4) return '#f97316'
  if (lpi >= 1.5) return '#facc15'
  if (lpi > 0.1) return '#86efac'
  return '#475569'
}

export default function LightningPanel({ homeLat, homeLon }: Props) {
  const [data, setData] = useState<LightningResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const d = await fetchLightning(homeLat, homeLon)
        if (!cancelled) setData(d)
      } catch { /* */ }
    }
    tick()
    const t = setInterval(tick, 15 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [homeLat, homeLon])

  const sparkline = useMemo(() => {
    if (!data?.items?.length) return null
    const vals = data.items.map((it) => Math.max(0, it.lightning_potential ?? 0))
    const peak = Math.max(...vals, 0.1)
    return { vals, peak }
  }, [data])

  if (!data || !sparkline) return null
  // Skip render if LPI never goes meaningful (avoid clutter when totally dry)
  if ((data.peak_lpi ?? 0) < 0.5 && (data.peak_thunderstorm_probability ?? 0) < 20) return null

  const peakLpi = data.peak_lpi ?? 0
  const peakTprob = data.peak_thunderstorm_probability ?? 0
  const peakColor = colorForLpi(peakLpi)

  return (
    <div className="card">
      <div className="card-title">⚡ Lightning Potential (12h)</div>
      <div style={{ padding: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 22, fontWeight: 800, color: peakColor, fontFamily: 'var(--font-mono)',
          }}>
            {peakLpi.toFixed(1)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>peak LPI (J/kg)</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: peakTprob > 50 ? '#facc15' : 'var(--text-secondary)' }}>
            {peakTprob}% T-storm
          </span>
        </div>

        {/* Sparkline */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 1, height: 36,
          background: 'var(--bg-card)', padding: 4, borderRadius: 3,
        }}>
          {sparkline.vals.map((v, i) => {
            const h = (v / sparkline.peak) * 28
            return (
              <div key={i} style={{
                flex: 1,
                background: colorForLpi(v),
                opacity: v > 0.1 ? 0.9 : 0.25,
                height: Math.max(2, h),
                minWidth: 2,
              }} title={`${data.items[i].time}: LPI ${v.toFixed(1)}, T-storm ${data.items[i].thunderstorm_probability ?? 0}%`} />
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
          <span>now</span>
          <span>+12h</span>
        </div>
      </div>
    </div>
  )
}
