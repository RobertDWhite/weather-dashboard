/** "What's happened today" — aggregates active alerts, watches, LSRs, storm
 * reports, peak gust from APRS, peak temp/wind from METAR mesh. Useful at-a-
 * glance for stream chyrons or kiosk mode. */
import type { LocalStormReport, MetarStation, NWSAlert, SpcWatch, StormReports, AprsStation } from '../types'

interface Props {
  alerts: NWSAlert[]
  watches: SpcWatch[]
  reports: StormReports | null
  lsrs: LocalStormReport[]
  metars: MetarStation[]
  aprsStations: AprsStation[]
}

function Stat({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      padding: '6px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

export default function DailyStatsPanel({ alerts, watches, reports, lsrs, metars, aprsStations }: Props) {
  const torWarn = alerts.filter((a) => a.properties?.event === 'Tornado Warning').length
  const svrWarn = alerts.filter((a) => a.properties?.event === 'Severe Thunderstorm Warning').length
  const torCount = (reports?.tornado?.length ?? 0)
  const hailCount = (reports?.hail?.length ?? 0)
  const windCount = (reports?.wind?.length ?? 0)
  const lsrTor = lsrs.filter((r) => r.category === 'tornado').length

  // Peak gust across both METAR (kt → mph) and APRS WX (already mph)
  const gusts: number[] = []
  for (const m of metars) {
    if (m.wind_gust_kt != null) gusts.push(m.wind_gust_kt * 1.15078)
    else if (m.wind_speed_kt != null) gusts.push(m.wind_speed_kt * 1.15078)
  }
  for (const s of aprsStations) {
    if (s.weather?.wind_gust_mph != null) gusts.push(s.weather.wind_gust_mph)
    else if (s.weather?.wind_speed_mph != null) gusts.push(s.weather.wind_speed_mph)
  }
  const peakGust = gusts.length ? Math.max(...gusts) : null

  // Peak / coldest temp from any source
  const temps: number[] = []
  for (const m of metars) if (m.temp_f != null) temps.push(m.temp_f)
  for (const s of aprsStations) if (s.weather?.temp_f != null) temps.push(s.weather.temp_f)
  const tempMax = temps.length ? Math.max(...temps) : null
  const tempMin = temps.length ? Math.min(...temps) : null

  return (
    <div className="card">
      <div className="card-title">📊 Snapshot</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))',
        gap: 6,
        padding: 6,
      }}>
        <Stat label="Tornado Warn" value={torWarn} color={torWarn > 0 ? '#ef4444' : undefined} />
        <Stat label="Svr T-storm" value={svrWarn} color={svrWarn > 0 ? '#f97316' : undefined} />
        <Stat label="Watches" value={watches.length} color={watches.length > 0 ? '#facc15' : undefined} />
        <Stat label="LSR Tornado" value={lsrTor} color={lsrTor > 0 ? '#ef4444' : undefined} />
        <Stat label="SPC Tor" value={torCount} sub={`${hailCount} hail · ${windCount} wind`} />
        {peakGust != null && (
          <Stat label="Peak Gust" value={`${Math.round(peakGust)} mph`} color={peakGust >= 58 ? '#f97316' : undefined} />
        )}
        {tempMax != null && (
          <Stat label="High" value={`${Math.round(tempMax)}°`} color="#facc15" />
        )}
        {tempMin != null && (
          <Stat label="Low" value={`${Math.round(tempMin)}°`} color="#60a5fa" />
        )}
      </div>
    </div>
  )
}
