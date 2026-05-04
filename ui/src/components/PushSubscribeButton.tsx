/** Single button for subscribing to / unsubscribing from VAPID web-push
 * notifications. Hidden when the browser doesn't support push or the
 * server isn't configured. */
import { useWebPush } from '../hooks/useWebPush'

export default function PushSubscribeButton() {
  const { supported, serverReady, enabled, enable, disable, test, status, error } = useWebPush()

  if (!supported) {
    return (
      <span title="Push notifications require a modern browser (Chrome / Firefox / Edge)" style={{
        fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic',
      }}>
        push n/a
      </span>
    )
  }
  if (!serverReady) return null

  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <button
        onClick={enabled ? disable : enable}
        title={enabled
          ? 'Disable OS-level push notifications'
          : 'Subscribe to OS-level push (works with the tab closed)'}
        aria-pressed={enabled}
        style={{
          background: enabled ? '#22c55e' : 'transparent',
          border: `1px solid ${enabled ? '#22c55e' : 'var(--border)'}`,
          color: enabled ? '#000' : 'var(--text-muted)',
          padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
        }}
      >
        {status === 'requesting' ? '…' : enabled ? '🔔 PUSH ON' : '🔕 PUSH'}
      </button>
      {enabled && (
        <button
          onClick={test}
          title="Send a test push to confirm delivery"
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 3,
            fontSize: 10, cursor: 'pointer',
          }}
        >
          Test
        </button>
      )}
      {error && (
        <span title={error} style={{ fontSize: 9, color: '#fca5a5' }}>err</span>
      )}
    </span>
  )
}
