/** VAPID web push subscription manager. Registers /sw.js, requests browser
 * permission, subscribes to the backend's VAPID key, and persists the
 * subscription so the user gets OS-level alerts even with the tab closed.
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchWebPushKey, postPushSubscribe, postPushTest, postPushUnsubscribe } from '../api'

function urlB64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const safe = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(safe)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export interface UseWebPush {
  supported: boolean
  serverReady: boolean
  enabled: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
  test: () => Promise<void>
  status: 'idle' | 'requesting' | 'subscribed' | 'denied' | 'error'
  error?: string
}

export function useWebPush(): UseWebPush {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const [serverReady, setServerReady] = useState(false)
  const [vapidKey, setVapidKey] = useState<string>('')
  const [status, setStatus] = useState<UseWebPush['status']>('idle')
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | undefined>()

  // Probe server-side readiness
  useEffect(() => {
    let cancelled = false
    fetchWebPushKey()
      .then((k) => { if (cancelled) return; setServerReady(!!k.ready); setVapidKey(k.public_key) })
      .catch(() => { if (!cancelled) setServerReady(false) })
    return () => { cancelled = true }
  }, [])

  // Check existing subscription + register sw on mount
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      if (cancelled) return
      const sub = await reg.pushManager.getSubscription()
      if (sub) setEnabled(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [supported])

  const enable = useCallback(async () => {
    if (!supported) { setStatus('error'); setError('Push not supported in this browser'); return }
    if (!serverReady || !vapidKey) { setStatus('error'); setError('Push server not configured'); return }
    setStatus('requesting'); setError(undefined)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setStatus('denied'); return }
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        // Cast — TS complains about Uint8Array vs BufferSource here despite
        // it being the documented exact type for applicationServerKey.
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(vapidKey) as unknown as BufferSource,
        })
      }
      await postPushSubscribe(sub, navigator.userAgent)
      setEnabled(true); setStatus('subscribed')
    } catch (e) {
      setStatus('error'); setError(String(e))
    }
  }, [supported, serverReady, vapidKey])

  const disable = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await postPushUnsubscribe(sub.endpoint).catch(() => {})
        await sub.unsubscribe()
      }
      setEnabled(false); setStatus('idle')
    } catch (e) {
      setStatus('error'); setError(String(e))
    }
  }, [])

  const test = useCallback(async () => {
    try { await postPushTest() } catch (e) { setError(String(e)) }
  }, [])

  return { supported, serverReady, enabled, enable, disable, test, status, error }
}
