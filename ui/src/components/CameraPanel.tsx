import { useEffect, useRef, useState } from 'react'
import { fetchCameras, fetchOhgoCameras, fetchYouTubeLive } from '../api'
import type { Camera, OhgoCamera, YouTubeLive } from '../types'
import { useWindowWidth } from '../hooks/useWindowWidth'

interface Props {
  lat: number
  lon: number
  label?: string
  radiusMiles?: number
  /** Pre-built keyword query for YouTube — overrides location search when set */
  youtubeQuery?: string
}

// --- Windy embed modal (iframe video player) ---

function WindyModal({ title, city, embedUrl, playerUrl, onClose }: {
  title: string
  city?: string
  embedUrl: string
  playerUrl?: string | null
  onClose: () => void
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(6,11,20,0.92)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-bright)', borderRadius: 10, overflow: 'hidden', maxWidth: '90vw', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{title}</div>
            {city && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{city}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {playerUrl && (
              <a href={playerUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--accent-cyan)', textDecoration: 'none', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 4, padding: '3px 8px' }}>
                ↗ Windy
              </a>
            )}
            <button onClick={onClose}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
              ✕
            </button>
          </div>
        </div>
        <iframe
          src={embedUrl}
          width="854" height="480"
          style={{ display: 'block', border: 'none', maxWidth: '88vw' }}
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={title}
        />
      </div>
    </div>
  )
}

// --- Image modal (OHGO static cameras) ---

function ImageModal({ title, city, imageUrl, onClose }: {
  title: string
  city?: string
  imageUrl: string
  onClose: () => void
}) {
  const [ts, setTs] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setTs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(6,11,20,0.92)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-bright)', borderRadius: 10, overflow: 'hidden', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{title}</div>
            {city && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{city}</div>}
          </div>
          <button onClick={onClose}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
            ✕
          </button>
        </div>
        <div style={{ position: 'relative', background: '#000', minHeight: 200 }}>
          <img
            src={`${imageUrl}?t=${ts}`} alt={title}
            style={{ display: 'block', maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).src = '' }}
          />
          <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
            Refreshes every 30s
          </div>
        </div>
      </div>
    </div>
  )
}

// --- YouTube embed modal ---

function YouTubeModal({ video, onClose }: { video: YouTubeLive; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(6,11,20,0.92)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-bright)', borderRadius: 10, overflow: 'hidden', maxWidth: '90vw', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{video.channel}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <a href={video.watch_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: '#ff0000', textDecoration: 'none', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.25)', borderRadius: 4, padding: '3px 8px', fontWeight: 700 }}>
              ▶ YouTube
            </a>
            <button onClick={onClose}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
              ✕
            </button>
          </div>
        </div>
        <iframe
          src={video.embed_url}
          width="854" height="480"
          style={{ display: 'block', border: 'none', maxWidth: '88vw' }}
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={video.title}
        />
      </div>
    </div>
  )
}

// --- Shared still-image thumbnail ---

function Thumb({ src, title, subtitle, badge, onClick }: {
  src: string | null
  title: string
  subtitle?: string
  badge?: string
  onClick: () => void
}) {
  const [ts, setTs] = useState(Date.now())
  const [err, setErr] = useState(false)
  useEffect(() => {
    const t = setInterval(() => { setTs(Date.now()); setErr(false) }, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <button onClick={onClick} title={title}
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', position: 'relative', overflow: 'hidden' }}>
        {src && !err ? (
          <img src={`${src}?t=${ts}`} alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setErr(true)} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 22 }}>📷</div>
        )}
        {badge && (
          <div style={{ position: 'absolute', top: 4, left: 5, fontSize: 9, background: 'rgba(0,0,0,0.75)', color: 'var(--accent-cyan)', borderRadius: 3, padding: '1px 5px', fontWeight: 700, letterSpacing: 0.5 }}>
            {badge}
          </div>
        )}
        <div style={{ position: 'absolute', top: 4, right: 5, fontSize: 9, background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.55)', borderRadius: 3, padding: '1px 4px', fontFamily: 'var(--font-mono)' }}>
          LIVE
        </div>
      </div>
      <div style={{ padding: '5px 7px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>}
      </div>
    </button>
  )
}

// --- YouTube thumbnail card ---

function YouTubeThumb({ video, onClick }: { video: YouTubeLive; onClick: () => void }) {
  return (
    <button onClick={onClick} title={video.title}
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#ff0000')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', position: 'relative', overflow: 'hidden' }}>
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff0000', fontSize: 22 }}>▶</div>
        )}
        <div style={{ position: 'absolute', top: 4, left: 5, fontSize: 9, background: '#ff0000', color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700, letterSpacing: 0.5 }}>
          YT LIVE
        </div>
      </div>
      <div style={{ padding: '5px 7px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{video.title}</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{video.channel}</div>
      </div>
    </button>
  )
}

// --- Main panel ---

type Tab = 'ohgo' | 'windy' | 'youtube'

const TABS: { key: Tab; label: string }[] = [
  { key: 'windy',   label: 'Weather Cams' },
  { key: 'ohgo',    label: 'DOT Traffic' },
  { key: 'youtube', label: 'YouTube Live' },
]

export default function CameraPanel({ lat, lon, label, radiusMiles = 80, youtubeQuery }: Props) {
  const isMobile = useWindowWidth() < 768
  const [tab, setTab] = useState<Tab>('windy')
  const [radius, setRadius] = useState(radiusMiles)
  const [windy, setWindy] = useState<Camera[]>([])
  const [ohgo, setOhgo] = useState<OhgoCamera[]>([])
  const [ytVideos, setYtVideos] = useState<YouTubeLive[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageModal, setImageModal] = useState<{ title: string; city?: string; imageUrl: string } | null>(null)
  const [windyModal, setWindyModal] = useState<{ title: string; city?: string; embedUrl: string; playerUrl?: string | null } | null>(null)
  const [ytModal, setYtModal] = useState<YouTubeLive | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // YouTube radius string from miles
  const ytRadius = `${Math.round(radius * 1.609)}km`

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)

    const ytOpts = youtubeQuery
      ? { q: youtubeQuery, lat, lon, radius: ytRadius }
      : { lat, lon, radius: ytRadius }

    Promise.allSettled([
      fetchCameras(lat, lon, Math.min(radius, 150), ac.signal),
      fetchOhgoCameras(lat, lon, radius, ac.signal),
      fetchYouTubeLive(ytOpts, ac.signal),
    ]).then(([wr, or, yr]) => {
      if (wr.status === 'fulfilled') setWindy(wr.value)
      if (or.status === 'fulfilled') setOhgo(or.value)
      if (yr.status === 'fulfilled') setYtVideos(yr.value)
      setLoading(false)
    })

    return () => ac.abort()
  }, [lat, lon, radius, ytRadius, youtubeQuery])

  const counts: Record<Tab, number> = { ohgo: ohgo.length, windy: windy.length, youtube: ytVideos.length }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="card-title" style={{ marginBottom: 6 }}>
        📷 Live Cameras &amp; Streams
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontWeight: 400, fontSize: 10 }}>
          {label ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}`}
        </span>
      </div>

      {/* Tab bar + radius */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6, flexWrap: 'wrap' }}>
        {TABS.map(({ key, label: lbl }) => {
          const isYt = key === 'youtube'
          const active = tab === key
          const activeColor = isYt ? '#ff0000' : 'var(--accent-cyan)'
          return (
            <button key={key} onClick={() => setTab(key)}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                border: `1px solid ${active ? activeColor : 'var(--border)'}`,
                background: active ? (isYt ? 'rgba(255,0,0,0.08)' : 'rgba(0,212,255,0.08)') : 'transparent',
                color: active ? activeColor : 'var(--text-muted)', cursor: 'pointer',
              }}>
              {lbl}{!loading ? ` · ${counts[key]}` : ''}
            </button>
          )
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Radius</span>
          {[25, 50, 80, 150].map((r) => (
            <button key={r} onClick={() => setRadius(r)}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                border: `1px solid ${radius === r ? 'var(--accent-cyan)' : 'var(--border)'}`,
                background: radius === r ? 'rgba(0,212,255,0.08)' : 'transparent',
                color: radius === r ? 'var(--accent-cyan)' : 'var(--text-muted)', cursor: 'pointer',
              }}>
              {r}mi
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && error && (
        <div style={{ fontSize: 11, color: 'var(--warn-red)', padding: '8px 0' }}>
          {error.includes('503') ? 'API key not configured' : `Error: ${error}`}
        </div>
      )}

      {tab === 'youtube' && youtubeQuery && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)', background: 'var(--bg-base)', borderRadius: 4, padding: '3px 8px' }}>
          🔍 {youtubeQuery}
        </div>
      )}

      {!loading && counts[tab] === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
          {tab === 'youtube' ? 'No live streams found' : `No cameras within ${radius} miles`}
        </div>
      )}

      {/* Grid */}
      {!loading && counts[tab] > 0 && (
        <div className="camera-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {tab === 'ohgo' && ohgo.map((cam) => (
            <Thumb
              key={cam.id}
              src={cam.thumbnail_url ?? cam.image_url}
              title={cam.title}
              subtitle={`${cam.distance_miles}mi · ${cam.direction}`}
              badge="DOT"
              onClick={() => cam.image_url && setImageModal({
                title: cam.title,
                city: `${cam.distance_miles}mi away · ${cam.direction}`,
                imageUrl: cam.image_url,
              })}
            />
          ))}

          {tab === 'windy' && windy.map((cam) => (
            <Thumb
              key={cam.id}
              src={cam.thumbnail ?? cam.preview}
              title={cam.title}
              subtitle={cam.city}
              badge="WX"
              onClick={() => {
                if (isMobile && cam.player_url) {
                  window.open(cam.player_url, '_blank', 'noopener,noreferrer')
                } else if (cam.embed_url) {
                  setWindyModal({ title: cam.title, city: cam.city, embedUrl: cam.embed_url, playerUrl: cam.player_url })
                } else if (cam.preview ?? cam.thumbnail) {
                  setImageModal({ title: cam.title, city: cam.city, imageUrl: (cam.preview ?? cam.thumbnail)! })
                }
              }}
            />
          ))}

          {tab === 'youtube' && ytVideos.map((v) => (
            <YouTubeThumb key={v.id} video={v} onClick={() => setYtModal(v)} />
          ))}
        </div>
      )}

      {windyModal && <WindyModal {...windyModal} onClose={() => setWindyModal(null)} />}
      {imageModal && <ImageModal {...imageModal} onClose={() => setImageModal(null)} />}
      {ytModal && <YouTubeModal video={ytModal} onClose={() => setYtModal(null)} />}
    </div>
  )
}
