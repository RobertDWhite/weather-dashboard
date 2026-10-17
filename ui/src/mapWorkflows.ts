export interface MapPosition {
  lat: number
  lon: number
  zoom: number
}
export const initialLayers = {
  metars: false,
  cells: false,
  fires: false,
  quakes: false,
  spotters: false,
  mrms: false,
  glm: false,
  ptype: false,
  probsevere: false,
  rings: true,
  reports: false,
  hazards: false,
  aprs: false,
  spc: false,
}
export type Layers = typeof initialLayers
export type AlertScope = 'home' | 'nearby'
export type Basemap = 'dark' | 'street' | 'satellite'
export interface LayerPreset {
  name: string
  layers: Layers
  basemap: Basemap
  nexradOn: boolean
  nexradSite: string
  nexradProduct: string
  nexradCoords: { lat: number; lon: number } | null
}
export function readMapLink(search: string) {
  const q = new URLSearchParams(search)
  const num = (key: string) => (q.has(key) && q.get(key)?.trim() ? Number(q.get(key)) : NaN)
  const lat = num('lat'),
    lon = num('lon'),
    zoom = num('z'),
    at = num('at')
  const position: MapPosition | null =
    Number.isFinite(lat) &&
    Math.abs(lat) <= 85 &&
    Number.isFinite(lon) &&
    Math.abs(lon) <= 180 &&
    Number.isFinite(zoom) &&
    zoom >= 3 &&
    zoom <= 14
      ? { lat, lon, zoom }
      : null
  const layerNames = (q.get('layers') ?? '').split(',')
  const layers = q.has('layers')
    ? (Object.fromEntries(Object.keys(initialLayers).map((k) => [k, layerNames.includes(k)])) as Layers)
    : undefined
  const base = q.get('base'),
    scope = q.get('scope'),
    view = q.get('map')
  const radius = num('radius')
  return {
    position,
    layers,
    basemap: ['dark', 'street', 'satellite'].includes(base ?? '') ? (base as Basemap) : undefined,
    scope: scope === 'home' || scope === 'nearby' ? (scope as AlertScope) : undefined,
    view: view === 'radar' || view === 'alerts' ? (view as 'radar' | 'alerts') : undefined,
    radius: Number.isFinite(radius) && radius >= 1 && radius <= 250 ? radius : undefined,
    timestamp: Number.isFinite(at) && at > 0 && at <= Date.now() / 1000 ? Math.floor(at) : null,
    nexradSite: /^[A-Z]{3,4}$/.test(q.get('site') ?? '') ? q.get('site')! : '',
    nexradProduct: /^[A-Z0-9]{3}$/.test(q.get('product') ?? '') ? q.get('product')! : 'N0Q',
  }
}
export function mapShareUrl(
  href: string,
  state: {
    position: MapPosition
    view: string
    layers: Layers
    basemap: Basemap
    timestamp: number | null
    scope: AlertScope
    radius: number
    nexradOn: boolean
    nexradSite: string
    nexradProduct: string
  },
) {
  const url = new URL(href)
  url.searchParams.delete('embed')
  for (const [key, value] of Object.entries({
    map: state.view,
    lat: Math.max(-85, Math.min(85, state.position.lat)).toFixed(5),
    lon: (((((state.position.lon + 180) % 360) + 360) % 360) - 180).toFixed(5),
    z: state.position.zoom,
    base: state.basemap,
    layers: Object.entries(state.layers)
      .filter(([, on]) => on)
      .map(([name]) => name)
      .join(','),
    scope: state.scope,
    radius: state.radius,
  }))
    url.searchParams.set(key, String(value))
  for (const key of ['at', 'site', 'product']) url.searchParams.delete(key)
  if (state.timestamp !== null) url.searchParams.set('at', String(state.timestamp))
  if (state.nexradOn && state.nexradSite) {
    url.searchParams.set('site', state.nexradSite)
    url.searchParams.set('product', state.nexradProduct)
  }
  return url.toString()
}
export function validPreset(value: unknown): value is LayerPreset {
  if (!value || typeof value !== 'object') return false
  const p = value as LayerPreset
  return (
    typeof p.name === 'string' &&
    p.name.trim().length > 0 &&
    p.name.length <= 60 &&
    !!p.layers &&
    Object.keys(initialLayers).every((k) => typeof p.layers[k as keyof Layers] === 'boolean') &&
    ['dark', 'street', 'satellite'].includes(p.basemap) &&
    typeof p.nexradOn === 'boolean' &&
    typeof p.nexradSite === 'string' &&
    typeof p.nexradProduct === 'string' &&
    (p.nexradCoords === null ||
      (!!p.nexradCoords &&
        Number.isFinite(p.nexradCoords.lat) &&
        Math.abs(p.nexradCoords.lat) <= 85 &&
        Number.isFinite(p.nexradCoords.lon) &&
        Math.abs(p.nexradCoords.lon) <= 180))
  )
}
export const builtInPresets: LayerPreset[] = [
  {
    name: 'Radar basics',
    layers: { ...initialLayers },
    basemap: 'dark',
    nexradOn: false,
    nexradSite: '',
    nexradProduct: 'N0Q',
    nexradCoords: null,
  },
  {
    name: 'Severe weather',
    layers: { ...initialLayers, spc: true, cells: true, reports: true, hazards: true, probsevere: true },
    basemap: 'dark',
    nexradOn: false,
    nexradSite: '',
    nexradProduct: 'N0Q',
    nexradCoords: null,
  },
  {
    name: 'Winter weather',
    layers: { ...initialLayers, mrms: true, ptype: true, metars: true },
    basemap: 'dark',
    nexradOn: false,
    nexradSite: '',
    nexradProduct: 'N0Q',
    nexradCoords: null,
  },
]
