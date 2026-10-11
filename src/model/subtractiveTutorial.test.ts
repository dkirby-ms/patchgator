import { describe, expect, it } from 'vitest'
import { subtractiveLessons, tutorialComplete, tutorialInitialValues, tutorialParameters } from './subtractiveTutorial'
import { webSynthParameters, type WebSynthParameterId } from './webSynthProfile'

const targets = [
  { osc1Wave: 2 },
  { osc2Wave: 2, osc1Level: 100, osc2Level: 25, osc1Detune: 0, osc2Detune: 3 },
  { filterType: 0, filterCutoff: 350, filterResonance: 20 },
  { ampAttack: 5, ampDecay: 250, ampSustain: 10, ampRelease: 80 },
  { filterEnvelopeAmount: 35, filterAttack: 0, filterDecay: 180, filterSustain: 0, filterRelease: 80 },
  { lfoRate: 4, lfoPitchDepth: 0, lfoFilterDepth: 0, lfoResonanceDepth: 0 },
]

describe('subtractive tutorial challenges', () => {
  it('begins with a complete pure mono tone and unlocks only cumulative controls', () => {
    expect(Object.keys(tutorialInitialValues)).toHaveLength(webSynthParameters.length)
    expect(tutorialInitialValues).toMatchObject({
      osc1Wave: 0, osc2Level: 0, filterEnvelopeAmount: 0, lfoPitchDepth: 0,
      ampSustain: 100, polyphony: 1, unisonVoices: 1,
    })
    let previous = new Set<WebSynthParameterId>()
    for (let step = 0; step < subtractiveLessons.length; step++) {
      const unlocked = tutorialParameters(step)
      for (const parameter of previous) expect(unlocked.has(parameter)).toBe(true)
      for (const parameter of subtractiveLessons[step].parameters) expect(unlocked.has(parameter)).toBe(true)
      if (step + 1 < subtractiveLessons.length) {
        for (const parameter of subtractiveLessons[step + 1].parameters) expect(unlocked.has(parameter)).toBe(false)
      }
      previous = unlocked
    }
  })

  it.each(targets.map((target, step) => ({ target, step })))('accepts the suggested bass recipe for lesson $step', ({ target, step }) => {
    expect(subtractiveLessons[step].complete({ ...tutorialInitialValues, ...target })).toBe(true)
  })

  it.each([
    [0, { osc1Wave: 1 }],
    [0, { osc1Wave: 3 }],
    [1, { osc2Wave: 0 }],
    [1, { osc2Level: 14 }],
    [1, { osc2Level: 41 }],
    [1, { osc2Detune: -6 }],
    [1, { osc2Detune: 6 }],
    [1, { osc1Detune: 1 }],
    [1, { osc1Level: 79 }],
    [2, { filterCutoff: 199 }],
    [2, { filterCutoff: 601 }],
    [2, { filterResonance: 9 }],
    [2, { filterResonance: 31 }],
    [2, { filterType: 1 }],
    [3, { ampAttack: -1 }],
    [3, { ampAttack: 11 }],
    [3, { ampDecay: 149 }],
    [3, { ampDecay: 401 }],
    [3, { ampSustain: -1 }],
    [3, { ampSustain: 16 }],
    [3, { ampRelease: 49 }],
    [3, { ampRelease: 151 }],
    [4, { filterEnvelopeAmount: 24 }],
    [4, { filterEnvelopeAmount: 51 }],
    [4, { filterAttack: -1 }],
    [4, { filterAttack: 11 }],
    [4, { filterDecay: 99 }],
    [4, { filterDecay: 351 }],
    [4, { filterSustain: -1 }],
    [4, { filterSustain: 11 }],
    [4, { filterRelease: 49 }],
    [4, { filterRelease: 151 }],
    [5, { lfoRate: 1 }],
    [5, { lfoRate: 9 }],
    [5, { lfoPitchDepth: 1 }],
    [5, { lfoFilterDepth: 1 }],
    [5, { lfoResonanceDepth: 1 }],
  ] as const)('rejects out-of-target values in lesson %i: %o', (step, invalid) => {
    expect(subtractiveLessons[step].complete({ ...tutorialInitialValues, ...targets[step], ...invalid })).toBe(false)
  })

  it('accepts inclusive edges, unison tuning, and negative oscillator 2 detune', () => {
    const lower = [
      { osc1Wave: 2 },
      { osc1Level: 80, osc2Level: 15, osc2Detune: -5 },
      { filterCutoff: 200, filterResonance: 10 },
      { ampAttack: 0, ampDecay: 150, ampSustain: 0, ampRelease: 50 },
      { filterEnvelopeAmount: 25, filterAttack: 0, filterDecay: 100, filterSustain: 0, filterRelease: 50 },
      { lfoRate: 2 },
    ]
    const upper = [
      { osc1Wave: 2 },
      { osc1Level: 100, osc2Level: 40, osc2Detune: 5 },
      { filterCutoff: 600, filterResonance: 30 },
      { ampAttack: 10, ampDecay: 400, ampSustain: 15, ampRelease: 150 },
      { filterEnvelopeAmount: 50, filterAttack: 10, filterDecay: 350, filterSustain: 10, filterRelease: 150 },
      { lfoRate: 8 },
    ]
    for (const edges of [lower, upper]) {
      edges.forEach((target, step) => expect(subtractiveLessons[step].complete({ ...tutorialInitialValues, ...targets[step], ...target })).toBe(true))
    }
    expect(subtractiveLessons[1].complete({ ...tutorialInitialValues, ...targets[1], osc2Detune: 0 })).toBe(true)
  })

  it('builds the complete bass cumulatively and rejects earlier drift through the save step', () => {
    let values = { ...tutorialInitialValues }
    for (const [step, target] of targets.entries()) {
      values = { ...values, ...target }
      expect(tutorialComplete(step, values)).toBe(true)
    }
    expect(tutorialComplete(subtractiveLessons.length, values)).toBe(true)
    expect(values).toMatchObject({
      polyphony: 1, unisonVoices: 1, osc1Wave: 2, osc2Wave: 2,
      filterCutoff: 350, ampDecay: 250, ampRelease: 80,
      filterDecay: 180, filterRelease: 80, ampSustain: 10, filterSustain: 0, lfoPitchDepth: 0,
    })
    for (const drift of [
      { osc1Wave: 0 }, { osc2Level: 0 }, { filterCutoff: 6000 },
      { ampRelease: 5000 }, { filterDecay: 2000 }, { lfoPitchDepth: 20 },
    ]) {
      expect(tutorialComplete(subtractiveLessons.length, { ...values, ...drift })).toBe(false)
    }
  })
})
