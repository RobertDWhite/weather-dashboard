import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { localDate, overnightHours, upcomingHours, isReading } from '../weatherTime'
import { geometryRevision, alertZonePaths } from '../mapData'
import { initialLayers, mapShareUrl, readMapLink } from '../mapWorkflows'
import type { DailyPeriod, HourlyPeriod, NWSAlert } from '../types'
import Forecast from '../components/Forecast'
import NextHours from '../components/NextHours'
import BriefingPanel from '../components/BriefingPanel'
import MapPresets from '../components/MapPresets'
import fixtures from './fixtures.json'

const hour = (time: string, temp = 50): HourlyPeriod => ({
  time,
  temperature: temp,
  dewPoint: 40,
  feelsLike: temp,
  precipProbability: 50,
  precipitation: 0.03,
  weatherCode: 61,
  condition: 'Rain',
  icon: '🌧️',
  windSpeed: 10,
  windDirection: 90,
  windGusts: 25,
  cloudCover: 80,
  visibility: 10000,
})
const day: DailyPeriod = {
  date: '2026-11-01',
  tempMax: 60,
  tempMin: 40,
  feelsMax: 60,
  feelsMin: 40,
  precipSum: 0.2,
  precipProbability: 60,
  windMax: 15,
  windGusts: 25,
  windDir: 90,
  sunrise: '2026-11-01T11:00:00Z',
  sunset: '2026-11-01T23:00:00Z',
  uvIndex: 2,
  weatherCode: 61,
  condition: 'Rain',
  icon: '🌧️',
}

describe('forecast clock and exploration', () => {
  it('does not turn unavailable forecast readings into zero or a dry-weather claim', () => {
    const missing = {
      ...hour('2026-11-01T22:00:00Z'),
      temperature: null,
      precipitation: null,
      precipProbability: null,
      windGusts: null,
    }
    const view = render(
      <NextHours hourly={[missing]} timezone="America/New_York" now={Date.parse('2026-11-01T21:30:00Z')} />,
    )
    expect(screen.getByText(/Temperature unavailable/)).toBeTruthy()
    expect(screen.getByText(/Precipitation data is incomplete/)).toBeTruthy()
    expect(screen.queryByText(/No precipitation indicated/)).toBeNull()
    view.rerender(
      <Forecast
        daily={[{ ...day, precipSum: null }]}
        hourly={[missing]}
        timezone="America/New_York"
        now={Date.parse('2026-11-01T21:30:00Z')}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Today/ }))
    expect(screen.getByText(/Daily precipitation: Unavailable/)).toBeTruthy()
  })
  it('starts at the current hour and keeps distinct hours across the DST fallback', () => {
    const hours = [
      '2026-11-01T04:00:00Z',
      '2026-11-01T05:00:00Z',
      '2026-11-01T06:00:00Z',
      '2026-11-01T07:00:00Z',
    ].map((t) => hour(t))
    expect(upcomingHours(hours, Date.parse('2026-11-01T05:30:00Z')).map((h) => h.time)).toEqual(
      hours.slice(1).map((h) => h.time),
    )
    expect(localDate('2026-11-02T02:00:00Z', 'America/New_York')).toBe('2026-11-01')
  })
  it('calculates the overnight low through the following morning', () => {
    const hours = [
      hour('2026-11-01T22:00:00Z', 49),
      hour('2026-11-02T03:00:00Z', 42),
      hour('2026-11-02T11:00:00Z', 35),
      hour('2026-11-02T15:00:00Z', 55),
    ]
    expect(
      Math.min(
        ...overnightHours(hours, '2026-11-01', 'America/New_York')
          .map((h) => h.temperature)
          .filter(isReading),
      ),
    ).toBe(35)
    render(
      <Forecast
        daily={[day]}
        hourly={hours}
        timezone="America/New_York"
        now={Date.parse('2026-11-01T20:00:00Z')}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Today/ }))
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText(/Overnight low: 35°F/)).toBeTruthy()
    expect(screen.getByText(/0.2.*in/)).toBeTruthy()
    expect(screen.getAllByText(/mph/).length).toBeGreaterThan(0)
  })
  it('summarizes only upcoming conditions and handles empty successful forecasts explicitly', () => {
    const hours = [hour('2026-11-01T12:00:00Z', 90), hour('2026-11-01T22:00:00Z', 45)]
    const view = render(
      <NextHours hourly={hours} timezone="America/New_York" now={Date.parse('2026-11-01T21:30:00Z')} />,
    )
    expect(screen.getByText(/45–45°F/)).toBeTruthy()
    expect(screen.queryByText(/90/)).toBeNull()
    view.rerender(<NextHours hourly={[]} timezone="America/New_York" now={0} />)
    expect(screen.getByText(/No upcoming hourly forecast/)).toBeTruthy()
  })
})

describe('map revisions and reusable views', () => {
  it('changes geometry revision for replacement alerts and changed polygons with the same count', () => {
    const first = structuredClone(fixtures['/nws/alerts'].features) as NWSAlert[]
    const changed = structuredClone(first)
    changed[0].properties.headline = 'Updated warning'
    expect(geometryRevision(first)).not.toBe(geometryRevision(changed))
    changed[0].geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
    }
    expect(geometryRevision(first)).not.toBe(geometryRevision(changed))
    first[0].geometry = null
    first[0].properties.affectedZones = ['https://api.weather.gov/zones/forecast/OHZ001']
    changed[0].geometry = null
    changed[0].properties.affectedZones = ['https://api.weather.gov/zones/forecast/OHZ002']
    expect(alertZonePaths(first)).not.toEqual(alertZonePaths(changed))
  })
  it('round-trips map position, layers, basemap, replay timestamp and alert scope', () => {
    const link = mapShareUrl('https://weather.white.fm/?embed=radar', {
      position: { lat: 39.12345, lon: -84.54321, zoom: 9 },
      view: 'alerts',
      layers: { ...initialLayers, metars: true },
      basemap: 'street',
      timestamp: 1700000000,
      scope: 'home',
      radius: 50,
      nexradOn: true,
      nexradSite: 'KILN',
      nexradProduct: 'N0U',
    })
    const parsed = readMapLink(new URL(link).search)
    expect(parsed.position).toEqual({ lat: 39.12345, lon: -84.54321, zoom: 9 })
    expect(parsed.layers?.metars).toBe(true)
    expect(parsed.view).toBe('alerts')
    expect(parsed.scope).toBe('home')
    expect(parsed.timestamp).toBe(1700000000)
    expect(parsed.basemap).toBe('street')
    expect(parsed.nexradSite).toBe('KILN')
    expect(new URL(link).searchParams.has('embed')).toBe(false)
    expect(readMapLink('?lat=999&lon=0&z=100&at=nope&base=bad&scope=bad').position).toBeNull()
  })
  it('saves, restores and deletes a custom layer preset', () => {
    const current = {
      layers: { ...initialLayers, metars: true },
      basemap: 'street' as const,
      nexradOn: false,
      nexradSite: '',
      nexradProduct: 'N0Q',
      nexradCoords: null,
    }
    const apply = vi.fn()
    const view = render(<MapPresets current={current} onApply={apply} replay={false} />)
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Airport weather' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save current layers' }))
    view.unmount()
    render(<MapPresets current={current} onApply={apply} replay={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Airport weather' }))
    expect(apply.mock.calls[0][0].layers.metars).toBe(true)
    expect(apply.mock.calls[0][0].basemap).toBe('street')
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Airport weather' }))
    expect(screen.queryByRole('button', { name: 'Airport weather' })).toBeNull()
  })
})

it('regenerates AI explicitly, carries the selected area, and shows unavailable sources', async () => {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      calls.push(String(input))
      const data = String(input).includes('/status')
        ? { ok: true, configured_model: 'test' }
        : {
            source: 'fallback',
            text: 'Alert status is unknown.',
            model: 'test',
            generated_at: 1700000000,
            context: { alerts_count: null, lsrs_count: 0, has_afd: false, has_hwo: false },
            sources: { alerts: 'unavailable' },
          }
      return new Response(JSON.stringify(data))
    }),
  )
  render(<BriefingPanel scope="home" radius={50} />)
  await screen.findByText('Alert status is unknown.')
  expect(screen.getByText(/Unavailable sources: NWS alerts/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate briefing' }))
  await waitFor(() => expect(calls.some((p) => p.includes('refresh=true'))).toBe(true))
  expect(
    calls
      .filter((p) => p.includes('/now'))
      .every((p) => p.includes('scope=home') && p.includes('radius_miles=50')),
  ).toBe(true)
  expect(screen.getByText(/Generated/)).toBeTruthy()
})
