import { describe, expect, it, vi } from 'vitest'
import { webSynthDefaultValues } from '../model/webSynthProfile'
import { WebAudioSynth } from './webAudioSynth'

function createAudioParam() {
  const setValueAtTime = vi.fn((value: number, ...timing: number[]) => { void timing; audioParam.value = value })
  const linearRampToValueAtTime = vi.fn((value: number, ...timing: number[]) => { void timing; audioParam.value = value })
  const setTargetAtTime = vi.fn((value: number, ...timing: number[]) => { void timing; audioParam.value = value })
  const audioParam = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
    setValueAtTime,
    linearRampToValueAtTime,
    setTargetAtTime,
  }
  return { audioParam: audioParam as unknown as AudioParam, linearRampToValueAtTime }
}

function createAudioContext(autoEnd = true) {
  let state: AudioContextState = 'suspended'
  const modulationConnections = new Set<unknown>()
  const oscillators: Array<{
    frequency: AudioParam
    detune: AudioParam
    type: OscillatorType
    onended: ((event: Event) => void) | null
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    setPeriodicWave: ReturnType<typeof vi.fn>
  }> = []
  const gains: Array<{ gain: ReturnType<typeof createAudioParam>; connect: ReturnType<typeof vi.fn> }> = []
  const gainNodes: Array<{ connect: ReturnType<typeof vi.fn> }> = []
  const filters: Array<{ frequency: ReturnType<typeof createAudioParam>; Q: ReturnType<typeof createAudioParam>; node: { type: BiquadFilterType; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } }> = []
  const context = {
    currentTime: 1,
    sampleRate: 48000,
    get state() { return state },
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    resume: vi.fn(async () => { state = 'running' }),
    close: vi.fn(async () => { state = 'closed' }),
    createPeriodicWave: vi.fn((real: Float32Array, imag: Float32Array) => ({ real, imag })),
    createOscillator: vi.fn(() => {
      const isLfo = oscillators.length === 0
      const oscillator = {
        frequency: createAudioParam().audioParam,
        detune: createAudioParam().audioParam,
        type: 'sine' as OscillatorType,
        onended: null as ((event: Event) => void) | null,
        start: vi.fn(),
        stop: vi.fn(() => {
          if (autoEnd) oscillator.onended?.(new Event('ended'))
        }),
        setPeriodicWave: vi.fn(() => { oscillator.type = 'custom' }),
        connect: vi.fn((destination: unknown) => {
          if (isLfo) modulationConnections.add(destination)
        }),
        disconnect: vi.fn((destination?: unknown) => {
          if (!isLfo) return
          if (destination === undefined) modulationConnections.clear()
          else modulationConnections.delete(destination)
        }),
      }
      oscillators.push(oscillator)
      return oscillator
    }),
    createGain: vi.fn(() => {
      const gainParam = createAudioParam()
      const gain = {
        gain: gainParam.audioParam,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      gains.push({ gain: gainParam, connect: gain.connect })
      gainNodes.push(gain)
      return gain
    }),
    createBiquadFilter: vi.fn(() => {
      const frequency = createAudioParam()
      const Q = createAudioParam()
      const filter = {
        type: 'lowpass' as BiquadFilterType,
        frequency: frequency.audioParam,
        Q: Q.audioParam,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      filters.push({ frequency, Q, node: filter })
      return filter
    }),
  } as unknown as AudioContext
  return { context, oscillators, gains, gainNodes, filters, modulationConnections }
}

describe('Web Audio synth', () => {
  it('waits for explicit start, creates one shared LFO, and bounds voices to eight', async () => {
    const { context, oscillators } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    expect(synth.getSnapshot()).toEqual({ status: 'idle', error: null })
    expect(context.createOscillator).not.toHaveBeenCalled()
    expect(await synth.start()).toBe(true)
    expect(synth.getSnapshot()).toEqual({ status: 'ready', error: null })
    expect(context.createOscillator).toHaveBeenCalledTimes(1)

    for (let note = 60; note < 68; note += 1) synth.noteOn(note)
    expect(synth.activeVoiceCount).toBe(8)
    expect(synth.noteOn(72)).toBe(true)
    expect(synth.activeVoiceCount).toBe(8)
    expect(oscillators.filter((oscillator) => oscillator.start.mock.calls.length > 0)).toHaveLength(19)
  })

  it('routes the amplifier output directly to the audio destination', async () => {
    const { context, gainNodes } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.noteOn(60)

    expect(gainNodes[2].connect).toHaveBeenCalledWith(context.destination)
  })

  it('mixes oscillators independently and smooths active voice level changes', async () => {
    const { context, gains } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.noteOn(60)
    const next = { ...webSynthDefaultValues, osc1Level: 0, osc2Level: 40 }

    synth.setParameters(next)

    expect(gains[0].gain.audioParam.setTargetAtTime).toHaveBeenCalledWith(0, 1, 0.02)
    expect(gains[1].gain.audioParam.setTargetAtTime).toHaveBeenCalledWith(0.2, 1, 0.02)
  })

  it('schedules release for note-off and a short release for panic', async () => {
    const { context, oscillators, gains, filters } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.setParameters({ ...webSynthDefaultValues, ampRelease: 200, filterRelease: 1000 })
    synth.noteOn(60)
    expect(filters[0].frequency.linearRampToValueAtTime.mock.calls[1][0]).toBe(7260)
    expect(filters[0].frequency.linearRampToValueAtTime.mock.calls[1][1]).toBeCloseTo(1.61)
    expect(synth.noteOff(60)).toBe(true)
    expect(synth.activeVoiceCount).toBe(0)
    expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.2)
    expect(filters[0].frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(6000, 2)
    expect(oscillators[1].stop).toHaveBeenLastCalledWith(2.005)

    synth.noteOn(64)
    expect(synth.allNotesOff()).toBe(1)
    expect(synth.activeVoiceCount).toBe(0)
    const noteOscillators = oscillators.slice(1)
    expect(noteOscillators.at(-1)?.stop.mock.calls.at(-1)?.[0]).toBeCloseTo(1.02)
    expect(gains[2].gain.audioParam.cancelAndHoldAtTime).toHaveBeenCalledWith(1)
    expect(filters[0].frequency.audioParam.cancelAndHoldAtTime).toHaveBeenCalledWith(1)
  })

  it('schedules hardware-sized envelope durations without treating them as MIDI values', async () => {
    const { context, oscillators, gains, filters } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.setParameters({
      ...webSynthDefaultValues,
      ampAttack: 20000, ampDecay: 22000, ampSustain: 50, ampRelease: 30000,
      filterAttack: 20000, filterDecay: 22000, filterSustain: 50, filterRelease: 30000,
    })
    synth.noteOn(60)
    const peak = 0.12 / Math.sqrt(8) * 100 / 127
    expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, peak, 21)
    expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, peak * 0.5, 43)
    expect(filters[0].frequency.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 10200, 21)
    expect(filters[0].frequency.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 8100, 43)
    synth.noteOff(60)
    expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 31)
    expect(filters[0].frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(6000, 31)
    expect(oscillators[1].stop).toHaveBeenLastCalledWith(31.005)
  })

  it('shortens long release tails and stolen voices on panic before ended events arrive', async () => {
    const { context, oscillators, gains } = createAudioContext(false)
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.setParameters({ ...webSynthDefaultValues, polyphony: 1, ampRelease: 30000, filterRelease: 30000 })
    synth.noteOn(60)
    synth.noteOff(60)
    expect(oscillators[1].stop).toHaveBeenLastCalledWith(31.005)
    synth.noteOn(64)
    synth.noteOn(67)

    expect(synth.allNotesOff()).toBe(3)
    for (const oscillator of oscillators.slice(1)) {
      expect(oscillator.stop.mock.calls.at(-1)?.[0]).toBeCloseTo(1.02)
    }
    for (const gain of [gains[2], gains[9], gains[16]]) {
      expect(gain.gain.audioParam.cancelAndHoldAtTime).toHaveBeenLastCalledWith(1)
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.015)
    }
    expect(synth.noteOff(67)).toBe(false)
    for (const oscillator of oscillators.slice(1)) oscillator.onended?.(new Event('ended'))
    expect(synth.activeVoiceCount).toBe(0)
    expect(synth.allNotesOff()).toBe(0)
    expect(synth.noteOn(72)).toBe(true)
  })

  it('releases notes and panics when AudioParams lack cancelAndHoldAtTime', async () => {
    const { context, gains, filters, oscillators } = createAudioContext(false)
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.setParameters({ ...webSynthDefaultValues, ampRelease: 30000, filterRelease: 30000 })
    synth.noteOn(60)
    for (const param of [gains[2].gain.audioParam, ...filters.map((filter) => filter.frequency.audioParam)]) {
      Object.defineProperty(param, 'cancelAndHoldAtTime', { value: undefined })
    }
    expect(synth.noteOff(60)).toBe(true)
    expect(gains[2].gain.audioParam.cancelScheduledValues).toHaveBeenLastCalledWith(1)
    expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 31)
    expect(synth.allNotesOff()).toBe(1)
    expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.015)
    expect(oscillators[1].stop.mock.calls.at(-1)?.[0]).toBeCloseTo(1.02)
    for (const filter of filters) {
      expect(filter.frequency.audioParam.cancelScheduledValues).toHaveBeenLastCalledWith(1)
      expect(filter.frequency.linearRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(1.015)
    }
  })

  it('removes retired voice modulation routes from the shared LFO', async () => {
    const { context, modulationConnections } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()

    synth.noteOn(60)
    synth.noteOn(62)
    synth.noteOn(64)
    expect(modulationConnections.size).toBe(12)

    expect(synth.noteOff(62)).toBe(true)
    expect(modulationConnections.size).toBe(8)
    expect(synth.noteOff(60)).toBe(true)
    expect(modulationConnections.size).toBe(4)
    expect(synth.noteOff(64)).toBe(true)
    expect(modulationConnections.size).toBe(0)

    for (let note = 65; note < 70; note += 1) {
      synth.noteOn(note)
      expect(modulationConnections.size).toBe(4)
      synth.noteOff(note)
      expect(modulationConnections.size).toBe(0)
    }
  })

  it('smooths parameter updates and applies waveform, filter, and shared LFO destinations', async () => {
    const { context, oscillators } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.noteOn(69)
    const oscillator = oscillators[1]
    const next = { ...webSynthDefaultValues, osc1Wave: 0, osc2Wave: 3, osc1Detune: -20, filterCutoff: 1800, lfoRate: 9, lfoPitchDepth: 30, lfoFilterDepth: 10 }

    synth.setParameters(next)

    expect(oscillator.type).toBe('sine')
    expect(oscillators[2].type).toBe('square')
    expect(oscillators[0].frequency.setTargetAtTime).toHaveBeenCalledWith(9, 1, 0.02)
    expect(oscillator.detune.setTargetAtTime).toHaveBeenCalledWith(-20, 1, 0.02)
  })

  it('reports audio initialization failures without claiming readiness', async () => {
    const synth = new WebAudioSynth(() => { throw new Error('Audio unavailable') })

    expect(await synth.start()).toBe(false)
    expect(synth.getSnapshot()).toEqual({ status: 'error', error: 'Audio unavailable' })
  })

  it('mixes both oscillator gains into exactly one selectable filter per note', async () => {
    const { context, gains, filters } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    synth.setParameters({ ...webSynthDefaultValues, filterType: 1, filterCutoff: 1000, filterResonance: 10 })
    await synth.start()
    synth.noteOn(60)
    expect(gains[0].connect).toHaveBeenCalledExactlyOnceWith(filters[0].node)
    expect(gains[1].connect).toHaveBeenCalledExactlyOnceWith(filters[0].node)
    expect(filters).toHaveLength(1)
    expect(filters[0].node.connect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ gain: gains[2].gain.audioParam }))
    expect(filters[0].node.type).toBe('highpass')
    expect(filters[0].Q.audioParam.value).toBeCloseTo(2.1)
    expect(filters[0].frequency.audioParam.setValueAtTime).toHaveBeenCalledWith(1000, 1)
    synth.noteOff(60)
    expect(filters[0].frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(1000, 1.5)
    synth.noteOn(64)
    expect(filters).toHaveLength(2)
    expect(gains[7].connect).toHaveBeenCalledExactlyOnceWith(filters[1].node)
    expect(gains[8].connect).toHaveBeenCalledExactlyOnceWith(filters[1].node)
  })

  it('updates the shared filter without restarting its envelope for unrelated changes', async () => {
    const { context, filters } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.noteOn(60)
    synth.setParameters({ ...webSynthDefaultValues, filterType: 2 })
    expect(filters[0].node.type).toBe('bandpass')
    expect(filters[0].frequency.audioParam.cancelAndHoldAtTime).not.toHaveBeenCalled()
    synth.setParameters({ ...webSynthDefaultValues, filterType: 1, filterCutoff: 1800 })
    expect(filters[0].node.type).toBe('highpass')
    expect(filters[0].frequency.audioParam.setTargetAtTime).toHaveBeenCalledWith(1800, 1, 0.02)
  })

  it('assigns LFO pitch to both oscillators and bounded cutoff and resonance to the shared filter', async () => {
    const { context, gains, oscillators, filters } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    const values = { ...webSynthDefaultValues, filterEnvelopeAmount: 0, filterCutoff: 1000, filterResonance: 25, lfoPitchDepth: 1200, lfoFilterDepth: 50, lfoResonanceDepth: 100 }
    synth.setParameters(values)
    await synth.start()
    synth.noteOn(69)
    expect(gains[3].connect).toHaveBeenCalledWith(oscillators[1].detune)
    expect(gains[4].connect).toHaveBeenCalledWith(oscillators[2].detune)
    expect(gains[3].gain.audioParam.value).toBe(1200)
    expect(gains[5].connect).toHaveBeenCalledWith(filters[0].frequency.audioParam)
    expect(gains[6].connect).toHaveBeenCalledWith(filters[0].Q.audioParam)
    expect(gains[6].gain.audioParam.value).toBeCloseTo(5)
    expect(gains[5].gain.audioParam.value).toBe(500)
    synth.setParameters({ ...values, lfoPitchDepth: 0, lfoFilterDepth: 0, lfoResonanceDepth: 0 })
    expect(gains.slice(3).every(({ gain }) => gain.audioParam.value === 0)).toBe(true)
    synth.setParameters({ ...values, filterEnvelopeAmount: 100, filterResonance: 0 })
    expect(gains.slice(5).every(({ gain }) => gain.audioParam.value === 0)).toBe(true)
    synth.setParameters({ ...values, filterEnvelopeAmount: 100, filterResonance: 100 })
    expect(gains.slice(5).every(({ gain }) => gain.audioParam.value === 0)).toBe(true)
  })

  it('creates normalized unison copies and detunes them symmetrically', async () => {
    const { context, oscillators, gains, modulationConnections } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    synth.setParameters({ ...webSynthDefaultValues, unisonVoices: 4, unisonDetune: 30 })
    await synth.start()
    synth.noteOn(60)
    expect(oscillators).toHaveLength(9)
    const detunes = oscillators.slice(1, 5).map((oscillator) => oscillator.detune.value)
    detunes.forEach((detune, index) => expect(detune).toBeCloseTo([-30, -10, 10, 30][index]))
    oscillators.slice(5).forEach((oscillator, index) => expect(oscillator.detune.value).toBeCloseTo([-23, -3, 17, 37][index]))
    expect(gains[0].gain.audioParam.value).toBe(0.125)
    expect(gains[1].gain.audioParam.value).toBe(0.125)
    expect(synth.activeVoiceCount).toBe(1)
    synth.noteOff(60)
    expect(oscillators.slice(1).every((oscillator) => oscillator.stop.mock.calls.length === 1)).toBe(true)
    expect(modulationConnections.size).toBe(0)
  })

  it('supports mono through sixteen notes and releases notes when voice settings change', async () => {
    const { context, oscillators } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.setParameters({ ...webSynthDefaultValues, polyphony: 1 })
    synth.noteOn(60)
    synth.noteOn(62)
    expect(synth.activeVoiceCount).toBe(1)
    expect(synth.noteOff(60)).toBe(false)
    synth.setParameters({ ...webSynthDefaultValues, polyphony: 16 })
    expect(synth.activeVoiceCount).toBe(0)
    expect(oscillators[3].stop).toHaveBeenCalled()
    for (let note = 60; note < 77; note += 1) synth.noteOn(note)
    expect(synth.activeVoiceCount).toBe(16)
    expect(synth.noteOff(60)).toBe(false)
    synth.setParameters({ ...webSynthDefaultValues, polyphony: 16, unisonVoices: 2 })
    expect(synth.activeVoiceCount).toBe(0)
    synth.noteOn(60)
    expect(synth.activeVoiceCount).toBe(1)
    expect(synth.allNotesOff()).toBe(1)
  })

  it('applies pulse width and phase to all unison copies and restores native shapes', async () => {
    const { context, oscillators } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    const values = { ...webSynthDefaultValues, osc1Wave: 3, osc1Shape: 25, osc2Wave: 0, osc2Shape: 75, unisonVoices: 2 }
    synth.setParameters(values)
    await synth.start()
    synth.noteOn(60)
    expect(context.createPeriodicWave).toHaveBeenCalledTimes(2)
    expect(oscillators.slice(1).every((oscillator) => oscillator.type === 'custom')).toBe(true)
    expect(oscillators[1].setPeriodicWave.mock.calls[0]).toEqual(oscillators[2].setPeriodicWave.mock.calls[0])
    synth.setParameters({ ...values, osc1Shape: 50, osc2Shape: 50 })
    expect(oscillators.slice(1, 3).map((oscillator) => oscillator.type)).toEqual(['square', 'square'])
    expect(oscillators.slice(3).map((oscillator) => oscillator.type)).toEqual(['sine', 'sine'])
  })

  it('keeps new leases alive when retired unison sources finish after reconfiguration', async () => {
    const { context, oscillators, modulationConnections } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    await synth.start()
    synth.noteOn(60)
    const retired = oscillators.slice(1)
    retired.forEach((oscillator) => oscillator.stop.mockImplementation(() => {}))
    synth.setParameters({ ...webSynthDefaultValues, unisonVoices: 4, polyphony: 1 })
    synth.noteOn(62)
    expect(modulationConnections.size).toBe(8)
    retired.forEach((oscillator) => oscillator.onended?.(new Event('ended')))
    expect(synth.activeVoiceCount).toBe(1)
    expect(modulationConnections.size).toBe(4)
    expect(synth.noteOff(62)).toBe(true)
    expect(synth.activeVoiceCount).toBe(0)
    expect(modulationConnections.size).toBe(0)
  })

  it('disconnects all unison and modulation nodes on disposal even without ended callbacks', async () => {
    const { context, oscillators, filters, modulationConnections } = createAudioContext()
    const synth = new WebAudioSynth(() => context)
    synth.setParameters({ ...webSynthDefaultValues, unisonVoices: 4 })
    await synth.start()
    synth.noteOn(60)
    oscillators.slice(1).forEach((oscillator) => oscillator.stop.mockImplementation(() => {}))
    await synth.dispose()
    expect(synth.activeVoiceCount).toBe(0)
    expect(modulationConnections.size).toBe(0)
    expect(oscillators.slice(1).every((oscillator) => oscillator.onended === null && oscillator.disconnect.mock.calls.length === 1)).toBe(true)
    expect(filters.every((filter) => filter.node.disconnect.mock.calls.length === 1)).toBe(true)
    expect(synth.getSnapshot()).toEqual({ status: 'idle', error: null })
  })
})
