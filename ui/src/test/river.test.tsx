import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { riverStatus } from '../riverStatus'
import RiverGauges from '../components/RiverGauges'
import type { RiverGauge } from '../types'
const gauge: RiverGauge = {
  siteCode: '03245500',
  siteName: 'Milford',
  lat: 39,
  lon: -84,
  height: 16,
  unit: 'ft',
  time: new Date().toISOString(),
  qualifiers: [],
  thresholds: { action: 13, minor: 17, moderate: 22, major: 27, source: 'NWS NWPS', unit: 'ft' },
}
describe('station-specific flood categories', () => {
  it('does not classify a 16-foot observation as major flooding at every station', () => {
    expect(riverStatus(gauge).label).toBe('Action stage')
    expect(riverStatus({ ...gauge, height: 27 }).label).toBe('Major flooding')
    expect(riverStatus({ ...gauge, height: 22 }).label).toBe('Moderate flooding')
    expect(riverStatus({ ...gauge, height: 17 }).label).toBe('Minor flooding')
  })
  it('cannot declare normal conditions without matching thresholds or fresh observations', () => {
    expect(riverStatus({ ...gauge, thresholds: null }).known).toBe(false)
    expect(riverStatus({ ...gauge, unit: 'm' }).known).toBe(false)
    expect(riverStatus({ ...gauge, time: '2000-01-01' }).label).toBe('Observation stale')
  })
  it('shows failure rather than normal levels when the gauge request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 502 })),
    )
    render(<RiverGauges state="OH" onLocate={() => {}} />)
    await waitFor(() => expect(screen.getByText(/River gauges.*unavailable/)).toBeTruthy())
    expect(screen.queryByText(/normal levels|Below flood stage/)).toBeNull()
  })
})
