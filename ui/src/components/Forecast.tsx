import { format, parseISO } from 'date-fns'
import type { DailyPeriod } from '../types'

interface Props { daily: DailyPeriod[] }

export default function Forecast({ daily }: Props) {
  if (!daily.length) {
    return (
      <div className="card">
        <div className="card-title">7-Day Forecast</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">📅 7-Day Forecast</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {daily.map((d) => {
          const date = parseISO(d.date)
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
          const precipPct = d.precipProbability ?? 0
          const precipColor = precipPct > 70 ? 'var(--accent-cyan)' : precipPct > 40 ? '#7fa8cc' : 'var(--text-muted)'

          return (
            <div
              key={d.date}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 22px 1fr 70px 36px',
                alignItems: 'center',
                gap: 8,
                padding: '5px 4px',
                borderRadius: 5,
                background: isToday ? 'rgba(0,212,255,0.07)' : 'transparent',
                fontSize: 12,
              }}
            >
              <div style={{ color: isToday ? 'var(--accent-cyan)' : 'var(--text-secondary)', fontWeight: isToday ? 700 : 400 }}>
                {isToday ? 'Today' : format(date, 'EEE')}
              </div>
              <div style={{ fontSize: 15, textAlign: 'center' }}>{d.icon}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.condition}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                <span style={{ color: 'var(--warn-orange)', fontWeight: 700 }}>{Math.round(d.tempMax)}°</span>
                <span style={{ color: 'var(--text-muted)' }}>{Math.round(d.tempMin)}°</span>
              </div>
              <div style={{ color: precipColor, fontSize: 11, textAlign: 'right' }}>
                {precipPct > 0 ? `${precipPct}%` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
