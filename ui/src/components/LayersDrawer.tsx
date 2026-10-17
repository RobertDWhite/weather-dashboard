import type { ReactNode } from 'react'
import { useDialog } from '../hooks/useDialog'
export interface LayerOption {
  id: string
  label: string
  group: string
  checked: boolean
  toggle: () => void
  disabled?: boolean
}
export default function LayersDrawer({
  options,
  children,
  onClose,
  replay,
  presets,
}: {
  options: LayerOption[]
  children: ReactNode
  onClose: () => void
  replay: boolean
  presets?: ReactNode
}) {
  const ref = useDialog(onClose)
  const groups = [...new Set(options.map((o) => o.group))]
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="layers-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="layers-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2 id="layers-title">Map layers</h2>
          <button className="quiet-button" onClick={onClose}>
            Close layers
          </button>
        </div>
        {replay && (
          <p className="notice">
            Replay is showing archived alerts, reports, and available radar. Live overlays are paused.
          </p>
        )}
        {presets}
        {groups.map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {options
              .filter((o) => o.group === group)
              .map((o) => (
                <label className="layer-option" key={o.id}>
                  <input type="checkbox" checked={o.checked} onChange={o.toggle} disabled={o.disabled} />
                  <span>{o.label}</span>
                  <span className="layer-state">{o.disabled ? 'Unavailable' : o.checked ? 'On' : 'Off'}</span>
                </label>
              ))}
          </fieldset>
        ))}
        {!replay && (
          <fieldset>
            <legend>Single-site radar</legend>
            {children}
          </fieldset>
        )}
      </div>
    </div>
  )
}
