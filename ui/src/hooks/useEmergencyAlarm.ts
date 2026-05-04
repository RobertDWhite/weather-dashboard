import { useEffect, useRef, useState } from 'react'
import type { NWSAlert } from '../types'

const STORAGE_KEY = 'wx-alarm-enabled'
const SEEN_KEY = 'wx-alarm-seen-ids'
const SEEN_MAX = 200

/** Events that trigger the audible alarm. Tornado Emergency / PDS get a louder
 * pattern; others get a single attention burst. */
const URGENT_EVENTS = new Set([
  'Tornado Warning',
  'Tornado Emergency',
  'Flash Flood Emergency',
  'Severe Thunderstorm Warning',
  'Snow Squall Warning',
  'Dust Storm Warning',
  'Extreme Wind Warning',
])

const TORNADO_EMERGENCY_RX = /tornado emergency|particularly dangerous situation/i

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.slice(-SEEN_MAX) : [])
  } catch {
    return new Set()
  }
}

function saveSeen(set: Set<string>) {
  try {
    const arr = Array.from(set).slice(-SEEN_MAX)
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr))
  } catch {
    /* quota / private mode — ignore */
  }
}

let _ctx: AudioContext | null = null
function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_ctx) return _ctx
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    _ctx = new Ctor()
  } catch {
    _ctx = null
  }
  return _ctx
}

/** Play a sequence of (frequencyHz, durationSec, volume) tones with small gaps. */
function playSequence(steps: Array<[number, number, number]>) {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  let t = ctx.currentTime + 0.02
  for (const [freq, dur, vol] of steps) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.01)
    t += dur + 0.04
  }
}

/** Three-tone EAS-ish attention pattern + sweep; used for tornado emergency. */
function playEasAttention() {
  // Approximation of EAS attention header tones (853/960 Hz alternating)
  playSequence([
    [853, 0.4, 0.18],
    [960, 0.4, 0.18],
    [853, 0.4, 0.18],
    [960, 0.4, 0.18],
  ])
  // Then a chirp sweep (severity emphasis)
  setTimeout(() => {
    const ctx = getContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    const t0 = ctx.currentTime
    osc.frequency.setValueAtTime(400, t0)
    osc.frequency.exponentialRampToValueAtTime(1500, t0 + 0.5)
    osc.frequency.exponentialRampToValueAtTime(400, t0 + 1.0)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 1.05)
  }, 1800)
}

function playSingleBurst() {
  playSequence([
    [880, 0.18, 0.18],
    [660, 0.18, 0.18],
    [880, 0.18, 0.18],
  ])
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.95
    u.pitch = 1
    u.volume = 0.9
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch {
    /* synthesis unavailable */
  }
}

export interface UseEmergencyAlarm {
  enabled: boolean
  setEnabled: (b: boolean) => void
  testTone: () => void
  silence: () => void
  silenced: boolean
  repeating: boolean
  lastTriggered: { id: string; event: string; at: number } | null
}

const REPEAT_INTERVAL_MS = 30_000
const SILENCE_KEY = 'wx-alarm-silence-until'

function postWebhook(a: NWSAlert) {
  // Best-effort: tell the backend to forward to Discord/Slack. Backend
  // dedupes by id, so multiple tabs firing simultaneously is safe.
  const p = a.properties || ({} as NWSAlert['properties'])
  const id = p.id || a.id
  if (!id) return
  fetch('/api/webhook/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      event: p.event,
      severity: p.severity,
      headline: p.headline,
      area: p.areaDesc,
      expires: p.expires || p.ends,
      description: p.description,
      instruction: p.instruction,
    }),
  }).catch(() => { /* tolerate */ })
}

/** Watches the active alert list. When a NEW urgent alert appears (compared to
 * the persisted seen-set), plays an audio alarm + speaks a short summary.
 * While any active urgent alert remains, the alarm re-pulses every 30s until
 * silenced or the alert clears. Alarm is opt-in (browsers require a user
 * gesture before audio plays anyway). */
export function useEmergencyAlarm(alerts: NWSAlert[]): UseEmergencyAlarm {
  const seenRef = useRef<Set<string>>(loadSeen())
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [silenceUntil, setSilenceUntil] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(SILENCE_KEY) || 0)
      return isFinite(v) ? v : 0
    } catch { return 0 }
  })
  const [lastTriggered, setLastTriggered] = useState<{ id: string; event: string; at: number } | null>(null)

  const setEnabled = (b: boolean) => {
    setEnabledState(b)
    try { localStorage.setItem(STORAGE_KEY, b ? '1' : '0') } catch { /* */ }
    if (b) {
      // Resume context immediately — this counts as user gesture
      const ctx = getContext()
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
      playSequence([[660, 0.12, 0.12]]) // confirmation chirp
    }
  }

  const testTone = () => {
    const ctx = getContext()
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
    playSingleBurst()
  }

  /** Silence the repeat-alarm for 30 minutes (or until alerts clear). */
  const silence = () => {
    const until = Date.now() + 30 * 60_000
    setSilenceUntil(until)
    try { localStorage.setItem(SILENCE_KEY, String(until)) } catch { /* */ }
  }
  const silenced = silenceUntil > Date.now()

  useEffect(() => {
    if (!alerts.length) return
    const seen = seenRef.current
    const newUrgent: NWSAlert[] = []
    for (const a of alerts) {
      const id = a.properties?.id || a.id
      if (!id) continue
      if (seen.has(id)) continue
      seen.add(id)
      const event = a.properties?.event || ''
      const headline = a.properties?.headline || ''
      const isUrgent =
        URGENT_EVENTS.has(event) ||
        TORNADO_EMERGENCY_RX.test(event) ||
        TORNADO_EMERGENCY_RX.test(headline)
      if (isUrgent) newUrgent.push(a)
    }
    saveSeen(seen)

    if (!enabled || newUrgent.length === 0) return

    // Pick the most severe of the new ones
    const isEmergency = (a: NWSAlert) =>
      TORNADO_EMERGENCY_RX.test(a.properties?.event || '') ||
      TORNADO_EMERGENCY_RX.test(a.properties?.headline || '')

    const pick = newUrgent.find(isEmergency) || newUrgent[0]
    const event = pick.properties?.event || 'Severe weather alert'
    const area = pick.properties?.areaDesc || ''
    const id = pick.properties?.id || pick.id

    if (isEmergency(pick)) {
      playEasAttention()
      setTimeout(() => speak(`${event} for ${area}. Take shelter now.`), 3500)
    } else if (event.toLowerCase().includes('tornado')) {
      playEasAttention()
      setTimeout(() => speak(`${event} issued for ${area}.`), 3500)
    } else {
      playSingleBurst()
      setTimeout(() => speak(`${event} for ${area}.`), 1200)
    }
    setLastTriggered({ id, event, at: Date.now() })

    // Browser notification if permission granted
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(event, { body: area, tag: id })
      } catch { /* */ }
    }

    // Outbound webhook (Discord/Slack) — backend dedupes
    postWebhook(pick)
  }, [alerts, enabled])

  // Repeat-alarm: while any urgent alert is active, re-pulse every 30s. Stops
  // automatically when alerts clear, when user silences, or alarm is disabled.
  const hasActiveUrgent = alerts.some((a) => {
    const ev = a.properties?.event || ''
    const hl = a.properties?.headline || ''
    return (
      URGENT_EVENTS.has(ev) ||
      TORNADO_EMERGENCY_RX.test(ev) ||
      TORNADO_EMERGENCY_RX.test(hl)
    )
  })
  const repeating = enabled && hasActiveUrgent && !silenced

  useEffect(() => {
    if (!repeating) return
    const t = setInterval(() => {
      // Pick the most-severe active urgent alert and re-pulse with a short tone
      const urgent = alerts.find((a) => {
        const ev = a.properties?.event || ''
        const hl = a.properties?.headline || ''
        return (
          TORNADO_EMERGENCY_RX.test(ev) || TORNADO_EMERGENCY_RX.test(hl)
        )
      }) || alerts.find((a) => (a.properties?.event || '').toLowerCase().includes('tornado'))
      if (urgent && (TORNADO_EMERGENCY_RX.test(urgent.properties?.event || '') ||
                     TORNADO_EMERGENCY_RX.test(urgent.properties?.headline || ''))) {
        playEasAttention()
      } else {
        playSingleBurst()
      }
    }, REPEAT_INTERVAL_MS)
    return () => clearInterval(t)
  }, [repeating, alerts])

  // Auto-clear silence when alerts go away so it doesn't carry over to the
  // next event days from now.
  useEffect(() => {
    if (!hasActiveUrgent && silenceUntil > 0) {
      setSilenceUntil(0)
      try { localStorage.removeItem(SILENCE_KEY) } catch { /* */ }
    }
  }, [hasActiveUrgent, silenceUntil])

  // Request browser notification permission once when enabled
  useEffect(() => {
    if (!enabled) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [enabled])

  return { enabled, setEnabled, testTone, silence, silenced, repeating, lastTriggered }
}
