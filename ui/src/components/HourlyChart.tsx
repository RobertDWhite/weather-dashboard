import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { localDate, upcomingHours, weatherTime, isReading } from '../weatherTime'
import { ReferenceLine } from 'recharts'
import type { HourlyPeriod } from '../types'

interface Props {
  hourly: HourlyPeriod[]
  timezone: string
  now: number
}

interface TooltipPayload {
  name: string
  value: number | string
  color: string
}

function CustomTooltip({
  active,
  payload,
  label,
  timezone,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
  timezone: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: 4 }}>
        {label ? weatherTime(label, timezone, true) : ''}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}:{' '}
          <strong>
            {p.value}
            {p.name === 'Temp' ? '°F' : p.name === 'Precip %' ? '%' : ' mph'}
          </strong>
        </div>
      ))}
    </div>
  )
}

export default function HourlyChart({ hourly, timezone, now }: Props) {
  const future = upcomingHours(hourly, now)
  if (!future.length)
    return (
      <div className="card">
        <div className="card-title">📈 36-Hour Forecast</div>
        <p className="notice">No upcoming hourly forecast available.</p>
      </div>
    )

  const data = future.map((h) => ({
    time: h.time,
    Temp: isReading(h.temperature) ? Math.round(h.temperature) : null,
    'Precip %': h.precipProbability,
    Wind: isReading(h.windSpeed) ? Math.round(h.windSpeed) : null,
    icon: h.icon,
  }))

  return (
    <div className="card">
      <div className="card-title">📈 36-Hour Forecast</div>
      <div className="chart-axis-labels">
        <span>°F</span>
        <span>Precip % · Wind mph</span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={24}
            tickFormatter={(value) =>
              weatherTime(value, timezone, localDate(value, timezone) !== localDate(now, timezone))
            }
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            yAxisId="temp"
            orientation="left"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            width={42}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="wind"
            orientation="right"
            width={42}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            domain={[
              0,
              (max: number) => (Number.isFinite(max) ? Math.max(20, Math.ceil(max / 10) * 10) : 20),
            ]}
          />
          {data
            .filter((h, i) => i > 0 && localDate(h.time, timezone) !== localDate(data[i - 1].time, timezone))
            .map((h) => (
              <ReferenceLine
                key={h.time}
                x={h.time}
                yAxisId="temp"
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
                label={{
                  value: new Date(h.time).toLocaleDateString([], { timeZone: timezone, weekday: 'short' }),
                  fill: 'var(--text-secondary)',
                  position: 'insideTopLeft',
                }}
              />
            ))}
          <Tooltip content={<CustomTooltip timezone={timezone} />} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 4 }} />
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
            yAxisId="wind"
            type="monotone"
            dataKey="Wind"
            stroke="#00d4ff"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="chart-note">
        Temperature °F · Precipitation % (right axis) · Wind mph (outer right axis) ·{' '}
        {timezone.replace(/_/g, ' ')}
      </p>
    </div>
  )
}
