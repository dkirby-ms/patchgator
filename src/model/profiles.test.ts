import { describe, expect, it } from 'vitest'
import { summitProfile, synthProfileById, synthProfileIds, synthProfiles, ultranovaProfile, webSynthProfile } from './profiles'
import type { ParameterDefinition } from './parameters'
import { webSynthParameters, webSynthPresets } from './webSynthProfile'

describe('synth profiles', () => {
  it('uses stable profile identifiers independent of display names', () => {
    expect(summitProfile.id).toBe('summit')
    expect(synthProfileIds.webSynth).toBe('web-synth')
    expect(summitProfile.name).toBe('Novation Summit')
    expect(synthProfileById.get(synthProfileIds.summit)).toBe(summitProfile)
    expect(synthProfiles).toEqual([webSynthProfile, summitProfile, ultranovaProfile])
  })

  it('allows profile parameter definitions without hardware addresses', () => {
    const parameter: ParameterDefinition = {
      id: 'oscillator-wave',
      section: 'Oscillator',
      label: 'Oscillator wave',
      shortLabel: 'Wave',
      min: 0,
      max: 1,
      defaultValue: 0,
    }

    expect(parameter.id).toBe('oscillator-wave')
    expect('address' in parameter).toBe(false)
  })

  it('declares Summit-only hardware capabilities on its profile', () => {
    expect(summitProfile.capabilities).toEqual({
      audioOutput: false,
      midiInput: true,
      midiOutput: true,
      modulationMatrix: true,
      sysex: true,
    })
  })

  it('defines independent Web Audio controls and complete profile presets', () => {
    expect(webSynthProfile.capabilities).toEqual({
      audioOutput: true,
      midiInput: true,
      midiOutput: false,
      modulationMatrix: false,
      sysex: false,
    })

    expect(webSynthParameters.every((parameter) => !('address' in parameter))).toBe(true)
    expect(webSynthProfile.presets).toBe(webSynthPresets)
    for (const preset of webSynthPresets) {
      expect(Object.keys(preset.values).sort()).toEqual(
        webSynthParameters.map((parameter) => parameter.id).sort(),
      )
    }
    expect(webSynthParameters.map((parameter) => parameter.id)).toEqual(expect.arrayContaining([
      'osc1Wave', 'osc2Wave', 'osc1CoarsePitch', 'osc2CoarsePitch', 'osc1Detune', 'osc2Detune', 'filterCutoff', 'filterResonance',
      'filterEnvelopeAmount', 'ampAttack', 'ampDecay', 'ampSustain', 'ampRelease',
      'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease', 'lfoRate',
      'lfoPitchDepth', 'lfoFilterDepth',
    ]))
  })

  it('defaults both Web Synth oscillators to zero detune while preserving preset tuning', () => {
    for (const id of ['osc1Detune', 'osc2Detune'] as const) {
      expect(webSynthParameters.find((parameter) => parameter.id === id)?.defaultValue).toBe(0)
      expect(webSynthProfile.defaultValues[id]).toBe(0)
    }
    expect(webSynthPresets.slice(0, 3).map((preset) => preset.values.osc2Detune)).toEqual([12, 5, -12])
    expect(webSynthPresets.map((preset) => preset.name)).toContain('Kick Drum')
  })

  it('defines each Web Synth coarse pitch control as a centered semitone range', () => {
    for (const id of ['osc1CoarsePitch', 'osc2CoarsePitch'] as const) {
      expect(webSynthParameters.find((parameter) => parameter.id === id)).toMatchObject({
        min: -12, max: 12, defaultValue: 0, displayOffset: 0,
      })
      expect(webSynthProfile.defaultValues[id]).toBe(0)
    }
  })

  it('uses shared hardware-sized physical envelope limits without changing MIDI scales', () => {
    for (const profile of [summitProfile, ultranovaProfile]) {
      const envelopeParameters = profile.parameters.filter((parameter) => /(?:Attack|Decay|Sustain|Release)$/.test(parameter.id))
      expect(envelopeParameters.length).toBeGreaterThanOrEqual(8)
      for (const parameter of envelopeParameters) {
        expect(parameter.min).toBe(0)
        expect(parameter.max).toBe(127)
      }
    }
    for (const prefix of ['amp', 'filter']) {
      for (const [stage, max] of Object.entries({ Attack: 20000, Decay: 22000, Sustain: 100, Release: 30000 })) {
        const parameter = webSynthParameters.find((parameter) => parameter.id === `${prefix}${stage}`)
        expect(parameter).toMatchObject({ min: 0, max })
      }
    }
    for (const preset of webSynthPresets) {
      for (const parameter of webSynthParameters) {
        expect(preset.values[parameter.id]).toBeGreaterThanOrEqual(parameter.min)
        expect(preset.values[parameter.id]).toBeLessThanOrEqual(parameter.max)
      }
    }
  })
})
