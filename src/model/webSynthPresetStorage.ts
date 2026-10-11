import type { SynthPreset } from './profiles'
import { webSynthParameters } from './webSynthProfile'

export const webSynthPresetStorageKey = 'zinth.web-synth-presets.v1'

const legacyFilterParameters = [
  { id: 'filter2Type', min: 0, max: 2, valueLabels: ['LP', 'HP', 'BP'] },
  { id: 'filter2Cutoff', min: 100, max: 12000 },
  { id: 'filter2Resonance', min: 0, max: 100 },
]

function validValues(values: unknown, allowLegacy = false): values is Record<string, number> {
  if (!values || typeof values !== 'object') return false
  const parameters = allowLegacy && Object.keys(values).length === webSynthParameters.length + legacyFilterParameters.length
    ? [...webSynthParameters, ...legacyFilterParameters]
    : webSynthParameters
  return Object.keys(values).length === parameters.length && parameters.every((parameter) => {
    const value: unknown = Reflect.get(values, parameter.id)
    return typeof value === 'number' && Number.isFinite(value) && value >= parameter.min && value <= parameter.max
      && (!('valueLabels' in parameter) || Number.isInteger(value))
  })
}

function validPreset(preset: unknown): preset is SynthPreset {
  if (!preset || typeof preset !== 'object') return false
  const id: unknown = Reflect.get(preset, 'id')
  const name: unknown = Reflect.get(preset, 'name')
  return typeof id === 'string' && id.startsWith('user-') && id.length > 5
    && typeof name === 'string' && name.trim().length > 0 && name.length <= 64
    && validValues(Reflect.get(preset, 'values'), true)
}

/** Loads current or legacy presets without writing storage; legacy oscillator 1 settings become the shared filter. */
export function readWebSynthPresets(): SynthPreset[] {
  const raw = localStorage.getItem(webSynthPresetStorageKey)
  if (raw === null) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || !parsed.every(validPreset) || new Set(parsed.map((preset) => preset.id)).size !== parsed.length) {
    throw new Error('Saved Web Synth presets are invalid. Existing browser data has not been changed.')
  }
  return parsed.map((preset) => ({
    ...preset,
    values: Object.fromEntries(webSynthParameters.map(({ id }) => [id, preset.values[id]])),
  }))
}

/** Saves only the current parameter set, migrating validated legacy presets on a successful write. */
export function saveWebSynthPreset(name: string, values: Readonly<Record<string, number>>): SynthPreset[] {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 64) throw new Error('Use a preset name between 1 and 64 characters.')
  if (!validValues(values)) throw new Error('Cannot save an invalid Web Synth patch.')
  const presets = readWebSynthPresets()
  const preset: SynthPreset = { id: `user-${crypto.randomUUID()}`, name: trimmed, values: { ...values } }
  const next = [...presets, preset]
  localStorage.setItem(webSynthPresetStorageKey, JSON.stringify(next))
  return next
}
