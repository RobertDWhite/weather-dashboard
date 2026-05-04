import type { NWSAlert } from './types'

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

/**
 * Build a YouTube keyword query from NWS alert properties.
 *
 * Example output:
 *   'tornado warning "Smith County" Texas live weather'
 *   'severe thunderstorm warning "Hamilton County" Ohio live storm'
 */
export function buildAlertQuery(alert: NWSAlert): string {
  const event = alert.properties.event.toLowerCase() // "tornado warning"

  // areaDesc: "Smith County, TX; Cherokee County, TX" or "Smith; TX"
  const rawAreas = alert.properties.areaDesc.split(';').map((s) => s.trim()).filter(Boolean)

  // Extract state abbreviation from any segment that ends with ", XX"
  let stateAbbr = ''
  for (const area of rawAreas) {
    const m = area.match(/,\s*([A-Z]{2})$/)
    if (m) { stateAbbr = m[1]; break }
  }
  const stateName = stateAbbr ? (STATE_NAMES[stateAbbr] ?? stateAbbr) : ''

  // First county name, stripped of state suffix
  const firstArea = rawAreas[0]?.replace(/,\s*[A-Z]{2}$/, '').trim() ?? ''

  // Office city from senderName: "NWS Fort Worth" → "Fort Worth"
  const office = alert.properties.senderName?.replace(/^NWS\s+/i, '').trim() ?? ''

  const parts: string[] = [event]
  if (firstArea) parts.push(`"${firstArea}"`)
  if (stateName) parts.push(stateName)
  else if (office) parts.push(office)
  parts.push('live')

  return parts.join(' ')
}
