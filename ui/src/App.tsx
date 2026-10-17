import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import type { LocalStormReport, LsrCategory, NWSAlert, NWSAlertsResponse } from './types'
import * as api from './api'
import { useFeed } from './hooks/useFeed'
import { useEmergencyAlarm } from './hooks/useEmergencyAlarm'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import WeatherHeader from './components/WeatherHeader'
import EmergencyBanner from './components/EmergencyBanner'
import AlertBanner from './components/AlertBanner'
import AlertPanel from './components/AlertPanel'
import CurrentConditions from './components/CurrentConditions'
import Forecast from './components/Forecast'
import FeedPanel, { FeedStatus } from './components/FeedPanel'
import ToolSection from './components/ToolSection'
import LayersDrawer from './components/LayersDrawer'
import StatusFooter from './components/StatusFooter'
import TimeMachineBar from './components/TimeMachineBar'
import {
  initialLayers,
  readMapLink,
  mapShareUrl,
  type MapPosition,
  type Basemap,
  type AlertScope,
  type LayerPreset,
} from './mapWorkflows'
import MapPresets from './components/MapPresets'
import NextHours from './components/NextHours'
import { useNow } from './hooks/useNow'

const RadarMap = lazy(() => import('./components/RadarMap'))
const AlertsMap = lazy(() => import('./components/AlertsMap'))
const AlertsDrawer = lazy(() => import('./components/AlertsDrawer'))
const HourlyChart = lazy(() => import('./components/HourlyChart'))
const NexradPicker = lazy(() => import('./components/NexradPicker'))
const SpcOutlook = lazy(() => import('./components/SpcOutlook'))
const StormReports = lazy(() => import('./components/StormReports'))
const Satellite = lazy(() => import('./components/Satellite'))
const RiverGauges = lazy(() => import('./components/RiverGauges'))
const CameraPanel = lazy(() => import('./components/CameraPanel'))
const PinnedLiveBar = lazy(() => import('./components/PinnedLiveBar'))
const Mesoanalysis = lazy(() => import('./components/Mesoanalysis'))
const HurricanesPanel = lazy(() => import('./components/HurricanesPanel'))
const WatchesPanel = lazy(() => import('./components/WatchesPanel'))
const MesoscaleDiscussions = lazy(() => import('./components/MesoscaleDiscussions'))
const LsrPanel = lazy(() => import('./components/LsrPanel'))
const WpcPanel = lazy(() => import('./components/WpcPanel'))
const NwsTextPanel = lazy(() => import('./components/NwsTextPanel'))
const TropicalOutlookPanel = lazy(() => import('./components/TropicalOutlookPanel'))
const AqiPanel = lazy(() => import('./components/AqiPanel'))
const HrrrLoopPanel = lazy(() => import('./components/HrrrLoopPanel'))
const DailyStats = lazy(() => import('./components/DailyStatsPanel'))
const BriefingPanel = lazy(() => import('./components/BriefingPanel'))
const LightningPanel = lazy(() => import('./components/LightningPanel'))
const WildfiresPanel = lazy(() => import('./components/WildfiresPanel'))
const QuakesPanel = lazy(() => import('./components/QuakesPanel'))
const SpottersPanel = lazy(() => import('./components/SpottersPanel'))
const AviationPanel = lazy(() => import('./components/AviationPanel'))
const MarinePanel = lazy(() => import('./components/MarinePanel'))
const VerificationPanel = lazy(() => import('./components/VerificationPanel'))

type MapView = 'radar' | 'alerts'
type LayerKey = keyof typeof initialLayers
function saved<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}
const EMPTY_ALERTS: NWSAlert[] = []

export default function App() {
  const [link] = useState(() => readMapLink(window.location.search))
  const now = useNow()
  const embed = new URLSearchParams(window.location.search).get('embed')
  const embedded = embed === 'radar' || embed === 'alerts'
  const [mapView, setMapView] = useState<MapView>(embed === 'alerts' ? 'alerts' : (link.view ?? 'radar'))
  const switchView = useCallback((view: MapView) => setMapView(view), [])
  const mapRef = useRef<LeafletMap | null>(null)
  const mapRegion = useRef<HTMLElement | null>(null)
  const [operations, setOperations] = useState<boolean>(() => saved('wx-operations', false))
  const [tvMode, setTvMode] = useState<boolean>(() => !embedded && saved('wx-tv-mode', false))
  const [layers, setLayers] = useState(() => ({
    ...initialLayers,
    ...saved<Partial<typeof initialLayers>>('wx-layers', {}),
    ...link.layers,
  }))
  const toggleLayer = (key: LayerKey) => setLayers((s) => ({ ...s, [key]: !s[key] }))
  const [basemap, setBasemap] = useState<Basemap>(() => link.basemap ?? saved('wx-basemap', 'dark'))
  const [mapPosition, setMapPosition] = useState<MapPosition | null>(link.position)
  const [shareLink, setShareLink] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [sharedView, setSharedView] = useState(!!(link.position || link.view || link.timestamp))
  const [alertScope, setAlertScope] = useState<AlertScope>(
    () => link.scope ?? saved('wx-alert-scope', 'nearby'),
  )
  const [alertRadius, setAlertRadius] = useState(() => link.radius ?? saved('wx-alert-radius', 75))
  const scopeLabel = alertScope === 'home' ? 'At home' : `Nearby · ${alertRadius} miles`
  const onPositionChange = useCallback(
    (position: MapPosition) =>
      setMapPosition((old) =>
        old?.lat === position.lat && old?.lon === position.lon && old?.zoom === position.zoom
          ? old
          : position,
      ),
    [],
  )
  const [layersOpen, setLayersOpen] = useState(false)
  const [drawer, setDrawer] = useState<{ alerts: NWSAlert[]; id?: string; archived?: boolean } | null>(null)
  const [nexradOn, setNexradOn] = useState(!!link.nexradSite)
  const [nexradSite, setNexradSite] = useState(link.nexradSite)
  const [nexradProduct, setNexradProduct] = useState(link.nexradProduct)
  const [nexradCoords, setNexradCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [radarTick, setRadarTick] = useState(Date.now())
  const [timeMachineTs, setTimeMachineTs] = useState<number | null>(link.timestamp)
  const replay = timeMachineTs !== null
  const config = useFeed('config', api.fetchConfig, { interval: 300_000 })
  const current = useFeed('current', api.fetchCurrent)
  const forecast = useFeed('forecast', api.fetchForecast, { interval: 300_000 })
  const alerts = useFeed('national-alerts', api.fetchAlerts)
  const localAlerts = useFeed(`local-alerts:${alertScope}:${alertRadius}`, (signal) =>
    api.fetchLocalAlerts(signal, alertScope, alertRadius),
  )
  const [summaryOpen, setSummaryOpen] = useState(false)
  const extra = operations || summaryOpen
  const reports = useFeed('reports', api.fetchStormReports, { enabled: extra || layers.reports })
  const aprs = useFeed('aprs', api.fetchAprsStations, { enabled: extra || layers.aprs })
  const hurricanes = useFeed('hurricanes', api.fetchActiveStorms, { enabled: extra || layers.hazards })
  const watches = useFeed('watches', api.fetchSpcWatches, { enabled: extra || layers.hazards })
  const mesoscales = useFeed('mesoscales', api.fetchMesoscale, { enabled: extra || layers.hazards })
  const lsrs = useFeed('lsrs', (s) => api.fetchLsrs(2, s), { enabled: extra || layers.reports })
  const homeCenter: [number, number] = [config.data?.lat ?? 39.5, config.data?.lon ?? -98.5]
  const radarSites = useFeed(
    `radar-sites:${homeCenter}`,
    (signal) => api.fetchNexradSites(homeCenter[0], homeCenter[1], signal),
    { enabled: nexradOn && !replay, interval: 3_600_000 },
  )
  useEffect(() => {
    if (!radarSites.data) return
    const site = nexradSite
      ? radarSites.data.sites.find((s) => s.id === nexradSite)
      : radarSites.data.sites[0]
    setNexradCoords(site ? { lat: site.lat, lon: site.lon } : null)
    if (!nexradSite && site) setNexradSite(site.id)
  }, [radarSites.data, nexradSite])
  const metars = useFeed(
    `metars:${homeCenter}`,
    (s) => api.fetchMetarMesh({ lat: homeCenter[0], lon: homeCenter[1], radius_km: 350, limit: 120 }, s),
    { enabled: layers.metars && !!config.data, interval: 300_000 },
  )
  const cells = useFeed('cells', api.fetchStormCells, { enabled: layers.cells, interval: 120_000 })
  const fires = useFeed('fires', api.fetchWildfires, { enabled: layers.fires, interval: 1_800_000 })
  const quakes = useFeed('quakes', (s) => api.fetchQuakes('1d', s), {
    enabled: layers.quakes,
    interval: 120_000,
  })
  const spotters = useFeed('spotters', api.fetchSpotters, { enabled: layers.spotters, interval: 120_000 })
  const snapshot = useFeed(`snapshot:${timeMachineTs}`, (s) => api.fetchTimeMachineAt(timeMachineTs!, s), {
    enabled: replay,
    interval: 0,
    maxAge: Infinity,
  })
  const liveAlerts = localAlerts.data?.features ?? EMPTY_ALERTS
  const alertKey = liveAlerts
    .map((a) => a.properties.id || a.id)
    .sort()
    .join(',')
  const priority = useFeed(
    `priority:${alertKey}`,
    (s) =>
      api.postPrioritize(
        liveAlerts.map((a) => ({
          id: a.properties.id || a.id,
          event: a.properties.event,
          severity: a.properties.severity,
          headline: a.properties.headline,
          areaDesc: a.properties.areaDesc,
          expires: a.properties.expires,
        })),
        s,
      ),
    { enabled: operations && localAlerts.status === 'success' && liveAlerts.length > 0, interval: 300_000 },
  )
  const rankedAlerts = useMemo(() => {
    const order = priority.data?.order ?? []
    const rank = (a: NWSAlert) => {
      const i = order.indexOf(a.properties.id || a.id)
      return i < 0 ? order.length : i
    }
    return [...liveAlerts].sort((a, b) => rank(a) - rank(b))
  }, [liveAlerts, priority.data])
  // Only verified, fresh, local observations can drive audio/notifications/webhooks.
  const alarm = useEmergencyAlarm(localAlerts.status === 'success' ? liveAlerts : EMPTY_ALERTS)
  const replayAlerts: NWSAlertsResponse | null =
    snapshot.status === 'success' && snapshot.data
      ? {
          type: 'FeatureCollection',
          features: snapshot.data.alerts.features,
          updated: new Date(snapshot.data.snapshot_ts * 1000).toISOString(),
        }
      : null
  const mapAlerts = replay ? replayAlerts : alerts.status === 'success' ? alerts.data : null
  const effectiveLsrs = useMemo(() => {
    if (!replay) return lsrs.data?.items ?? []
    if (snapshot.status !== 'success') return []
    return (snapshot.data?.lsrs.features ?? []).flatMap((f): LocalStormReport[] => {
      if (f.geometry?.type !== 'Point') return []
      const p = f.properties ?? {}
      const categories: Record<string, LsrCategory> = {
        T: 'tornado',
        H: 'hail',
        W: 'wind',
        F: 'flood',
        TOR: 'tornado',
        HAIL: 'hail',
      }
      return [
        {
          valid: p.valid ?? null,
          type: p.type ?? '',
          category: categories[p.type] ?? 'other',
          magnitude: p.magnitude ?? null,
          city: p.city ?? null,
          county: p.county ?? null,
          state: p.st ?? p.state ?? null,
          wfo: p.wfo ?? null,
          source: p.source ?? null,
          remark: p.remark ?? null,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        },
      ]
    })
  }, [replay, snapshot.data, snapshot.status, lsrs.data])
  const flyTo = useCallback((lat: number, lon: number, zoom = 9) => {
    mapRegion.current?.scrollIntoView({ block: 'nearest' })
    mapRef.current?.flyTo([lat, lon], zoom, {
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.2,
    })
  }, [])
  const openLiveDrawer = (id?: string) => setDrawer({ alerts: liveAlerts, id })
  const severeLive =
    localAlerts.status === 'success'
      ? liveAlerts.filter((a) => ['Extreme', 'Severe'].includes(a.properties.severity))
      : []
  useEffect(() => {
    try {
      localStorage.setItem('wx-layers', JSON.stringify(layers))
      localStorage.setItem('wx-basemap', JSON.stringify(basemap))
      localStorage.setItem('wx-alert-scope', JSON.stringify(alertScope))
      localStorage.setItem('wx-alert-radius', JSON.stringify(alertRadius))
      localStorage.setItem('wx-operations', JSON.stringify(operations))
      localStorage.setItem('wx-tv-mode', JSON.stringify(tvMode))
    } catch {
      /* storage unavailable */
    }
  }, [layers, operations, tvMode, basemap, alertScope, alertRadius])
  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode)
    return () => document.body.classList.remove('tv-mode')
  }, [tvMode])
  useEffect(() => {
    const t = setInterval(() => setRadarTick(Date.now()), 120_000)
    return () => clearInterval(t)
  }, [])
  useKeyboardShortcuts({
    r: () => switchView('radar'),
    a: () => switchView('alerts'),
    m: () => toggleLayer('metars'),
    n: () => {
      if (!replay) {
        setNexradOn((v) => !v)
        if (!nexradSite) setLayersOpen(true)
      }
    },
    t: () => setTvMode((v) => !v),
    g: () => toggleLayer('rings'),
    c: () => toggleLayer('cells'),
    f: () => toggleLayer('fires'),
    q: () => toggleLayer('quakes'),
    s: () => toggleLayer('spotters'),
    '/': () => openLiveDrawer(),
    '?': () => openLiveDrawer(),
    Escape: () => setTvMode(false),
  })
  const options = (
    [
      ['mrms', 'MRMS composite', 'Radar & lightning'],
      ['glm', 'GOES lightning', 'Radar & lightning'],
      ['ptype', 'Precipitation type', 'Radar & lightning'],
      ['probsevere', 'Severe storm probability', 'Radar & lightning'],
      ['cells', 'Storm cells', 'Radar & lightning'],
      ['spc', 'SPC outlook', 'Hazards'],
      ['hazards', 'Hurricanes, watches & discussions', 'Hazards'],
      ['fires', 'Wildfires', 'Hazards'],
      ['quakes', 'Earthquakes', 'Hazards'],
      ['reports', 'Storm reports', 'Observations'],
      ['metars', 'Airport observations (METAR)', 'Observations'],
      ['aprs', 'APRS weather stations', 'Observations'],
      ['spotters', 'Storm spotters', 'Observations'],
      ['rings', 'Distance rings', 'Map'],
    ] as [LayerKey, string, string][]
  ).map(([id, label, group]) => ({
    id,
    label,
    group,
    checked: layers[id],
    disabled:
      (replay && id !== 'rings') ||
      (mapView === 'alerts' && ['mrms', 'glm', 'ptype', 'probsevere', 'spc'].includes(id)),
    toggle: () => toggleLayer(id),
  }))
  const applyPreset = (preset: LayerPreset) => {
    setLayers({ ...preset.layers })
    setBasemap(preset.basemap)
    setNexradOn(preset.nexradOn)
    setNexradSite(preset.nexradSite)
    setNexradProduct(preset.nexradProduct)
    setNexradCoords(preset.nexradCoords)
    switchView('radar')
  }
  useEffect(() => {
    if (!sharedView || embedded || (!mapPosition && !config.data)) return
    const position = mapPosition ?? { lat: homeCenter[0], lon: homeCenter[1], zoom: 6 }
    const url = mapShareUrl(window.location.href, {
      position,
      view: mapView,
      layers,
      basemap,
      timestamp: timeMachineTs,
      scope: alertScope,
      radius: alertRadius,
      nexradOn,
      nexradSite,
      nexradProduct,
    })
    if (window.location.href !== url) window.history.replaceState(null, '', url)
    if (shareLink && shareLink !== url) {
      setShareLink(url)
      setShareMessage('View updated. Use Share map to copy this link.')
    }
  }, [
    sharedView,
    embedded,
    mapPosition,
    config.data,
    mapView,
    layers,
    basemap,
    timeMachineTs,
    alertScope,
    alertRadius,
    nexradOn,
    nexradSite,
    nexradProduct,
    shareLink,
  ])
  const shareMap = async () => {
    const c = mapRef.current?.getCenter()
    const position = c
      ? { lat: c.lat, lon: c.lng, zoom: mapRef.current!.getZoom() }
      : (mapPosition ?? { lat: homeCenter[0], lon: homeCenter[1], zoom: 6 })
    setMapPosition(position)
    setSharedView(true)
    const url = mapShareUrl(window.location.href, {
      position,
      view: mapView,
      layers,
      basemap,
      timestamp: timeMachineTs,
      scope: alertScope,
      radius: alertRadius,
      nexradOn,
      nexradSite,
      nexradProduct,
    })
    setShareLink(url)
    try {
      await navigator.clipboard.writeText(url)
      setShareMessage('Map link copied.')
    } catch {
      setShareMessage('Copy the map link below.')
    }
  }
  const sharedMap = {
    position: mapPosition,
    onPositionChange,
    mapRef,
    alerts: mapAlerts,
    reports: !replay && layers.reports ? reports.data : null,
    aprsStations: !replay && layers.aprs ? aprs.data?.stations : [],
    hurricanes: !replay && layers.hazards ? hurricanes.data?.storms : [],
    watches: !replay && layers.hazards ? watches.data?.watches : [],
    mesoscales: !replay && layers.hazards ? mesoscales.data?.items : [],
    lsrs: replay || layers.reports ? effectiveLsrs : [],
    metars: metars.data?.metars,
    showMetars: !replay && layers.metars,
    cells: cells.data?.cells,
    showCells: !replay && layers.cells,
    fires: fires.data?.fires,
    showFires: !replay && layers.fires,
    quakes: quakes.data?.quakes,
    showQuakes: !replay && layers.quakes,
    spotters: spotters.data?.spotters,
    showSpotters: !replay && layers.spotters,
    nexrad:
      !replay && nexradOn
        ? {
            site: nexradSite,
            product: nexradProduct,
            refreshKey: radarTick,
            lat: nexradCoords?.lat,
            lon: nexradCoords?.lon,
          }
        : null,
    showRangeRings: layers.rings,
  }
  const summaryFeeds = [localAlerts, reports, aprs, watches, lsrs]
  const map = (
    <section className="map-region" ref={mapRegion} aria-label="Weather map">
      {!embedded && (
        <div className="map-toolbar">
          <div role="group" aria-label="Map view">
            {(['radar', 'alerts'] as const).map((view) => (
              <button key={view} aria-pressed={mapView === view} onClick={() => switchView(view)}>
                {view === 'radar' ? 'Radar' : 'Alerts map'}
              </button>
            ))}
          </div>
          <button onClick={() => setMapPosition({ lat: homeCenter[0], lon: homeCenter[1], zoom: 6 })}>
            Home
          </button>
          <button onClick={shareMap}>Share map</button>
          <button aria-haspopup="dialog" onClick={() => setLayersOpen(true)}>
            Layers · {options.filter((o) => o.checked && !o.disabled).length + (nexradOn && !replay ? 1 : 0)}
          </button>
        </div>
      )}
      {!embedded && (
        <div className="active-layers">
          {replay
            ? 'Archived alerts & storm reports'
            : `Enabled: ${['NWS alerts', ...options.filter((o) => o.checked && !o.disabled).map((o) => o.label), ...(nexradOn ? ['NEXRAD'] : [])].join(' · ')}`}
        </div>
      )}
      {shareLink && (
        <div className="map-share">
          <p role="status">{shareMessage}</p>
          <label>
            Map link
            <input readOnly value={shareLink} onFocus={(e) => e.target.select()} />
          </label>
          <button
            onClick={() => {
              setShareLink('')
              setShareMessage('')
            }}
          >
            Close link
          </button>
        </div>
      )}
      <FeedStatus feed={replay ? snapshot : alerts} name={replay ? 'Archive' : 'Map alerts'} />
      {nexradOn && !replay && (
        <>
          <FeedStatus feed={radarSites} name="NEXRAD station" />
          {radarSites.data && !nexradCoords && (
            <p className="notice">
              Radar station {nexradSite || 'selection'} is unavailable. Choose a station in Layers.
            </p>
          )}
        </>
      )}
      {replay && (
        <div className="replay-notice" role="status">
          <strong>
            REPLAY · {new Date((snapshot.data?.snapshot_ts ?? timeMachineTs!) * 1000).toLocaleString()}
          </strong>
          <span>
            Requested {new Date(timeMachineTs! * 1000).toLocaleString()}. Live overlays paused; local alerts
            and forecasts elsewhere remain live.
          </span>
          {snapshot.data && Math.abs(snapshot.data.snapshot_ts - timeMachineTs!) > 300 && (
            <span>
              The closest retained snapshot differs from the requested time. Older history may have expired.
            </span>
          )}
          <button onClick={() => setTimeMachineTs(null)}>Return to live</button>
        </div>
      )}
      <div className="map-canvas">
        <Suspense fallback={<p role="status">Loading map…</p>}>
          {config.status === 'loading' ? (
            <p role="status">Loading map location…</p>
          ) : mapView === 'radar' ? (
            <RadarMap
              {...sharedMap}
              center={homeCenter}
              basemap={basemap}
              forceTimestamp={timeMachineTs}
              showMrms={!replay && layers.mrms}
              showGlm={!replay && layers.glm}
              showPType={!replay && layers.ptype}
              showProbSevere={!replay && layers.probsevere}
              showSpc={!replay && layers.spc}
            />
          ) : (
            <AlertsMap {...sharedMap} homeCenter={homeCenter} basemap={basemap} />
          )}
        </Suspense>
      </div>
      {!embedded && <TimeMachineBar ts={timeMachineTs} onChange={setTimeMachineTs} hours={6} />}
      {replay && (
        <FeedPanel feed={snapshot} name="Archived national alerts" allowStale={false}>
          {(s) => (
            <AlertPanel
              title="Archived national alerts"
              emptyLabel="No alerts in this snapshot"
              alerts={s.alerts.features}
              onLocate={flyTo}
              onOpenDrawer={(id) => setDrawer({ alerts: s.alerts.features, id, archived: true })}
            />
          )}
        </FeedPanel>
      )}
      {!replay && (
        <div className="overlay-status">
          {[
            [layers.metars, metars, 'METAR'],
            [layers.cells, cells, 'Storm cells'],
            [layers.fires, fires, 'Wildfires'],
            [layers.quakes, quakes, 'Earthquakes'],
            [layers.spotters, spotters, 'Spotters'],
            [layers.reports, reports, 'Storm reports'],
            [layers.reports, lsrs, 'Local storm reports'],
            [layers.aprs, aprs, 'APRS'],
            [layers.hazards, hurricanes, 'Hurricanes'],
            [layers.hazards, watches, 'Watches'],
            [layers.hazards, mesoscales, 'Discussions'],
          ].map(
            ([on, feed, name]) =>
              on && <FeedStatus key={String(name)} feed={feed as typeof metars} name={String(name)} />,
          )}
        </div>
      )}
    </section>
  )
  return (
    <div
      className={`dashboard ${operations ? 'operations' : 'overview'} ${tvMode || embedded ? 'map-only' : ''}`}
    >
      {!embedded && (
        <>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <WeatherHeader
            location={`${config.data?.location ?? 'Location unavailable'} · ${scopeLabel}`}
            lastUpdate={localAlerts.lastSuccess === null ? null : new Date(localAlerts.lastSuccess)}
            alertCount={liveAlerts.length}
            alertStatus={localAlerts.status}
            coverageIncomplete={localAlerts.data?.incomplete}
            onAlertsClick={() => openLiveDrawer()}
          />
          {!tvMode && (
            <nav className="workspace-toolbar" aria-label="Dashboard layout">
              <label className="mobile-scope">
                Area
                <select
                  aria-label="Alert area"
                  value={alertScope === 'home' ? 'home' : String(alertRadius)}
                  onChange={(e) => {
                    if (e.target.value === 'home') setAlertScope('home')
                    else {
                      setAlertScope('nearby')
                      setAlertRadius(Number(e.target.value))
                    }
                  }}
                >
                  <option value="home">At home</option>
                  {[25, 50, 75, 100, 150, 250].map((r) => (
                    <option key={r} value={r}>
                      Nearby · {r} mi
                    </option>
                  ))}
                </select>
              </label>
              <div className="scope-controls" role="group" aria-label="Alert area">
                <button aria-pressed={alertScope === 'home'} onClick={() => setAlertScope('home')}>
                  At home
                </button>
                <button aria-pressed={alertScope === 'nearby'} onClick={() => setAlertScope('nearby')}>
                  Nearby
                </button>
                {alertScope === 'nearby' && (
                  <label>
                    Radius
                    <select
                      aria-label="Nearby alert radius"
                      value={alertRadius}
                      onChange={(e) => setAlertRadius(Number(e.target.value))}
                    >
                      {[25, 50, 75, 100, 150, 250].map((r) => (
                        <option key={r} value={r}>
                          {r} miles
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div role="group" aria-label="Workspace">
                <button aria-pressed={!operations} onClick={() => setOperations(false)}>
                  Overview
                </button>
                <button aria-pressed={operations} onClick={() => setOperations(true)}>
                  Operations
                </button>
              </div>
            </nav>
          )}
          {config.status !== 'success' && <FeedStatus feed={config} name="Location settings" />}
          {localAlerts.status !== 'success' && <FeedStatus feed={localAlerts} name="Live local alerts" />}
        </>
      )}
      <EmergencyBanner alerts={severeLive} onLocate={flyTo} onOpenDrawer={(id) => openLiveDrawer(id)} />
      {severeLive.length > 0 && (
        <AlertBanner alerts={severeLive} onLocate={flyTo} onOpenDrawer={(id) => openLiveDrawer(id)} />
      )}
      <main id="main-content" className="dashboard-main" tabIndex={-1}>
        {map}
        {!embedded && !tvMode && (
          <aside className="weather-panel" aria-label="Local weather and tools">
            <div className="now-panel">
              <FeedPanel feed={localAlerts} name="Live local alerts" allowStale={false}>
                {() => (
                  <AlertPanel
                    incomplete={localAlerts.data?.incomplete}
                    title={`${scopeLabel} alerts`}
                    compact={!operations}
                    timezone={forecast.data?.timezone ?? current.data?.timezone ?? 'UTC'}
                    alerts={rankedAlerts}
                    onLocate={flyTo}
                    onOpenDrawer={(id) => openLiveDrawer(id)}
                  />
                )}
              </FeedPanel>
              {operations && priority.data?.source === 'ollama' && (
                <p className="notice" title={priority.data.reasoning}>
                  AI-ranked within severity · {priority.data.reasoning}
                </p>
              )}
              <FeedPanel feed={current} name="Current conditions">
                {(d) => <CurrentConditions data={d} compact={!operations} />}
              </FeedPanel>
              {forecast.data && (
                <NextHours hourly={forecast.data.hourly} timezone={forecast.data.timezone} now={now} />
              )}
            </div>
            <div className="forecast-panel">
              <FeedPanel feed={forecast} name="Local forecast">
                {(d) => (
                  <>
                    <Suspense fallback={<p role="status">Loading hourly chart…</p>}>
                      <HourlyChart hourly={d.hourly} timezone={d.timezone} now={now} />
                    </Suspense>
                    <Forecast daily={d.daily} hourly={d.hourly} timezone={d.timezone} now={now} />
                  </>
                )}
              </FeedPanel>
            </div>
            <section className="weather-tools" aria-label="Specialist weather tools">
              <div className="tools-heading">
                <h2>Weather tools</h2>
                <span>Open a section to load its data</span>
              </div>
              <button
                className="tool-toggle"
                aria-expanded={summaryOpen || operations}
                onClick={() => {
                  setSummaryOpen((v) => !v)
                  if (operations) setOperations(false)
                }}
              >
                Operations summary <span>{summaryOpen || operations ? '−' : '+'}</span>
              </button>
              {(summaryOpen || operations) && (
                <Suspense fallback={<p>Loading operations…</p>}>
                  <p className="notice">Live data · local warning counts; national watches and reports</p>
                  {summaryFeeds.map((f, i) => (
                    <FeedStatus
                      key={i}
                      feed={f}
                      name={['Local alerts', 'SPC reports', 'APRS', 'Watches', 'Local storm reports'][i]}
                    />
                  ))}
                  {summaryFeeds.every((f) => f.status === 'success') && (
                    <DailyStats
                      alerts={liveAlerts}
                      reports={reports.data}
                      watches={watches.data?.watches ?? []}
                      lsrs={lsrs.data?.items ?? []}
                      metars={metars.data?.metars ?? []}
                      aprsStations={aprs.data?.stations ?? []}
                    />
                  )}
                  <FeedPanel feed={hurricanes} name="Hurricanes">
                    {(d) => <HurricanesPanel storms={d.storms} onLocate={flyTo} />}
                  </FeedPanel>
                  <FeedPanel feed={watches} name="Watches">
                    {(d) => <WatchesPanel watches={d.watches} onLocate={flyTo} />}
                  </FeedPanel>
                  <FeedPanel feed={mesoscales} name="Discussions">
                    {(d) => <MesoscaleDiscussions items={d.items} onLocate={flyTo} />}
                  </FeedPanel>
                  <FeedPanel feed={lsrs} name="Storm reports">
                    {(d) => (
                      <LsrPanel items={d.items} byCategory={d.by_category} hours={2} onLocate={flyTo} />
                    )}
                  </FeedPanel>
                  <FeedPanel feed={reports} name="SPC reports">
                    {(d) => <StormReports reports={d} onLocate={flyTo} />}
                  </FeedPanel>
                </Suspense>
              )}
              <ToolSection
                key={`analysis:${operations}`}
                title="Severe weather & forecast models"
                defaultOpen={operations}
              >
                <SpcOutlook />
                <HrrrLoopPanel />
                <Mesoanalysis />
                <WpcPanel />
                <TropicalOutlookPanel />
              </ToolSection>
              <ToolSection title="Satellite & lightning">
                <Satellite />
                <LightningPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
              </ToolSection>
              <ToolSection title="Forecast discussion & AI briefing">
                <NwsTextPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
                <BriefingPanel scope={alertScope} radius={alertRadius} />
              </ToolSection>
              <ToolSection title="Aviation">
                <AviationPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} onLocate={flyTo} />
              </ToolSection>
              <ToolSection title="Rivers & marine">
                <RiverGauges state={config.data?.state} onLocate={flyTo} />
                <MarinePanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} onLocate={flyTo} />
              </ToolSection>
              <ToolSection title="Cameras & live streams">
                <PinnedLiveBar />
                <CameraPanel lat={homeCenter[0]} lon={homeCenter[1]} label={config.data?.location} />
              </ToolSection>
              <ToolSection title="Warning verification">
                <VerificationPanel />
              </ToolSection>
              {config.data?.hasAirnowKey && (
                <ToolSection title="Air quality">
                  <AqiPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
                </ToolSection>
              )}
              {layers.fires && (
                <FeedPanel feed={fires} name="Wildfires">
                  {(d) => (
                    <Suspense fallback={null}>
                      <WildfiresPanel fires={d.fires} onLocate={flyTo} />
                    </Suspense>
                  )}
                </FeedPanel>
              )}
              {layers.quakes && (
                <FeedPanel feed={quakes} name="Earthquakes">
                  {(d) => (
                    <Suspense fallback={null}>
                      <QuakesPanel quakes={d.quakes} onLocate={flyTo} />
                    </Suspense>
                  )}
                </FeedPanel>
              )}
              {layers.spotters && (
                <FeedPanel feed={spotters} name="Spotters">
                  {(d) => (
                    <Suspense fallback={null}>
                      <SpottersPanel spotters={d.spotters} onLocate={flyTo} />
                    </Suspense>
                  )}
                </FeedPanel>
              )}
            </section>
          </aside>
        )}
      </main>
      {!embedded && (
        <StatusFooter
          alarmEnabled={alarm.enabled}
          onAlarmToggle={alarm.setEnabled}
          onTestAlarm={alarm.testTone}
          alarmRepeating={alarm.repeating}
          alarmSilenced={alarm.silenced}
          onSilenceAlarm={alarm.silence}
          webhookConfigured={config.data?.hasWebhook}
          tvMode={tvMode}
          onTvModeToggle={setTvMode}
          apiVersion={config.data?.apiVersion}
          apiBuiltAt={config.data?.apiBuiltAt}
        />
      )}
      <Suspense fallback={<p role="status">Loading controls…</p>}>
        {layersOpen && (
          <LayersDrawer
            options={options}
            replay={replay}
            onClose={() => setLayersOpen(false)}
            presets={
              <MapPresets
                current={{ layers, basemap, nexradOn, nexradSite, nexradProduct, nexradCoords }}
                onApply={applyPreset}
                replay={replay}
              />
            }
          >
            <label className="layer-option">
              Basemap
              <select
                aria-label="Basemap"
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as typeof basemap)}
              >
                <option value="dark">Dark</option>
                <option value="street">Street</option>
                <option value="satellite">Satellite</option>
              </select>
            </label>
            <p className="notice">
              MRMS, lightning, precipitation type, storm probability, and SPC outlook are available in Radar
              view. Basemaps apply to both maps.
            </p>
            <NexradPicker
              enabled={nexradOn}
              setEnabled={setNexradOn}
              site={nexradSite}
              setSite={setNexradSite}
              product={nexradProduct}
              setProduct={setNexradProduct}
              homeLat={homeCenter[0]}
              homeLon={homeCenter[1]}
              onSitePicked={(lat, lon) => {
                setNexradCoords({ lat, lon })
                if (nexradOn) flyTo(lat, lon, 8)
              }}
            />
          </LayersDrawer>
        )}
        {drawer && (
          <AlertsDrawer
            title={drawer.archived ? 'Archived national alerts' : `${scopeLabel} alerts`}
            alerts={drawer.archived ? drawer.alerts : liveAlerts}
            focusAlertId={drawer.id}
            onLocate={flyTo}
            onClose={() => setDrawer(null)}
          />
        )}
      </Suspense>
    </div>
  )
}
