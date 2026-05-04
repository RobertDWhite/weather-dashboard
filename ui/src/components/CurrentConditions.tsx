import type { CurrentConditions } from '../types'

interface Props { data: CurrentConditions | null }

function WindDir(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

function TempGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value + 20) / 140) * 100))
  const color = value < 32 ? '#00ccff' : value < 50 ? '#00d4ff' : value < 70 ? '#30d158' : value < 90 ? '#ffd60a' : '#ff6b35'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ height: 60, width: 12, background: 'var(--border)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${pct}%`, background: color, borderRadius: 6, transition: 'height 1s' }} />
      </div>
    </div>
  )
}

export default function CurrentConditionsPanel({ data }: Props) {
  if (!data) {
    return (
      <div className="card">
        <div className="card-title">Current Conditions</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>
      </div>
    )
  }

  const windDir = WindDir(data.windDirection)
  const pressureMb = data.pressure
  const pressureInHg = (pressureMb * 0.02953).toFixed(2)
  const visMi = ((data.visibility ?? 0) / 1609.34).toFixed(1)

  return (
    <div className="card">
      <div className="card-title">⛅ Current Conditions</div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <TempGauge value={data.temperature} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: 'var(--text-primary)' }}>
              {Math.round(data.temperature)}°
            </span>
            <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>F</span>
            <span style={{ fontSize: 24 }}>{data.icon}</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>{data.condition}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Feels like {Math.round(data.feelsLike)}°F
            {data.dewPoint != null && ` · Dew ${Math.round(data.dewPoint)}°F`}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
        <Stat icon="💨" label="Wind" value={`${Math.round(data.windSpeed)} mph ${windDir}`} />
        <Stat icon="🌬️" label="Gusts" value={`${Math.round(data.windGusts)} mph`} />
        <Stat icon="💧" label="Humidity" value={`${data.humidity}%`} />
        <Stat icon="🌡️" label="Pressure" value={`${pressureInHg}" Hg`} />
        <Stat icon="☁️" label="Cloud Cover" value={`${data.cloudCover}%`} />
        <Stat icon="👁️" label="Visibility" value={`${visMi} mi`} />
        {data.precipitation > 0 && (
          <Stat icon="🌧️" label="Precip" value={`${data.precipitation.toFixed(2)}"`} />
        )}
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ color: 'var(--text-muted)', minWidth: 58 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
