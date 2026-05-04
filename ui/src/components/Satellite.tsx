import { useEffect, useState } from 'react'
import { fetchGoesUrls } from '../api'
import type { GoesUrls } from '../types'

type Channel = 'GeoColor' | 'Visible' | 'CleanIR' | 'WaterVapor' | 'NightMicrophysics' | 'Sandwich'

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'GeoColor',        label: 'GeoColor' },
  { key: 'Visible',         label: 'Visible' },
  { key: 'CleanIR',         label: 'IR' },
  { key: 'WaterVapor',      label: 'WV' },
  { key: 'NightMicrophysics', label: 'Night' },
]

const CHANNEL_NIGHTTIME_NOTE: Partial<Record<Channel, string>> = {
  Visible: 'No visible data at night',
}

export default function Satellite() {
  const [urls, setUrls] = useState<GoesUrls | null>(null)
  const [channel, setChannel] = useState<Channel>('GeoColor')
  const [imgKey, setImgKey] = useState(0)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    const load = () => fetchGoesUrls().then(setUrls).catch(() => {})
    load()
    const t = setInterval(() => { load(); setImgKey((k) => k + 1) }, 300_000)
    return () => clearInterval(t)
  }, [])

  const imgUrl = urls?.GOES16?.CONUS?.[channel]

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">
        🛰️ GOES-16 Satellite
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {CHANNELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setChannel(key); setImgKey((k) => k + 1); setImgError(false) }}
              style={{
                padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                background: channel === key ? 'var(--accent-blue)' : 'var(--bg-base)',
                color: channel === key ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${channel === key ? 'var(--accent-blue)' : 'var(--border)'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {imgUrl && !imgError ? (
          <img
            key={`${channel}-${imgKey}`}
            src={imgUrl}
            alt={`GOES-16 ${channel}`}
            style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)', display: 'block' }}
            onError={() => setImgError(true)}
          />
        ) : imgError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
            <span style={{ fontSize: 22 }}>🌑</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              {CHANNEL_NIGHTTIME_NOTE[channel] ?? 'Image unavailable'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <div className="spinner" />
          </div>
        )}
      </div>

      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {urls?.channels?.[channel] ?? ''}
        </span>
        <a
          href="https://www.star.nesdis.noaa.gov/GOES/conus.php?sat=G16"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--accent-cyan)', textDecoration: 'none' }}
        >
          → Full Loop ↗
        </a>
      </div>
    </div>
  )
}
