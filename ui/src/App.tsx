import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWindowWidth } from './hooks/useWindowWidth'
import { useEmergencyAlarm } from './hooks/useEmergencyAlarm'
import type { Map as LeafletMap } from 'leaflet'
import type {
  AppConfig, AprsStation, CurrentConditions, DailyPeriod, HourlyPeriod,
  HurricaneStorm, LocalStormReport, LsrCategory, MesoscaleDiscussion,
  MetarStation, NWSAlertsResponse, PrioritizeResponse, Quake, SpcWatch,
  Spotter, StormCell, StormReports, TimeMachineSnapshot, Wildfire,
} from './types'
import {
  fetchActiveStorms, fetchAlerts, fetchAprsStations, fetchConfig, fetchCurrent,
  fetchForecast, fetchLsrs, fetchMesoscale, fetchMetarMesh, fetchQuakes,
  fetchSpcWatches, fetchSpotters, fetchStormCells, fetchStormReports,
  fetchTimeMachineAt, fetchWildfires, postPrioritize,
} from './api'
import WeatherHeader from './components/WeatherHeader'
import AlertBanner from './components/AlertBanner'
import EmergencyBanner from './components/EmergencyBanner'
import AlertsDrawer from './components/AlertsDrawer'
import RadarMap from './components/RadarMap'
import AlertsMap from './components/AlertsMap'
import CurrentConditionsPanel from './components/CurrentConditions'
import Forecast from './components/Forecast'
import AlertPanel from './components/AlertPanel'
import HourlyChart from './components/HourlyChart'
import SpcOutlook from './components/SpcOutlook'
import StormReportsPanel from './components/StormReports'
import Satellite from './components/Satellite'
import RiverGauges from './components/RiverGauges'
import CameraPanel from './components/CameraPanel'
import PinnedLiveBar from './components/PinnedLiveBar'
import Mesoanalysis from './components/Mesoanalysis'
import HurricanesPanel from './components/HurricanesPanel'
import WatchesPanel from './components/WatchesPanel'
import MesoscaleDiscussionsPanel from './components/MesoscaleDiscussions'
import StatusFooter from './components/StatusFooter'
import LsrPanel from './components/LsrPanel'
import NexradPicker from './components/NexradPicker'
import WpcPanel from './components/WpcPanel'
import NwsTextPanel from './components/NwsTextPanel'
import TropicalOutlookPanel from './components/TropicalOutlookPanel'
import AqiPanel from './components/AqiPanel'
import HrrrLoopPanel from './components/HrrrLoopPanel'
import DailyStatsPanel from './components/DailyStatsPanel'
import BriefingPanel from './components/BriefingPanel'
import TimeMachineBar from './components/TimeMachineBar'
import LightningPanel from './components/LightningPanel'
import WildfiresPanel from './components/WildfiresPanel'
import QuakesPanel from './components/QuakesPanel'
import SpottersPanel from './components/SpottersPanel'
import AviationPanel from './components/AviationPanel'
import MarinePanel from './components/MarinePanel'
import VerificationPanel from './components/VerificationPanel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

type MapView = 'radar' | 'alerts'

export default function App() {
  const radarMapRef = useRef<LeafletMap | null>(null)
  const alertsMapRef = useRef<LeafletMap | null>(null)
  const [mapView, setMapView] = useState<MapView>('radar')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [current, setCurrent] = useState<CurrentConditions | null>(null)
  const [alerts, setAlerts] = useState<NWSAlertsResponse | null>(null)
  const [forecast, setForecast] = useState<{ hourly: HourlyPeriod[]; daily: DailyPeriod[] } | null>(null)
  const [reports, setReports] = useState<StormReports | null>(null)
  const [aprsStations, setAprsStations] = useState<AprsStation[]>([])
  const [hurricanes, setHurricanes] = useState<HurricaneStorm[]>([])
  const [watches, setWatches] = useState<SpcWatch[]>([])
  const [mesoscales, setMesoscales] = useState<MesoscaleDiscussion[]>([])
  const [metars, setMetars] = useState<MetarStation[]>([])
  const [showMetars, setShowMetars] = useState(false)
  const [lsrs, setLsrs] = useState<LocalStormReport[]>([])
  const [lsrByCat, setLsrByCat] = useState<Record<LsrCategory, number> | undefined>()
  const [nexradOn, setNexradOn] = useState(false)
  const [nexradSite, setNexradSite] = useState('')
  const [nexradCoords, setNexradCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [nexradProduct, setNexradProduct] = useState('N0Q')
  const [nexradTick, setNexradTick] = useState(() => Date.now())
  const [tvMode, setTvMode] = useState<boolean>(() => {
    try { return localStorage.getItem('wx-tv-mode') === '1' } catch { return false }
  })
  const [showRangeRings, setShowRangeRings] = useState<boolean>(() => {
    try { return localStorage.getItem('wx-range-rings') !== '0' } catch { return true }
  })
  const [cells, setCells] = useState<StormCell[]>([])
  const [showCells, setShowCells] = useState(false)
  const [fires, setFires] = useState<Wildfire[]>([])
  const [showFires, setShowFires] = useState(false)
  const [quakes, setQuakes] = useState<Quake[]>([])
  const [showQuakes, setShowQuakes] = useState(false)
  const [spotters, setSpotters] = useState<Spotter[]>([])
  const [showSpotters, setShowSpotters] = useState(false)
  const [showMrms, setShowMrms] = useState<boolean>(() => {
    try { return localStorage.getItem('wx-mrms') === '1' } catch { return false }
  })
  const [showGlm, setShowGlm] = useState<boolean>(() => {
    try { return localStorage.getItem('wx-glm') === '1' } catch { return false }
  })
  const [showPType, setShowPType] = useState<boolean>(() => {
    try { return localStorage.getItem('wx-ptype') === '1' } catch { return false }
  })
  const [showProbSevere, setShowProbSevere] = useState<boolean>(() => {
    try { return localStorage.getItem('wx-probsevere') === '1' } catch { return false }
  })
  // Time machine: when non-null, freeze alerts/LSRs to a historical snapshot
  const [timeMachineTs, setTimeMachineTs] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<TimeMachineSnapshot | null>(null)
  // Smart alert prioritization (Ollama-driven ordering)
  const [priority, setPriority] = useState<PrioritizeResponse | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [focusAlertId, setFocusAlertId] = useState<string | undefined>()
  const [alertsMapMounted, setAlertsMapMounted] = useState(false)
  const isMobile = useWindowWidth() < 768

  const openDrawer = (alertId?: string) => {
    setFocusAlertId(alertId)
    setAlertsOpen(true)
  }
  const closeDrawer = () => {
    setAlertsOpen(false)
    setFocusAlertId(undefined)
  }

  // flyTo targets whichever map is currently visible
  const flyTo = useCallback((lat: number, lon: number, zoom = 9) => {
    const ref = mapView === 'alerts' ? alertsMapRef : radarMapRef
    ref.current?.flyTo([lat, lon], zoom, { duration: 1.2 })
  }, [mapView])

  useEffect(() => {
    const ac = new AbortController()
    fetchConfig(ac.signal).then(setConfig).catch(() => {})
    return () => ac.abort()
  }, [])

  // Tracks whether the latest in-flight refresh is still relevant.
  // Bumped when component unmounts or a newer refresh starts.
  const refreshGen = useRef(0)

  const refresh = useCallback(async () => {
    const myGen = ++refreshGen.current
    try {
      const [cur, al, fcst, rpt, aprs, nhc, ww, md, lsr] = await Promise.allSettled([
        fetchCurrent(),
        fetchAlerts(),
        fetchForecast(),
        fetchStormReports(),
        fetchAprsStations(),
        fetchActiveStorms(),
        fetchSpcWatches(),
        fetchMesoscale(),
        fetchLsrs(2),
      ])
      // Discard if we've been superseded by a newer call (or unmounted)
      if (refreshGen.current !== myGen) return
      if (cur.status === 'fulfilled') setCurrent(cur.value)
      if (al.status === 'fulfilled') setAlerts(al.value)
      if (fcst.status === 'fulfilled') {
        setForecast(fcst.value as { hourly: HourlyPeriod[]; daily: DailyPeriod[] })
      }
      if (rpt.status === 'fulfilled') setReports(rpt.value)
      if (aprs.status === 'fulfilled') setAprsStations(aprs.value.stations)
      if (nhc.status === 'fulfilled') setHurricanes(nhc.value.storms)
      if (ww.status === 'fulfilled') setWatches(ww.value.watches)
      if (md.status === 'fulfilled') setMesoscales(md.value.items)
      if (lsr.status === 'fulfilled') {
        setLsrs(lsr.value.items)
        setLsrByCat(lsr.value.by_category)
      }
      setLastUpdate(new Date())
    } catch (_) {
      /* tolerate */
    }
  }, [])

  // Cancel pending state writes if component unmounts
  useEffect(() => () => { refreshGen.current = -1 }, [])

  // NEXRAD tile cache-bust every 2 minutes when the layer is active
  useEffect(() => {
    if (!nexradOn) return
    const t = setInterval(() => setNexradTick(Date.now()), 2 * 60_000)
    return () => clearInterval(t)
  }, [nexradOn])


  // Storm cells (radar attribute) — only when toggled, refresh 2 min
  useEffect(() => {
    if (!showCells) return
    let cancelled = false
    const tick = () => fetchStormCells()
      .then((d) => { if (!cancelled) setCells(d.cells) })
      .catch(() => {})
    tick()
    const t = setInterval(tick, 2 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [showCells])

  // Wildfires — refresh 30 min when toggled
  useEffect(() => {
    if (!showFires) return
    let cancelled = false
    const tick = () => fetchWildfires()
      .then((d) => { if (!cancelled) setFires(d.fires) })
      .catch(() => {})
    tick()
    const t = setInterval(tick, 30 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [showFires])

  // Earthquakes — refresh 2 min when toggled
  useEffect(() => {
    if (!showQuakes) return
    let cancelled = false
    const tick = () => fetchQuakes('1d')
      .then((d) => { if (!cancelled) setQuakes(d.quakes) })
      .catch(() => {})
    tick()
    const t = setInterval(tick, 2 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [showQuakes])

  // Spotter Network — refresh 2 min when toggled
  useEffect(() => {
    if (!showSpotters) return
    let cancelled = false
    const tick = () => fetchSpotters()
      .then((d) => { if (!cancelled) setSpotters(d.spotters) })
      .catch(() => {})
    tick()
    const t = setInterval(tick, 2 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [showSpotters])

  // Time machine snapshot loader
  useEffect(() => {
    if (timeMachineTs === null) {
      setSnapshot(null)
      return
    }
    let cancelled = false
    fetchTimeMachineAt(timeMachineTs)
      .then((s) => { if (!cancelled) setSnapshot(s) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [timeMachineTs])

  // METAR mesh refreshes on its own (slower cadence, only when toggled)
  useEffect(() => {
    if (!showMetars || !config) return
    let cancelled = false
    const tick = async () => {
      try {
        const m = await fetchMetarMesh({
          lat: config.lat,
          lon: config.lon,
          radius_km: 350,
          limit: 120,
        })
        if (!cancelled) setMetars(m.metars)
      } catch { /* tolerate */ }
    }
    tick()
    const t = setInterval(tick, 5 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [showMetars, config])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [refresh])

  // Effective alerts: live by default, or snapshot when time-machine engaged
  const liveAlerts = useMemo(() => alerts?.features ?? [], [alerts])
  const rawActiveAlerts = useMemo(() => {
    if (snapshot && timeMachineTs !== null) {
      return (snapshot.alerts?.features ?? []) as typeof liveAlerts
    }
    return liveAlerts
  }, [liveAlerts, snapshot, timeMachineTs])

  // Sort alerts using the AI-derived priority order (when available)
  const activeAlerts = useMemo(() => {
    if (!priority?.order?.length) return rawActiveAlerts
    const idx: Record<string, number> = {}
    priority.order.forEach((id, i) => { idx[id] = i })
    const fallback = priority.order.length
    return [...rawActiveAlerts].sort((a, b) => {
      const ai = idx[a.properties?.id || a.id] ?? fallback
      const bi = idx[b.properties?.id || b.id] ?? fallback
      return ai - bi
    })
  }, [rawActiveAlerts, priority])

  // Smart prioritization: re-rank when the alert ID set changes. Debounced
  // by setTimeout to avoid hammering Ollama during rapid alert-list churn.
  const alertIdsKey = useMemo(
    () => rawActiveAlerts.map((a) => a.properties?.id || a.id).sort().join(','),
    [rawActiveAlerts],
  )
  useEffect(() => {
    if (rawActiveAlerts.length === 0) {
      setPriority(null)
      return
    }
    const handle = setTimeout(() => {
      const items = rawActiveAlerts.map((a) => ({
        id: a.properties?.id || a.id,
        event: a.properties?.event,
        severity: a.properties?.severity,
        headline: a.properties?.headline,
        areaDesc: a.properties?.areaDesc,
        expires: a.properties?.expires,
      }))
      postPrioritize(items)
        .then(setPriority)
        .catch(() => { /* tolerate; we'll just use default ordering */ })
    }, 1500)
    return () => clearTimeout(handle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertIdsKey])

  const effectiveLsrs = useMemo(() => {
    if (snapshot && timeMachineTs !== null) {
      const feats = (snapshot.lsrs?.features ?? []) as Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }>
      return feats.flatMap((f): LocalStormReport[] => {
        const p = f.properties || {}
        const c = (f.geometry?.coordinates) || [null, null]
        if (c[0] == null || c[1] == null) return []
        return [{
          valid: (p.valid as string | null) ?? null,
          type: ((p.type as string) || '').toUpperCase(),
          category: 'other' as LsrCategory,
          magnitude: (p.magnitude as string | null) ?? null,
          city: (p.city as string | null) ?? null,
          county: (p.county as string | null) ?? null,
          state: ((p.st as string) || (p.state as string) || null),
          wfo: (p.wfo as string | null) ?? null,
          source: (p.source as string | null) ?? null,
          remark: (p.remark as string | null) ?? null,
          lat: c[1] as number,
          lon: c[0] as number,
        }]
      })
    }
    return lsrs
  }, [lsrs, snapshot, timeMachineTs])

  const extremeAlerts = useMemo(
    () => activeAlerts.filter(
      (a) => a.properties.severity === 'Extreme' || a.properties.severity === 'Severe',
    ),
    [activeAlerts],
  )
  const homeCenter: [number, number] = [config?.lat ?? 39.5, config?.lon ?? -98.5]

  // Audio alarm + browser notification for new tornado warnings & emergencies
  const alarm = useEmergencyAlarm(activeAlerts)

  // TV / kiosk mode — persist + apply body class so Leaflet et al re-flow
  const tvSet = useCallback((b: boolean) => {
    setTvMode(b)
    try { localStorage.setItem('wx-tv-mode', b ? '1' : '0') } catch { /* */ }
  }, [])
  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode)
    return () => document.body.classList.remove('tv-mode')
  }, [tvMode])

  // ESC exits TV mode
  useEffect(() => {
    if (!tvMode) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') tvSet(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tvMode, tvSet])

  // Persist range-rings preference
  useEffect(() => {
    try { localStorage.setItem('wx-range-rings', showRangeRings ? '1' : '0') } catch { /* */ }
  }, [showRangeRings])

  // Persist MRMS / ProbSevere overlays
  useEffect(() => {
    try { localStorage.setItem('wx-mrms', showMrms ? '1' : '0') } catch { /* */ }
  }, [showMrms])
  useEffect(() => {
    try { localStorage.setItem('wx-glm', showGlm ? '1' : '0') } catch { /* */ }
  }, [showGlm])
  useEffect(() => {
    try { localStorage.setItem('wx-ptype', showPType ? '1' : '0') } catch { /* */ }
  }, [showPType])
  useEffect(() => {
    try { localStorage.setItem('wx-probsevere', showProbSevere ? '1' : '0') } catch { /* */ }
  }, [showProbSevere])

  // Keyboard shortcuts (skipped when typing in inputs)
  useKeyboardShortcuts({
    'r': () => setMapView('radar'),
    'a': () => setMapView('alerts'),
    'm': () => setShowMetars((v) => !v),
    'n': () => setNexradOn((v) => !v),
    't': () => tvSet(!tvMode),
    'g': () => setShowRangeRings((v) => !v),
    'c': () => setShowCells((v) => !v),
    'f': () => setShowFires((v) => !v),
    'q': () => setShowQuakes((v) => !v),
    's': () => setShowSpotters((v) => !v),
    '?': () => openDrawer(),
    '/': () => openDrawer(),
  })

  // Shared map tab bar + map views used in both layouts
  const mapTabBar = (
    <div style={{ display: 'flex', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-bright)', flexShrink: 0, zIndex: 10 }}>
      {([
        { key: 'radar',  label: '🌧 Radar' },
        { key: 'alerts', label: `⚠ Alerts${activeAlerts.length ? ` (${activeAlerts.length})` : ''}` },
      ] as { key: MapView; label: string }[]).map(({ key, label }) => (
        <button
          key={key}
          onClick={() => { setMapView(key); if (key === 'alerts') setAlertsMapMounted(true) }}
          style={{
            padding: isMobile ? '6px 14px' : '7px 18px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            background: mapView === key ? 'var(--bg-card)' : 'transparent',
            color: mapView === key ? 'var(--accent-cyan)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: mapView === key ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'color 0.15s, background 0.15s',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const mapViews = (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <div style={{ position: 'absolute', inset: 0, display: mapView === 'radar' ? 'block' : 'none' }}>
        <RadarMap
          mapRef={radarMapRef} alerts={alerts} reports={reports} center={homeCenter}
          aprsStations={aprsStations}
          hurricanes={hurricanes} watches={watches} mesoscales={mesoscales}
          metars={metars} showMetars={showMetars}
          lsrs={effectiveLsrs}
          cells={cells} showCells={showCells}
          fires={fires} showFires={showFires}
          quakes={quakes} showQuakes={showQuakes}
          spotters={spotters} showSpotters={showSpotters}
          forceTimestamp={timeMachineTs}
          nexrad={nexradOn ? { site: nexradSite, product: nexradProduct, refreshKey: nexradTick, lat: nexradCoords?.lat, lon: nexradCoords?.lon } : null}
          showMrms={showMrms}
          showGlm={showGlm}
          showPType={showPType}
          showProbSevere={showProbSevere}
          showRangeRings={showRangeRings}
        />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: mapView === 'alerts' ? 'block' : 'none' }}>
        {alertsMapMounted && (
          <AlertsMap
            mapRef={alertsMapRef} alerts={alerts} reports={reports}
            homeCenter={homeCenter} aprsStations={aprsStations}
            hurricanes={hurricanes} watches={watches} mesoscales={mesoscales}
            metars={metars} showMetars={showMetars}
            lsrs={effectiveLsrs}
            cells={cells} showCells={showCells}
            fires={fires} showFires={showFires}
            quakes={quakes} showQuakes={showQuakes}
            spotters={spotters} showSpotters={showSpotters}
            nexrad={nexradOn ? { site: nexradSite, product: nexradProduct, refreshKey: nexradTick, lat: nexradCoords?.lat, lon: nexradCoords?.lon } : null}
            showRangeRings={showRangeRings}
          />
        )}
      </div>

      {/* Map-overlay controls (top-right stack) */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <NexradPicker
          enabled={nexradOn} setEnabled={setNexradOn}
          site={nexradSite} setSite={setNexradSite}
          product={nexradProduct} setProduct={setNexradProduct}
          homeLat={homeCenter[0]} homeLon={homeCenter[1]}
          onSitePicked={(lat, lon) => { setNexradCoords({ lat, lon }); flyTo(lat, lon, 8) }}
        />
        <button
          onClick={() => setShowMetars((v) => !v)}
          aria-pressed={showMetars}
          aria-label={showMetars ? 'Hide METAR surface observations' : 'Show METAR surface observations'}
          style={{
            background: showMetars ? 'var(--accent-cyan)' : 'rgba(6,11,20,0.85)',
            color: showMetars ? '#000' : 'var(--accent-cyan)',
            border: '1px solid var(--border-bright)',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title={showMetars ? 'Hide METAR surface obs' : 'Show METAR surface obs (station model). Press M.'}
        >
          🌡 METAR {metars.length > 0 ? `(${metars.length})` : ''}
        </button>
        <button
          onClick={() => setShowCells((v) => !v)}
          aria-pressed={showCells}
          aria-label="Toggle NEXRAD storm cells"
          style={{
            background: showCells ? '#ef4444' : 'rgba(6,11,20,0.85)',
            color: showCells ? '#fff' : '#fca5a5',
            border: '1px solid #ef444477',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="NEXRAD storm cells (press C). Shows TVS / MESO / motion vectors."
        >
          ⛈ CELLS {showCells && cells.length > 0 ? `(${cells.length})` : ''}
        </button>
        <button
          onClick={() => setShowMrms((v) => !v)}
          aria-pressed={showMrms}
          aria-label="Toggle MRMS composite reflectivity overlay"
          style={{
            background: showMrms ? '#22d3ee' : 'rgba(6,11,20,0.85)',
            color: showMrms ? '#000' : '#67e8f9',
            border: '1px solid #22d3ee77',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="MRMS composite reflectivity (CONUS-wide, NWS operational mosaic)."
        >
          🌐 MRMS
        </button>
        <button
          onClick={() => setShowProbSevere((v) => !v)}
          aria-pressed={showProbSevere}
          aria-label="Toggle ProbSevere ML hazard probability overlay"
          style={{
            background: showProbSevere ? '#ec4899' : 'rgba(6,11,20,0.85)',
            color: showProbSevere ? '#fff' : '#f9a8d4',
            border: '1px solid #ec489977',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="ProbSevere v3 + ProbTor — CIMSS/NOAA ML hazard probabilities per convective object."
        >
          🧠 PROBSEVERE
        </button>
        <button
          onClick={() => setShowGlm((v) => !v)}
          aria-pressed={showGlm}
          aria-label="Toggle GOES-East GLM lightning overlay"
          style={{
            background: showGlm ? '#fde047' : 'rgba(6,11,20,0.85)',
            color: showGlm ? '#000' : '#fef08a',
            border: '1px solid #fde04777',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="GOES-East GLM — geostationary lightning flash extent density (in-cloud + CG)."
        >
          ⚡ GLM
        </button>
        <button
          onClick={() => setShowPType((v) => !v)}
          aria-pressed={showPType}
          aria-label="Toggle MRMS surface precipitation type overlay"
          style={{
            background: showPType ? '#a78bfa' : 'rgba(6,11,20,0.85)',
            color: showPType ? '#000' : '#ddd6fe',
            border: '1px solid #a78bfa77',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="MRMS surface precipitation type — rain / snow / mix / freezing rain."
        >
          ❄ PTYPE
        </button>
        <button
          onClick={() => setShowFires((v) => !v)}
          aria-pressed={showFires}
          aria-label="Toggle active wildfires overlay"
          style={{
            background: showFires ? '#dc2626' : 'rgba(6,11,20,0.85)',
            color: showFires ? '#fff' : '#fca5a5',
            border: '1px solid #dc262677',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="Active wildfires (NIFC). Press F."
        >
          🔥 FIRE {showFires && fires.length > 0 ? `(${fires.length})` : ''}
        </button>
        <button
          onClick={() => setShowQuakes((v) => !v)}
          aria-pressed={showQuakes}
          aria-label="Toggle earthquakes overlay"
          style={{
            background: showQuakes ? '#f97316' : 'rgba(6,11,20,0.85)',
            color: showQuakes ? '#000' : '#fed7aa',
            border: '1px solid #f9731677',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="Earthquakes (USGS, last 24h, M2.5+). Press Q."
        >
          🌍 EQ {showQuakes && quakes.length > 0 ? `(${quakes.length})` : ''}
        </button>
        <button
          onClick={() => setShowSpotters((v) => !v)}
          aria-pressed={showSpotters}
          aria-label="Toggle Spotter Network active positions"
          style={{
            background: showSpotters ? '#22d3ee' : 'rgba(6,11,20,0.85)',
            color: showSpotters ? '#000' : '#a5f3fc',
            border: '1px solid #22d3ee77',
            borderRadius: 4, padding: '4px 8px', fontSize: 10,
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
          title="Spotter Network active positions. Press S."
        >
          📡 SPOTTERS {showSpotters && spotters.length > 0 ? `(${spotters.length})` : ''}
        </button>
      </div>
    </div>
  )

  const drawer = alertsOpen && (
    <AlertsDrawer
      alerts={activeAlerts}
      onLocate={flyTo}
      onClose={closeDrawer}
      focusAlertId={focusAlertId}
    />
  )

  // Tiny inline indicator that explains alert ordering when AI ranking is on
  const priorityBadge = priority?.source === 'ollama' && priority.order.length > 0 && (
    <div
      title={priority.reasoning || 'AI-ranked by operational urgency'}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 9, color: 'var(--accent-cyan)',
        padding: '2px 6px', borderRadius: 3,
        background: 'rgba(34,211,238,0.08)',
        border: '1px solid rgba(34,211,238,0.3)',
        cursor: 'help',
      }}
    >
      🤖 AI-ranked
      {priority.reasoning && (
        <span style={{ color: 'var(--text-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          · {priority.reasoning}
        </span>
      )}
    </div>
  )

  // ── TV / kiosk layout ─────────────────────────────────────────
  // Just the map + emergency banner + status footer. Optimized for a
  // wall-mounted TV during severe weather coverage.
  if (tvMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#000' }}>
        <EmergencyBanner alerts={activeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />

        {extremeAlerts.length > 0 && (
          <AlertBanner alerts={extremeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />
        )}

        <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {mapViews}

          {/* Big location + alert count overlay (top-left) */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 1100,
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid var(--border-bright)',
              borderRadius: 6,
              padding: '8px 14px',
              backdropFilter: 'blur(4px)',
              color: '#fff',
              fontFamily: 'system-ui,sans-serif',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>{config?.location ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {activeAlerts.length > 0 ? `${activeAlerts.length} active alert${activeAlerts.length !== 1 ? 's' : ''}` : 'no active alerts'}
              {' · '}
              <span style={{ fontFamily: 'var(--font-mono)' }}>{lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          </div>
        </div>

        <StatusFooter
          alarmEnabled={alarm.enabled} onAlarmToggle={alarm.setEnabled} onTestAlarm={alarm.testTone}
          alarmRepeating={alarm.repeating} alarmSilenced={alarm.silenced} onSilenceAlarm={alarm.silence}
          webhookConfigured={config?.hasWebhook}
          tvMode={tvMode} onTvModeToggle={tvSet}
          apiVersion={config?.apiVersion} apiBuiltAt={config?.apiBuiltAt}
        />

        {drawer}
      </div>
    )
  }

  // ── Embed mode (for media partners / iframe) ───────────────────
  // Triggered by ?embed=radar | ?embed=alerts. Returns a chrome-free map
  // with only the alert banner pinned (so a tornado warning is impossible
  // to miss in an embed). All controls hidden; data still refreshes.
  const embedParam = (() => {
    try { return new URLSearchParams(window.location.search).get('embed') } catch { return null }
  })()
  if (embedParam === 'radar' || embedParam === 'alerts') {
    if (mapView !== embedParam) setMapView(embedParam as MapView)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
        <EmergencyBanner alerts={activeAlerts} onLocate={flyTo} onOpenDrawer={() => {}} />
        {extremeAlerts.length > 0 && (
          <AlertBanner alerts={extremeAlerts} onLocate={flyTo} onOpenDrawer={() => {}} />
        )}
        {mapViews}
        <div style={{
          position: 'absolute', bottom: 4, right: 6, zIndex: 1200,
          fontSize: 9, color: 'var(--text-muted)', background: 'rgba(6,11,20,0.7)',
          padding: '2px 6px', borderRadius: 3, pointerEvents: 'none',
        }}>
          weather-dashboard — unofficial · NWS data
        </div>
      </div>
    )
  }

  // ── Mobile layout ──────────────────────────────────────────────
  if (isMobile) {

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg-base)', overflowX: 'hidden' }}>
        <WeatherHeader
          location={config?.location ?? '—'}
          lastUpdate={lastUpdate}
          alertCount={activeAlerts.length}
          onAlertsClick={() => openDrawer()}
          compact
        />

        <EmergencyBanner alerts={activeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />

        {extremeAlerts.length > 0 && (
          <AlertBanner alerts={extremeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />
        )}
        <PinnedLiveBar />
        <TimeMachineBar ts={timeMachineTs} onChange={setTimeMachineTs} hours={6} />

        {/* Map — fixed height */}
        <div style={{ height: '45vh', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {mapTabBar}
          {mapViews}
        </div>

        {/* All panels — single continuous scroll */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
          <BriefingPanel />
          <DailyStatsPanel
            alerts={activeAlerts} watches={watches} reports={reports}
            lsrs={effectiveLsrs} metars={metars} aprsStations={aprsStations}
          />
          <CurrentConditionsPanel data={current} />
          {config?.hasAirnowKey && (
            <AqiPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
          )}
          <LightningPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
          {priorityBadge}
          <AlertPanel alerts={activeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />
          {hurricanes.length > 0 && <HurricanesPanel storms={hurricanes} onLocate={flyTo} />}
          <TropicalOutlookPanel />
          {watches.length > 0 && <WatchesPanel watches={watches} onLocate={flyTo} />}
          {mesoscales.length > 0 && <MesoscaleDiscussionsPanel items={mesoscales} onLocate={flyTo} />}
          {effectiveLsrs.length > 0 && <LsrPanel items={effectiveLsrs} byCategory={lsrByCat} hours={2} onLocate={flyTo} />}
          {showFires && fires.length > 0 && <WildfiresPanel fires={fires} onLocate={flyTo} />}
          {showQuakes && quakes.length > 0 && <QuakesPanel quakes={quakes} onLocate={flyTo} />}
          {showSpotters && spotters.length > 0 && <SpottersPanel spotters={spotters} onLocate={flyTo} />}
          <AviationPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} onLocate={flyTo} />
          <MarinePanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} onLocate={flyTo} />
          <VerificationPanel />
          <NwsTextPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
          <Forecast daily={forecast?.daily ?? []} />
          <HourlyChart hourly={forecast?.hourly ?? []} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Satellite />
            <SpcOutlook />
          </div>
          <HrrrLoopPanel />
          <Mesoanalysis />
          <WpcPanel />
          <StormReportsPanel reports={reports} onLocate={flyTo} />
          <RiverGauges state={config?.state} onLocate={flyTo} />
          <CameraPanel lat={homeCenter[0]} lon={homeCenter[1]} label={config?.location} />
        </div>

        <StatusFooter
          alarmEnabled={alarm.enabled} onAlarmToggle={alarm.setEnabled} onTestAlarm={alarm.testTone}
          alarmRepeating={alarm.repeating} alarmSilenced={alarm.silenced} onSilenceAlarm={alarm.silence}
          webhookConfigured={config?.hasWebhook}
          tvMode={tvMode} onTvModeToggle={tvSet}
          apiVersion={config?.apiVersion} apiBuiltAt={config?.apiBuiltAt}
        />

        {drawer}
      </div>
    )
  }

  // ── Desktop layout ─────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <WeatherHeader
        location={config?.location ?? '—'}
        lastUpdate={lastUpdate}
        alertCount={activeAlerts.length}
        onAlertsClick={() => openDrawer()}
      />

      <EmergencyBanner alerts={activeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />

      {extremeAlerts.length > 0 && (
        <AlertBanner alerts={extremeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />
      )}
      <PinnedLiveBar />
      <TimeMachineBar ts={timeMachineTs} onChange={setTimeMachineTs} hours={6} />

      {/* Main content area */}
      <main id="main-content" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Map panel */}
        <div style={{ flex: '1 1 62%', position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {mapTabBar}
          {mapViews}
        </div>

        {/* Right: Info panel */}
        <div
          style={{
            flex: '0 0 38%',
            overflowY: 'auto',
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 8,
          }}
        >
          <BriefingPanel />
          <DailyStatsPanel
            alerts={activeAlerts} watches={watches} reports={reports}
            lsrs={effectiveLsrs} metars={metars} aprsStations={aprsStations}
          />
          <CurrentConditionsPanel data={current} />
          {config?.hasAirnowKey && (
            <AqiPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
          )}
          <LightningPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
          <Forecast daily={forecast?.daily ?? []} />
          {priorityBadge}
          <AlertPanel alerts={activeAlerts} onLocate={flyTo} onOpenDrawer={(id) => openDrawer(id)} />
          {hurricanes.length > 0 && <HurricanesPanel storms={hurricanes} onLocate={flyTo} />}
          <TropicalOutlookPanel />
          {watches.length > 0 && <WatchesPanel watches={watches} onLocate={flyTo} />}
          {mesoscales.length > 0 && <MesoscaleDiscussionsPanel items={mesoscales} onLocate={flyTo} />}
          {effectiveLsrs.length > 0 && <LsrPanel items={effectiveLsrs} byCategory={lsrByCat} hours={2} onLocate={flyTo} />}
          {showFires && fires.length > 0 && <WildfiresPanel fires={fires} onLocate={flyTo} />}
          {showQuakes && quakes.length > 0 && <QuakesPanel quakes={quakes} onLocate={flyTo} />}
          {showSpotters && spotters.length > 0 && <SpottersPanel spotters={spotters} onLocate={flyTo} />}
          <AviationPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} onLocate={flyTo} />
          <MarinePanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} onLocate={flyTo} />
          <VerificationPanel />
          <NwsTextPanel homeLat={homeCenter[0]} homeLon={homeCenter[1]} />
        </div>
      </main>

      {/* Bottom row */}
      <div
        style={{
          background: 'var(--bg-panel)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 8,
          maxHeight: '42vh',
          overflowY: 'auto',
        }}
      >
        <HourlyChart hourly={forecast?.hourly ?? []} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          <SpcOutlook />
          <HrrrLoopPanel />
          <Mesoanalysis />
          <WpcPanel />
          <StormReportsPanel reports={reports} onLocate={flyTo} />
          <Satellite />
        </div>
        <RiverGauges state={config?.state} onLocate={flyTo} />
        <CameraPanel lat={homeCenter[0]} lon={homeCenter[1]} label={config?.location} />
      </div>

      <StatusFooter
          alarmEnabled={alarm.enabled} onAlarmToggle={alarm.setEnabled} onTestAlarm={alarm.testTone}
          alarmRepeating={alarm.repeating} alarmSilenced={alarm.silenced} onSilenceAlarm={alarm.silence}
          webhookConfigured={config?.hasWebhook}
          tvMode={tvMode} onTvModeToggle={tvSet}
          apiVersion={config?.apiVersion} apiBuiltAt={config?.apiBuiltAt}
        />

      {drawer}
    </div>
  )
}
