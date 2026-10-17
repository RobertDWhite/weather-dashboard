import { useState } from 'react'
import { builtInPresets, validPreset, type LayerPreset } from '../mapWorkflows'
function loadPresets(): LayerPreset[] {
  try {
    const saved = JSON.parse(localStorage.getItem('wx-map-presets') || '[]')
    return Array.isArray(saved) ? saved.filter(validPreset).slice(0, 10) : []
  } catch {
    return []
  }
}
export default function MapPresets({
  current,
  onApply,
  replay,
}: {
  current: Omit<LayerPreset, 'name'>
  onApply: (preset: LayerPreset) => void
  replay: boolean
}) {
  const [presets, setPresets] = useState(loadPresets),
    [name, setName] = useState(''),
    [message, setMessage] = useState('')
  const save = (next: LayerPreset[]) => {
    try {
      localStorage.setItem('wx-map-presets', JSON.stringify(next))
      setPresets(next)
      return true
    } catch {
      setMessage('Preset could not be saved on this device.')
      return false
    }
  }
  return (
    <fieldset className="map-presets">
      <legend>Layer presets</legend>
      <div className="preset-buttons">
        {builtInPresets.map((p) => (
          <button
            disabled={replay}
            key={p.name}
            onClick={() => {
              onApply(p)
              setMessage(`${p.name} applied.`)
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      {presets.map((p) => (
        <div className="saved-preset" key={p.name}>
          <button
            disabled={replay}
            onClick={() => {
              onApply(p)
              setMessage(`${p.name} applied.`)
            }}
          >
            {p.name}
          </button>
          <button
            aria-label={`Delete preset ${p.name}`}
            onClick={() => {
              if (save(presets.filter((x) => x.name !== p.name))) setMessage(`${p.name} deleted.`)
            }}
          >
            Delete
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const title = name.trim()
          if (!title) return
          const next = [...presets.filter((p) => p.name !== title), { ...current, name: title }]
          if (next.length > 10) {
            setMessage('You can save up to 10 presets. Delete one first.')
            return
          }
          if (save(next)) {
            setName('')
            setMessage(`${title} saved on this device.`)
          }
        }}
      >
        <label>
          Preset name
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button disabled={replay || !name.trim()}>Save current layers</button>
      </form>
      {replay && <p className="notice">Return to live to apply or save a layer preset.</p>}
      <p role="status">{message}</p>
    </fieldset>
  )
}
