/** Concentric distance rings around the home station — visual reference
 * for "how far away is that cell?". Drop inside any MapContainer. */
import { Circle, Tooltip } from 'react-leaflet'

interface Props {
  center: [number, number]
  /** Ring radii in miles. Default 25/50/100/200. */
  miles?: number[]
  color?: string
}

const MI_TO_M = 1609.344

export default function RangeRings({
  center,
  miles = [25, 50, 100, 200],
  color = '#22d3ee',
}: Props) {
  return (
    <>
      {miles.map((mi) => (
        <Circle
          key={mi}
          center={center}
          radius={mi * MI_TO_M}
          pathOptions={{
            color,
            weight: 1,
            opacity: 0.35,
            fill: false,
            dashArray: '4 6',
          }}
        >
          <Tooltip
            direction="top"
            offset={[0, -2]}
            permanent={false}
            sticky={false}
          >
            {mi} mi
          </Tooltip>
        </Circle>
      ))}
    </>
  )
}
