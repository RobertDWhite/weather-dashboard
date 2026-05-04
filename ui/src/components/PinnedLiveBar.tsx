import { useEffect, useState } from 'react'
import { fetchPinnedLive } from '../api'
import type { YouTubeLive } from '../types'

interface PinnedStream extends YouTubeLive {
  channel_label: string
  pinned: boolean
}

export default function PinnedLiveBar() {
  const [streams, setStreams] = useState<PinnedStream[]>([])
  const [selected, setSelected] = useState<PinnedStream | null>(null)

  useEffect(() => {
    const check = () => {
      fetchPinnedLive()
        .then((data) => setStreams(data as PinnedStream[]))
        .catch(() => {})
    }
    check()
    // Re-check every 2 minutes (matches backend cache TTL)
    const t = setInterval(check, 120_000)
    return () => clearInterval(t)
  }, [])

  if (streams.length === 0) return null

  return (
    <>
      <div
        style={{
          background: 'rgba(255,0,0,0.08)',
          borderTop: '2px solid #ff0000',
          borderBottom: '1px solid rgba(255,0,0,0.25)',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: '#ff0000',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#ff0000',
              animation: 'pulse-red 1s ease-in-out infinite',
            }}
          />
          Live Now
        </div>

        {streams.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,0,0,0.06)',
              border: '1px solid rgba(255,0,0,0.3)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,0,0,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,0,0,0.06)')}
          >
            {s.thumbnail && (
              <img src={s.thumbnail} alt="" style={{ width: 40, height: 23, objectFit: 'cover', borderRadius: 3 }} />
            )}
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ff4444' }}>{s.channel_label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>▶ Watch</span>
          </button>
        ))}
      </div>

      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(6,11,20,0.92)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ background: 'var(--bg-panel)', border: '1px solid #ff000066', borderRadius: 10, overflow: 'hidden', maxWidth: '90vw', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#ff4444' }}>{selected.channel_label} · LIVE</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a href={selected.watch_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#ff0000', textDecoration: 'none', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: 4, padding: '3px 8px', fontWeight: 700 }}>
                  ▶ YouTube
                </a>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={selected.embed_url}
              width="854" height="480"
              style={{ display: 'block', border: 'none', maxWidth: '88vw' }}
              allow="autoplay; encrypted-media"
              allowFullScreen
              title={selected.title}
            />
          </div>
        </div>
      )}
    </>
  )
}
