import type { NWSAlert } from './types'
/** Leaflet GeoJSON data is immutable; a revision remounts changed geometry and popups. */
export function geometryRevision(data: unknown): string {
  const text = JSON.stringify(data) ?? ''
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(36)
}
export function alertZonePaths(alerts: NWSAlert[]) {
  return [
    ...new Set(
      alerts
        .filter((a) => !a.geometry)
        .flatMap((a) => a.properties.affectedZones ?? [])
        .flatMap((url) => {
          const match = url.match(/\/zones\/([^/]+\/[^/]+)$/)
          return match ? [match[1]] : []
        }),
    ),
  ].sort()
}
