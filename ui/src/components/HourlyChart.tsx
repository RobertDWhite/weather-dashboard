import {
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { HourlyPeriod } from '../types'

interface Props { hourly: HourlyPeriod[] }

interface TooltipPayload {
  name: string
  value: number | string
  color: string
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '8px 12px', fontSize: 11,
    }}>
      <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}{p.name === 'Temp' ? '°F' : p.name === 'Precip %' ? '%' : ' mph'}</strong>
        </div>
      ))}
    </div>
  )
}

export default function HourlyChart({ hourly }: Props) {
  if (!hourly.length) return (
    <div className="card">
      <div className="card-title">📈 48-Hour Forecast</div>
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    </div>
  )

  const data = hourly.slice(0, 36).map((h) => ({
    time: format(parseISO(h.time), 'HH:mm'),
    Temp: Math.round(h.temperature),
    'Precip %': h.precipProbability,
    Wind: Math.round(h.windSpeed),
    icon: h.icon,
  }))

  return (
    <div className="card">
      <div className="card-title">📈 36-Hour Forecast</div>
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
            interval={2}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            yAxisId="temp"
            orientation="left"
            tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: 'var(--text-secondary)', paddingTop: 4 }}
          />
          <Bar yAxisId="pct" dataKey="Precip %" fill="rgba(0,136,204,0.5)" radius={[2, 2, 0, 0]} />
          <Area
            yAxisId="temp"
            type="monotone"
            dataKey="Temp"
            stroke="#ff6b35"
            fill="rgba(255,107,53,0.12)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="Wind"
            stroke="#00d4ff"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
