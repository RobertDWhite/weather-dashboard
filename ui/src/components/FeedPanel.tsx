import type { ReactNode } from 'react'
import type { Feed } from '../hooks/useFeed'

export function FeedStatus({ feed, name }: { feed: Omit<Feed<unknown>, 'data'>; name: string }) {
  return (
    <div className={`feed-status feed-${feed.status}`} role="status">
      <span>
        {feed.status === 'loading'
          ? `Loading ${name}…`
          : feed.status === 'error'
            ? `${name} unavailable`
            : feed.status === 'stale'
              ? `${name} stale — last update could not be verified`
              : feed.status === 'disabled'
                ? `${name} paused`
                : `${name} connected`}
        {feed.lastSuccess !== null && (
          <>
            {' '}
            · Last success{' '}
            <time dateTime={new Date(feed.lastSuccess).toISOString()}>
              {new Date(feed.lastSuccess).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          </>
        )}
      </span>
      {feed.status !== 'success' && (
        <button className="quiet-button" onClick={feed.retry} disabled={feed.refreshing}>
          {feed.refreshing ? 'Fetching…' : 'Retry'}
        </button>
      )}
    </div>
  )
}

export default function FeedPanel<T>({
  feed,
  name,
  children,
  allowStale = true,
}: {
  feed: Feed<T>
  name: string
  children: (data: T) => ReactNode
  allowStale?: boolean
}) {
  return (
    <section className="feed-panel" aria-label={name} aria-busy={feed.refreshing}>
      <FeedStatus feed={feed} name={name} />
      {feed.data !== null && (allowStale || feed.status === 'success') && children(feed.data)}
    </section>
  )
}
