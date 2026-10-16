import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
/** NDBC moored buoys + NOAA CO-OPS tide gauges nearest the configured point. */
import { fetchBuoys, fetchTides } from '../api'

interface Props {
  homeLat: number
  homeLon: number
  onLocate?: (lat: number, lon: number) => void
}

export default function MarinePanel({ homeLat, homeLon, onLocate }: Props) {
  const buoy = useFeed(`buoys:${homeLat}:${homeLon}`, s => fetchBuoys(homeLat, homeLon, s), { interval: 600_000 })
  const tide = useFeed(`tides:${homeLat}:${homeLon}`, s => fetchTides(homeLat, homeLon, s), { interval: 600_000 })
  const buoys = buoy.data?.buoys ?? []
  const tides = tide.data?.tides ?? []


  return (
    <div className="card">
      <div className="card-title">🌊 Marine</div>
      <FeedStatus feed={buoy} name="Buoy observations" /><FeedStatus feed={tide} name="Tide observations" />
      {buoy.status === 'success' && !buoys.length && <p className="notice">No nearby buoy observations.</p>}
      {tide.status === 'success' && !tides.length && <p className="notice">No nearby tide observations.</p>}
      <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {buoys.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              NDBC Buoys ({buoys.length})
            </div>
            {buoys.slice(0, 6).map((b) => {
              const o = b.obs
              return (
                <button
                  key={b.station_id}
                  onClick={() => onLocate?.(b.lat, b.lon)}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderLeft: '3px solid #06b6d4', borderRadius: 4, padding: '4px 6px',
                    cursor: 'pointer', textAlign: 'left', color: 'var(--text-secondary)',
                    width: '100%', marginBottom: 3,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: '#06b6d4' }}>{b.station_id}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{b.distance_km} km</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 1 }}>{b.name}</div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                    {o.wave_height_m != null && <span>🌊 {o.wave_height_m.toFixed(1)}m</span>}
                    {o.wind_speed_ms != null && <span>💨 {Math.round(o.wind_speed_ms * 1.94)}kt</span>}
                    {o.water_temp_c != null && <span>🌡 {Math.round(o.water_temp_c * 9/5 + 32)}°F</span>}
                    {o.pressure_mbar != null && <span>{o.pressure_mbar.toFixed(0)}mb</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {tides.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              CO-OPS Tide Gauges ({tides.length})
            </div>
            {tides.slice(0, 6).map((t) => (
              <button
                key={t.station_id}
                onClick={() => onLocate?.(t.lat, t.lon)}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderLeft: '3px solid #3b82f6', borderRadius: 4, padding: '4px 6px',
                  cursor: 'pointer', textAlign: 'left', color: 'var(--text-secondary)',
                  width: '100%', marginBottom: 3,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                  <span style={{ color: '#3b82f6' }}>{t.station_id}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t.distance_km} km</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.name}</div>
                {t.water_level.value_ft != null && (
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                    {t.water_level.value_ft.toFixed(2)} ft
                    <span style={{ color: 'var(--text-muted)', fontSize: 9, marginLeft: 6 }}>
                      {t.water_level.time?.slice(11, 16)}Z
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
