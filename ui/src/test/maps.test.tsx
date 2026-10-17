import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import L from 'leaflet'
import AlertsMap from '../components/AlertsMap'
import type { NWSAlert, NWSAlertsResponse } from '../types'
import fixtures from './fixtures.json'

// jsdom supports SVG elements but omits the legacy feature probe Leaflet uses.
Object.defineProperty(L.Browser, 'svg', { value: true, configurable: true })
const feature = (id: string, lat: number): NWSAlert => ({
  ...(structuredClone(fixtures['/nws/alerts'].features[0]) as NWSAlert),
  id,
  properties: {
    ...fixtures['/nws/alerts'].features[0].properties,
    id,
    event: 'Test Warning',
    headline: `Warning ${id}`,
  },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-84, lat],
        [-83, lat],
        [-83, lat + 1],
        [-84, lat],
      ],
    ],
  },
})
const response = (alerts: NWSAlert[]): NWSAlertsResponse => ({
  type: 'FeatureCollection',
  features: alerts,
  updated: 'now',
})
function polygonLatitudes(map: L.Map | null) {
  const latitudes: number[] = []
  map?.eachLayer((layer) => {
    if (layer instanceof L.Polygon) {
      const points = layer.getLatLngs() as L.LatLng[][]
      latitudes.push(points[0][0].lat)
    }
  })
  return latitudes
}

describe('real Leaflet alert updates', () => {
  it('applies the selected basemap in Alerts view as well as Radar view', async () => {
    const mapRef: { current: L.Map | null } = { current: null }
    const view = render(
      <AlertsMap
        mapRef={mapRef}
        alerts={response([])}
        reports={null}
        homeCenter={[39, -84]}
        basemap="street"
      />,
    )
    const urls = () => {
      const result: string[] = []
      mapRef.current?.eachLayer((layer) => {
        if (layer instanceof L.TileLayer)
          result.push(layer.getTileUrl(Object.assign(L.point(1, 1), { z: 6 })))
      })
      return result
    }
    await waitFor(() => expect(urls().some((url) => url.includes('tile.openstreetmap.org'))).toBe(true))
    view.rerender(
      <AlertsMap
        mapRef={mapRef}
        alerts={response([])}
        reports={null}
        homeCenter={[39, -84]}
        basemap="dark"
      />,
    )
    await waitFor(() => expect(urls().every((url) => url.includes('arcgisonline.com'))).toBe(true))
  })
  it('preserves geographic center when the map container changes size', async () => {
    const observer = globalThis.ResizeObserver
    let resized!: () => void
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    const mapRef: { current: L.Map | null } = { current: null }
    const view = render(
      <AlertsMap mapRef={mapRef} alerts={response([])} reports={null} homeCenter={[39, -84]} />,
    )
    await waitFor(() => expect(mapRef.current).not.toBeNull())
    const center = mapRef.current!.getCenter()
    Object.defineProperty(mapRef.current!.getContainer(), 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(mapRef.current!.getContainer(), 'clientHeight', { value: 600, configurable: true })
    resized()
    expect(mapRef.current!.getCenter().lat).toBeCloseTo(center.lat, 5)
    expect(mapRef.current!.getCenter().lng).toBeCloseTo(center.lng, 5)
    view.unmount()
    vi.stubGlobal('ResizeObserver', observer)
  })
  it('replaces polygons when one alert is replaced without changing the count', async () => {
    const mapRef: { current: L.Map | null } = { current: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    const view = render(
      <AlertsMap
        mapRef={mapRef}
        alerts={response([feature('one', 39)])}
        reports={null}
        homeCenter={[39, -84]}
      />,
    )
    await waitFor(() => expect(polygonLatitudes(mapRef.current)).toContain(39))
    view.rerender(
      <AlertsMap
        mapRef={mapRef}
        alerts={response([feature('two', 41)])}
        reports={null}
        homeCenter={[39, -84]}
      />,
    )
    await waitFor(() => expect(polygonLatitudes(mapRef.current)).toEqual([41]))
    view.rerender(
      <AlertsMap
        mapRef={mapRef}
        alerts={response([feature('two', 42)])}
        reports={null}
        homeCenter={[39, -84]}
      />,
    )
    await waitFor(() => expect(polygonLatitudes(mapRef.current)).toEqual([42]))
  })
  it('refetches changed zone identities at the same alert count and discards obsolete responses', async () => {
    let finishOld!: (response: Response) => void
    const fetcher = vi.fn((url: string) =>
      String(url).includes('OHZ001')
        ? new Promise<Response>((resolve) => {
            finishOld = resolve
          })
        : Promise.resolve(
            new Response(
              JSON.stringify({
                'forecast/OHZ002': {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [-84, 43],
                      [-83, 43],
                      [-83, 44],
                      [-84, 43],
                    ],
                  ],
                },
              }),
            ),
          ),
    )
    vi.stubGlobal('fetch', fetcher)
    const zone = (path: string) => {
      const f = feature(path, 39)
      f.geometry = null
      f.properties.affectedZones = [`https://api.weather.gov/zones/forecast/${path}`]
      return f
    }
    const mapRef: { current: L.Map | null } = { current: null }
    const view = render(
      <AlertsMap mapRef={mapRef} alerts={response([zone('OHZ001')])} reports={null} homeCenter={[39, -84]} />,
    )
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    view.rerender(
      <AlertsMap mapRef={mapRef} alerts={response([zone('OHZ002')])} reports={null} homeCenter={[39, -84]} />,
    )
    await waitFor(() => expect(polygonLatitudes(mapRef.current)).toEqual([43]))
    finishOld(
      new Response(
        JSON.stringify({
          'forecast/OHZ001': {
            type: 'Polygon',
            coordinates: [
              [
                [-84, 10],
                [-83, 10],
                [-83, 11],
                [-84, 10],
              ],
            ],
          },
        }),
      ),
    )
    await waitFor(() => expect(polygonLatitudes(mapRef.current)).toEqual([43]))
  })
})
