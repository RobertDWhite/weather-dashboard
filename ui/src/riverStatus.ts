import type { RiverGauge } from './types'
export function riverStatus(gauge: RiverGauge, now = Date.now()) {
  const observed = Date.parse(gauge.time)
  if (!Number.isFinite(observed) || now - observed > 2 * 60 * 60_000)
    return { label: 'Observation stale', color: 'var(--warn-yellow)', elevated: false, known: false }
  const t = gauge.thresholds
  if (!t || t.unit !== gauge.unit || !Number.isFinite(gauge.height))
    return { label: 'Classification unavailable', color: 'var(--text-muted)', elevated: false, known: false }
  for (const [key, label, color] of [
    ['major', 'Major flooding', 'var(--warn-red)'],
    ['moderate', 'Moderate flooding', 'var(--warn-orange)'],
    ['minor', 'Minor flooding', 'var(--warn-orange)'],
    ['action', 'Action stage', 'var(--warn-yellow)'],
  ] as const) {
    if (t[key] != null && gauge.height >= t[key]!) return { label, color, elevated: true, known: true }
  }
  return t.minor == null
    ? { label: 'Classification unavailable', color: 'var(--text-muted)', elevated: false, known: false }
    : { label: 'Below flood stage', color: 'var(--warn-green)', elevated: false, known: true }
}
