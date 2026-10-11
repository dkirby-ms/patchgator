import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webSynthDefaultValues } from './webSynthProfile'
import { readWebSynthPresets, saveWebSynthPreset, webSynthPresetStorageKey } from './webSynthPresetStorage'

describe('Web Synth browser presets', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('saves a complete, independent patch and reloads it', () => {
    const values = { ...webSynthDefaultValues, filterCutoff: 1700 }
    const saved = saveWebSynthPreset('  My pluck  ', values)
    values.filterCutoff = 3000
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: 'My pluck', values: { filterCutoff: 1700 } })
    expect(saved[0].id).toMatch(/^user-/)
    expect(readWebSynthPresets()).toEqual(saved)
    expect(saveWebSynthPreset('Another', webSynthDefaultValues)).toHaveLength(2)
  })

  it('retains old millisecond presets and saves the expanded envelope limits', () => {
    const oldValues = { ...webSynthDefaultValues, ampAttack: 5000, ampDecay: 5000, ampRelease: 8000 }
    const oldPreset = { id: 'user-old', name: 'Existing pad', values: oldValues }
    const raw = JSON.stringify([oldPreset])
    localStorage.setItem(webSynthPresetStorageKey, raw)
    expect(readWebSynthPresets()).toEqual([oldPreset])
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBe(raw)
    const values = {
      ...webSynthDefaultValues,
      ampAttack: 20000, ampDecay: 22000, ampRelease: 30000,
      filterAttack: 20000, filterDecay: 22000, filterRelease: 30000,
    }
    expect(saveWebSynthPreset('Long pad', values)[1].values).toEqual(values)
    expect(readWebSynthPresets()[1].values).toEqual(values)
    for (const [id, maximum] of Object.entries(values).filter(([id]) => /^(amp|filter)(Attack|Decay|Release)$/.test(id))) {
      expect(() => saveWebSynthPreset('Out of range', { ...values, [id]: maximum + 1 })).toThrow(/invalid/)
    }
  })

  it('loads legacy dual-filter presets using oscillator 1 settings and migrates on save only', () => {
    const values = { ...webSynthDefaultValues, filterType: 1, filterCutoff: 1700, filterResonance: 30 }
    const legacy = {
      id: 'user-legacy', name: 'Two filters',
      values: { ...values, filter2Type: 2, filter2Cutoff: 4000, filter2Resonance: 60 },
    }
    const raw = JSON.stringify([legacy])
    localStorage.setItem(webSynthPresetStorageKey, raw)
    expect(readWebSynthPresets()).toEqual([{ ...legacy, values }])
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBe(raw)
    expect(() => saveWebSynthPreset('Legacy write', legacy.values)).toThrow(/invalid/)
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
    expect(() => saveWebSynthPreset('New', webSynthDefaultValues)).toThrow(/Storage full/)
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBe(raw)
    write.mockRestore()
    const saved = saveWebSynthPreset('New', webSynthDefaultValues)
    expect(saved[0]).toEqual({ ...legacy, values })
    expect(JSON.parse(localStorage.getItem(webSynthPresetStorageKey)!)).toEqual(saved)
    expect(readWebSynthPresets()).toEqual(saved)
  })

  it.each([
    { filter2Type: 0 },
    { filter2Type: 3, filter2Cutoff: 4000, filter2Resonance: 20 },
    { filter2Type: 1.5, filter2Cutoff: 4000, filter2Resonance: 20 },
    { filter2Type: 0, filter2Cutoff: 99, filter2Resonance: 20 },
    { filter2Type: 0, filter2Cutoff: 4000, filter2Resonance: 101 },
    { filter2Type: 0, filter2Cutoff: 4000, unrelated: 20 },
  ])('rejects malformed legacy data without changing it: %o', (extra) => {
    const raw = JSON.stringify([{ id: 'user-legacy', name: 'Bad legacy', values: { ...webSynthDefaultValues, ...extra } }])
    localStorage.setItem(webSynthPresetStorageKey, raw)
    expect(() => readWebSynthPresets()).toThrow(/invalid/)
    expect(() => saveWebSynthPreset('New', webSynthDefaultValues)).toThrow(/invalid/)
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBe(raw)
  })

  it('rejects blank names and incomplete or invalid parameter sets', () => {
    expect(() => saveWebSynthPreset(' ', webSynthDefaultValues)).toThrow(/name/)
    expect(() => saveWebSynthPreset('x'.repeat(65), webSynthDefaultValues)).toThrow(/name/)
    expect(() => saveWebSynthPreset('Bad', {})).toThrow(/invalid/)
    for (const value of [NaN, Infinity, -1, 20000]) {
      expect(() => saveWebSynthPreset('Bad', { ...webSynthDefaultValues, filterCutoff: value })).toThrow(/invalid/)
    }
    expect(() => saveWebSynthPreset('Bad', { ...webSynthDefaultValues, osc1Wave: 1.5 })).toThrow(/invalid/)
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBeNull()
  })

  it.each([
    'not json',
    '{}',
    '[{"id":"user-1","name":"Missing values"}]',
    JSON.stringify([
      { id: 'user-1', name: 'One', values: webSynthDefaultValues },
      { id: 'user-1', name: 'Two', values: webSynthDefaultValues },
    ]),
  ])('does not overwrite corrupt browser data: %s', (raw) => {
    localStorage.setItem(webSynthPresetStorageKey, raw)
    expect(() => readWebSynthPresets()).toThrow()
    expect(() => saveWebSynthPreset('New', webSynthDefaultValues)).toThrow()
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBe(raw)
  })

  it('propagates storage failures instead of claiming a save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
    expect(() => saveWebSynthPreset('Pluck', webSynthDefaultValues)).toThrow(/Storage full/)
    expect(readWebSynthPresets()).toEqual([])
  })
})
