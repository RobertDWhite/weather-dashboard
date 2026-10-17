import { useEffect, useRef, useState } from 'react'
import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
import { fetchBriefing, fetchBriefingStatus } from '../api'
import type { AlertScope } from '../mapWorkflows'
export default function BriefingPanel({
  scope = 'nearby',
  radius = 75,
}: {
  scope?: AlertScope
  radius?: number
}) {
  const availability = useFeed('briefing-status', fetchBriefingStatus, { interval: 300_000 })
  const regenerate = useRef(false)
  const feed = useFeed(
    `briefing:${scope}:${radius}`,
    (signal) => {
      const refresh = regenerate.current
      regenerate.current = false
      return fetchBriefing(signal, { scope, radius, refresh })
    },
    { enabled: availability.data?.ok === true, interval: 600_000 },
  )
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!feed.refreshing) return
    setElapsed(0)
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [feed.refreshing])
  const data = feed.data
  if (!availability.data) return <FeedStatus feed={availability} name="AI briefing service" />
  if (!availability.data.ok)
    return (
      <p className="notice">
        AI briefing service unavailable.{' '}
        <button className="quiet-button" onClick={availability.retry}>
          Retry service
        </button>
      </p>
    )
  const scopeLabel = scope === 'home' ? 'At home' : `Nearby · ${radius} miles`
  return (
    <section className="card ai-briefing" aria-label="AI briefing">
      <FeedStatus feed={feed} name="AI briefing" />
      <div className="card-title">
        <h2>AI briefing</h2>
        <button
          className="quiet-button"
          disabled={feed.refreshing}
          onClick={() => {
            regenerate.current = true
            feed.retry()
          }}
        >
          Regenerate briefing
        </button>
      </div>
      <p className="notice">
        {scopeLabel} · {data?.model ?? availability.data.configured_model}
      </p>
      {feed.refreshing && (
        <p role="status">
          Collecting weather context and generating a summary… {elapsed}s. This can take up to two minutes.
          {data ? ' The previous briefing remains below.' : ''}
        </p>
      )}
      {feed.error && (
        <p role="status" className="source-warning">
          Could not update the briefing.{data ? ' Showing the previous generation below.' : ''}
        </p>
      )}
      {data && (
        <>
          {data.source === 'fallback' && (
            <p className="source-warning">Basic summary · AI or required source data unavailable.</p>
          )}
          {!!Object.entries(data.sources ?? {}).filter(([, status]) => status === 'unavailable').length && (
            <p className="source-warning">
              Unavailable sources:{' '}
              {Object.entries(data.sources ?? {})
                .filter(([, status]) => status === 'unavailable')
                .map(
                  ([name]) =>
                    ({
                      alerts: 'NWS alerts',
                      lsrs: 'Local storm reports',
                      afd: 'Forecast discussion',
                      hwo: 'Hazardous weather outlook',
                    })[name] ?? name,
                )
                .join(', ')}
              . Missing data does not mean no threats.
            </p>
          )}
          <p className="briefing-text">{data.text || 'No briefing text returned.'}</p>
          <p className="chart-note">
            {data.context.alerts_count === null
              ? 'Alert count unknown'
              : `${data.context.alerts_count} alert(s)`}{' '}
            ·{' '}
            {data.context.lsrs_count === null
              ? 'Storm report count unknown'
              : `${data.context.lsrs_count} storm report(s)`}
          </p>
          <p className="briefing-times">
            Generated{' '}
            <time dateTime={new Date(data.generated_at * 1000).toISOString()}>
              {new Date(data.generated_at * 1000).toLocaleString()}
            </time>
            <br />
            Last checked {feed.lastSuccess ? new Date(feed.lastSuccess).toLocaleString() : '—'}
          </p>
        </>
      )}
    </section>
  )
}
