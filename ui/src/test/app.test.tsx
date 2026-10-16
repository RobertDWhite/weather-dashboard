import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixtures from './fixtures.json'
import type { NWSAlertsResponse } from '../types'
import App from '../App'

vi.mock('../components/RadarMap', () => ({
  default: (p: {
    alerts: NWSAlertsResponse | null
    forceTimestamp: number | null
    showMetars: boolean
    showMrms: boolean
    reports: unknown
  }) => (
    <div data-testid="radar-map">
      {JSON.stringify({
        ids: p.alerts?.features.map((a) => a.id),
        replay: p.forceTimestamp,
        metars: p.showMetars,
        mrms: p.showMrms,
        reports: p.reports,
      })}
    </div>
  ),
}))
vi.mock('../components/AlertsMap', () => ({
  default: (p: { alerts: NWSAlertsResponse | null }) => (
    <div data-testid="alerts-map">{p.alerts?.features.map((a) => a.id).join(',')}</div>
  ),
}))
vi.mock('../components/HourlyChart', () => ({ default: () => <div>Hourly forecast chart</div> }))
let failed = new Set<string>()
let overrides: Record<string, unknown> = {}
const calls: string[] = []
beforeEach(() => {
  failed = new Set()
  overrides = {}
  calls.length = 0
  window.history.replaceState({}, '', '/')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input).replace('/api', '')
      calls.push(url)
      const key = url in fixtures ? url : url.split('?')[0]
      if (failed.has(key)) return new Response('', { status: 502 })
      const body = overrides[key] ?? (fixtures as Record<string, unknown>)[key]
      return new Response(JSON.stringify(body ?? {}), { status: body === undefined ? 404 : 200 })
    }),
  )
})

describe('dashboard workflows', () => {
  it('shows a failed local alert feed as unknown even when the national feed succeeds', async () => {
    failed.add('/nws/alerts?local=true')
    render(<App />)
    await screen.findByText('Alerts unavailable')
    expect(screen.queryByText(/No active watches or warnings/)).toBeNull()
    expect(screen.queryByText('✓ No active alerts')).toBeNull()
    expect(screen.getAllByText(/Live local alerts unavailable/).length).toBeGreaterThan(0)
    expect(calls).not.toContain('/spc/reports')
  })
  it('mounts the alerts map from the A shortcut and the embed URL', async () => {
    const view = render(<App />)
    await screen.findByTestId('radar-map')
    fireEvent.keyDown(window, { key: 'a' })
    expect(await screen.findByTestId('alerts-map')).toBeTruthy()
    view.unmount()
    window.history.replaceState({}, '', '/?embed=alerts')
    render(<App />)
    expect(await screen.findByTestId('alerts-map')).toBeTruthy()
    expect(screen.queryByTestId('radar-map')).toBeNull()
  })
  it('isolates archive polygons from live alarms and pauses live overlays', async () => {
    localStorage.setItem('wx-alarm-enabled', '1')
    localStorage.setItem('wx-layers', JSON.stringify({ mrms: true, metars: true, reports: true }))
    render(<App />)
    const slider = await screen.findByRole('slider', { name: 'Replay time' })
    await waitFor(() => expect(screen.getByTestId('radar-map').textContent).toContain('national-only'))
    fireEvent.change(slider, { target: { value: slider.getAttribute('min') } })
    await waitFor(() => expect(screen.getByTestId('radar-map').textContent).toContain('archive-only'))
    const data = JSON.parse(screen.getByTestId('radar-map').textContent!)
    expect(data.ids).toEqual(['archive-only'])
    expect(data.metars).toBe(false)
    expect(data.mrms).toBe(false)
    expect(data.reports).toBeNull()
    expect(calls.filter((p) => p.includes('/webhook/notify'))).toEqual([])
    fireEvent.keyDown(window, { key: 'a' })
    await waitFor(() => expect(screen.getByTestId('alerts-map').textContent).toBe('archive-only'))
    fireEvent.click(screen.getByRole('button', { name: 'Return to live' }))
    await waitFor(() => expect(screen.getByTestId('alerts-map').textContent).toBe('national-only'))
  })
  it('does not show a previous snapshot or live polygons when the next archive request fails', async () => {
    render(<App />)
    const slider = await screen.findByRole('slider', { name: 'Replay time' })
    failed.add('/timemachine/at')
    fireEvent.change(slider, { target: { value: slider.getAttribute('min') } })
    await screen.findByText('Archive unavailable')
    expect(screen.getByTestId('radar-map').textContent).not.toMatch(/archive-only|national-only/)
  })
  it('keeps optional aviation requests deferred until opened, and stops mounting the tool when closed', async () => {
    render(<App />)
    await screen.findByTestId('radar-map')
    expect(calls.some((p) => p.startsWith('/aviation'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Aviation' }))
    await screen.findByText('No TAFs returned for this area.')
    expect(calls.some((p) => p.startsWith('/aviation/tafs'))).toBe(true)
    expect(calls.some((p) => p.startsWith('/aviation/pireps'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Aviation' }))
    expect(screen.queryByText('No TAFs returned for this area.')).toBeNull()
  })
  it('traps focus in the layers drawer, closes on Escape, and restores the opener', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = await screen.findByRole('button', { name: /Layers ·/ })
    await user.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Map layers' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.keyboard('a')
    expect(screen.queryByTestId('alerts-map')).toBeNull()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
  it('closes the alert drawer with Escape and restores focus', async () => {
    const user = userEvent.setup()
    overrides['/nws/alerts?local=true'] = fixtures['/nws/alerts']
    render(<App />)
    const opener = await screen.findByRole('button', { name: /ACTIVE ALERT/ })
    await user.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Alert details' })
    await user.click(within(dialog).getByRole('textbox', { name: 'Filter alerts' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
  it('continues to deliver new live urgent alerts while replay is selected', async () => {
    vi.useFakeTimers()
    localStorage.setItem('wx-alarm-enabled', '1')
    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const slider = screen.getByRole('slider', { name: 'Replay time' })
    await act(async () => {
      fireEvent.change(slider, { target: { value: slider.getAttribute('min') } })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(calls.filter((p) => p.includes('/webhook/notify'))).toEqual([])
    const urgent = structuredClone(fixtures['/timemachine/at'].alerts.features[0])
    urgent.id = 'live-urgent'
    urgent.properties.id = 'live-urgent'
    overrides['/nws/alerts?local=true'] = { type: 'FeatureCollection', features: [urgent] }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(calls).toContain('/webhook/notify')
    expect(screen.getByTestId('radar-map').textContent).toContain('archive-only')
  })
})
