import { getEnvelopeStages, holdAudioParamValue, scheduleSmoothedValue } from './envelope'
import { VoiceAllocator } from './voiceAllocator'
import { applyOscillatorShape } from './oscillatorShape'
import { webSynthDefaultValues, webSynthParameters } from '../model/webSynthProfile'
import type { WebSynthParameterId } from '../model/webSynthProfile'

export type AudioStatus = 'idle' | 'starting' | 'ready' | 'error'

export type AudioSnapshot = {
  status: AudioStatus
  error: string | null
}

type AudioContextFactory = () => AudioContext

type VoiceNodes = {
  leaseId: number
  note: number
  lfo: OscillatorNode
  oscillators1: OscillatorNode[]
  oscillators2: OscillatorNode[]
  oscillator1Gain: GainNode
  oscillator2Gain: GainNode
  filter: BiquadFilterNode
  ampGain: GainNode
  pitchModGain1: GainNode
  pitchModGain2: GainNode
  cutoffModGain: GainNode
  resonanceModGain: GainNode
  stoppedSources: number
  releasing: boolean
}

const filterTypes: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass']

function noteFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12)
}

function finiteParameterValues(values: Readonly<Record<string, number>>) {
  const next = {} as Record<WebSynthParameterId, number>
  for (const parameter of webSynthParameters) {
    const value = values[parameter.id]
    if (!Number.isFinite(value)) throw new RangeError(`Parameter ${parameter.id} must be a finite number.`)
    const clamped = Math.min(parameter.max, Math.max(parameter.min, value))
    next[parameter.id] = 'valueLabels' in parameter ? Math.round(clamped) : clamped
  }
  return next
}

export class WebAudioSynth {
  private readonly allocator = new VoiceAllocator(8)
  private readonly voices = new Map<number, VoiceNodes>()
  private readonly listeners = new Set<() => void>()
  private readonly contextFactory: AudioContextFactory
  private context: AudioContext | null = null
  private lfo: OscillatorNode | null = null
  private values: Record<WebSynthParameterId, number> = { ...webSynthDefaultValues }
  private snapshot: AudioSnapshot = { status: 'idle', error: null }

  constructor(contextFactory: AudioContextFactory = () => new AudioContext()) {
    this.contextFactory = contextFactory
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  private update(next: Partial<AudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((listener) => listener())
  }

  async start() {
    if (this.snapshot.status === 'ready' && this.context?.state === 'running') return true
    this.update({ status: 'starting', error: null })
    try {
      this.context ??= this.contextFactory()
      if (this.context.state !== 'running') await this.context.resume()
      if (this.context.state !== 'running') throw new Error('AudioContext did not enter the running state.')
      this.startLfo()
      this.update({ status: 'ready', error: null })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio initialization failed.'
      this.update({ status: 'error', error: message })
      return false
    }
  }

  setParameters(values: Readonly<Record<string, number>>) {
    const previous = this.values
    this.values = finiteParameterValues(values)
    if (previous.polyphony !== this.values.polyphony || previous.unisonVoices !== this.values.unisonVoices) {
      this.allNotesOff()
      this.allocator.resize(this.values.polyphony)
    }
    if (!this.context || this.snapshot.status !== 'ready') return
    const now = this.context.currentTime
    scheduleSmoothedValue(this.lfo!.frequency, this.values.lfoRate, now)
    for (const voice of this.voices.values()) {
      if (voice.releasing) continue
      if (previous.osc1Wave !== this.values.osc1Wave || previous.osc1Shape !== this.values.osc1Shape) {
        applyOscillatorShape(this.context, voice.oscillators1, this.values.osc1Wave, this.values.osc1Shape)
      }
      if (previous.osc2Wave !== this.values.osc2Wave || previous.osc2Shape !== this.values.osc2Shape) {
        applyOscillatorShape(this.context, voice.oscillators2, this.values.osc2Wave, this.values.osc2Shape)
      }
      scheduleSmoothedValue(voice.oscillator1Gain.gain, 0.5 * this.values.osc1Level / 100 / voice.oscillators1.length, now)
      scheduleSmoothedValue(voice.oscillator2Gain.gain, 0.5 * this.values.osc2Level / 100 / voice.oscillators2.length, now)
      this.updateDetune(voice, now)
      voice.filter.type = filterTypes[this.values.filterType]
      if (previous.filterCutoff !== this.values.filterCutoff) {
        scheduleSmoothedValue(voice.filter.frequency, this.filterCutoff(), now)
      }
      scheduleSmoothedValue(voice.filter.Q, this.filterResonance(), now)
      this.updateModulationDepth(voice, now)
    }
  }

  noteOn(note: number, velocity = 100) {
    if (!this.context || this.snapshot.status !== 'ready') return false
    if (!Number.isInteger(note) || note < 0 || note > 127) throw new RangeError('MIDI note must be an integer from 0 to 127.')
    const normalizedVelocity = Math.min(127, Math.max(1, Math.round(velocity)))
    const now = this.context.currentTime
    const { lease, stolen } = this.allocator.allocate(note, now)
    if (stolen) this.releaseVoice(stolen.id, 0.005, now)
    this.createVoice(lease.id, note, normalizedVelocity, now + (stolen ? 0.005 : 0))
    return true
  }

  noteOff(note: number) {
    const lease = this.allocator.release(note)
    if (!lease) return false
    this.releaseVoice(lease.id)
    return true
  }

  /** Silences held voices and release tails with a short fade; returns the affected voice count. */
  allNotesOff() {
    this.allocator.releaseAll()
    const voices = [...this.voices.keys()]
    for (const id of voices) this.releaseVoice(id, 0.015)
    return voices.length
  }

  async dispose() {
    this.allNotesOff()
    if (!this.context || this.context.state === 'closed') return
    await this.context.close()
    for (const voice of this.voices.values()) this.disconnectVoice(voice)
    this.voices.clear()
    this.allocator.resize(this.values.polyphony)
    this.context = null
    this.lfo = null
    this.update({ status: 'idle', error: null })
  }

  get activeVoiceCount() {
    return this.allocator.activeCount
  }

  private startLfo() {
    if (!this.context || this.lfo) return
    this.lfo = this.context.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.setValueAtTime(this.values.lfoRate, this.context.currentTime)
    this.lfo.start()
  }

  private createVoice(leaseId: number, note: number, velocity: number, startTime: number) {
    const context = this.context
    const lfo = this.lfo
    if (!context || !lfo) throw new Error('Audio output is not ready.')

    const oscillators1 = Array.from({ length: this.values.unisonVoices }, () => context.createOscillator())
    const oscillators2 = Array.from({ length: this.values.unisonVoices }, () => context.createOscillator())
    const oscillator1Gain = context.createGain()
    const oscillator2Gain = context.createGain()
    const filter = context.createBiquadFilter()
    const ampGain = context.createGain()
    const pitchModGain1 = context.createGain()
    const pitchModGain2 = context.createGain()
    const cutoffModGain = context.createGain()
    const resonanceModGain = context.createGain()
    const baseFrequency = noteFrequency(note)
    for (const gain of [pitchModGain1, pitchModGain2, cutoffModGain, resonanceModGain]) {
      gain.gain.setValueAtTime(0, startTime)
    }

    applyOscillatorShape(context, oscillators1, this.values.osc1Wave, this.values.osc1Shape)
    applyOscillatorShape(context, oscillators2, this.values.osc2Wave, this.values.osc2Shape)
    oscillator1Gain.gain.setValueAtTime(0.5 * this.values.osc1Level / 100 / oscillators1.length, startTime)
    oscillator2Gain.gain.setValueAtTime(0.5 * this.values.osc2Level / 100 / oscillators2.length, startTime)
    filter.type = filterTypes[this.values.filterType]
    filter.Q.setValueAtTime(this.filterResonance(), startTime)
    filter.connect(ampGain)
    lfo.connect(cutoffModGain)
    lfo.connect(resonanceModGain)
    cutoffModGain.connect(filter.frequency)
    resonanceModGain.connect(filter.Q)
    ampGain.gain.setValueAtTime(0, startTime)

    oscillators1.forEach((oscillator) => {
      oscillator.frequency.setValueAtTime(baseFrequency, startTime)
      oscillator.connect(oscillator1Gain)
      pitchModGain1.connect(oscillator.detune)
    })
    oscillators2.forEach((oscillator) => {
      oscillator.frequency.setValueAtTime(baseFrequency, startTime)
      oscillator.connect(oscillator2Gain)
      pitchModGain2.connect(oscillator.detune)
    })
    oscillator1Gain.connect(filter)
    oscillator2Gain.connect(filter)
    ampGain.connect(context.destination)
    lfo.connect(pitchModGain1)
    lfo.connect(pitchModGain2)

    const voice: VoiceNodes = {
      leaseId,
      note,
      lfo,
      oscillators1,
      oscillators2,
      oscillator1Gain,
      oscillator2Gain,
      filter,
      ampGain,
      pitchModGain1,
      pitchModGain2,
      cutoffModGain,
      resonanceModGain,
      stoppedSources: 0,
      releasing: false,
    }
    this.voices.set(leaseId, voice)
    this.updateDetune(voice, startTime, true)
    this.updateModulationDepth(voice, startTime)
    this.scheduleAttack(voice, velocity, startTime)

    const onended = () => {
      voice.stoppedSources += 1
      if (voice.stoppedSources < oscillators1.length + oscillators2.length) return
      this.voices.delete(leaseId)
      this.allocator.complete(leaseId)
      this.disconnectVoice(voice)
    }
    for (const oscillator of [...oscillators1, ...oscillators2]) {
      oscillator.onended = onended
      oscillator.start(startTime)
    }
  }

  private scheduleAttack(voice: VoiceNodes, velocity: number, startTime: number) {
    const stages = getEnvelopeStages(
      startTime,
      0.12 / Math.sqrt(this.allocator.capacity) * velocity / 127,
      this.values.ampAttack,
      this.values.ampDecay,
      this.values.ampSustain,
    )
    voice.ampGain.gain.setValueAtTime(0, startTime)
    voice.ampGain.gain.linearRampToValueAtTime(
      0.12 / Math.sqrt(this.allocator.capacity) * velocity / 127,
      stages.attackEnd,
    )
    voice.ampGain.gain.linearRampToValueAtTime(stages.sustainLevel, stages.decayEnd)

    const cutoff = this.filterCutoff()
    const filterPeak = this.filterPeak()
    const filterStages = getEnvelopeStages(
      startTime,
      filterPeak,
      this.values.filterAttack,
      this.values.filterDecay,
      this.values.filterSustain,
    )
    const filterSustainLevel = cutoff + (filterPeak - cutoff) * this.values.filterSustain / 100
    voice.filter.frequency.setValueAtTime(cutoff, startTime)
    voice.filter.frequency.linearRampToValueAtTime(filterPeak, filterStages.attackEnd)
    voice.filter.frequency.linearRampToValueAtTime(filterSustainLevel, filterStages.decayEnd)
  }

  private releaseVoice(leaseId: number, duration?: number, startTime?: number) {
    const voice = this.voices.get(leaseId)
    const context = this.context
    if (!voice || !context || (voice.releasing && duration === undefined)) return
    voice.releasing = true
    const now = startTime ?? context.currentTime
    const ampReleaseSeconds = duration ?? Math.max(0.005, this.values.ampRelease / 1000)
    const filterReleaseSeconds = duration ?? Math.max(0.005, this.values.filterRelease / 1000)
    const ampEndTime = now + ampReleaseSeconds
    const filterEndTime = now + filterReleaseSeconds

    holdAudioParamValue(voice.ampGain.gain, now)
    voice.ampGain.gain.linearRampToValueAtTime(0, ampEndTime)
    holdAudioParamValue(voice.filter.frequency, now)
    voice.filter.frequency.linearRampToValueAtTime(this.filterCutoff(), filterEndTime)
    const stopTime = Math.max(ampEndTime, filterEndTime) + 0.005
    for (const oscillator of [...voice.oscillators1, ...voice.oscillators2]) oscillator.stop(stopTime)
  }

  private filterCutoff() {
    return Math.min(this.maxCutoff, this.values.filterCutoff)
  }

  private filterResonance() {
    return 0.1 + this.values.filterResonance * 0.2
  }

  private get maxCutoff() {
    return Math.min(18000, (this.context?.sampleRate ?? 44100) / 2)
  }

  private filterPeak() {
    const cutoff = this.filterCutoff()
    return Math.min(this.maxCutoff, cutoff + (this.maxCutoff - cutoff) * this.values.filterEnvelopeAmount / 100)
  }

  private updateDetune(voice: VoiceNodes, now: number, immediate = false) {
    for (const [index, oscillators] of [voice.oscillators1, voice.oscillators2].entries()) {
      oscillators.forEach((oscillator, copy) => {
        const spread = oscillators.length === 1 ? 0 : (2 * copy / (oscillators.length - 1) - 1) * this.values.unisonDetune
        const detune = (index === 0 ? this.values.osc1Detune : this.values.osc2Detune) + spread
        if (immediate) oscillator.detune.setValueAtTime(detune, now)
        else scheduleSmoothedValue(oscillator.detune, detune, now)
      })
    }
  }

  private updateModulationDepth(voice: VoiceNodes, now: number) {
    scheduleSmoothedValue(voice.pitchModGain1.gain, this.values.lfoPitchDepth, now)
    scheduleSmoothedValue(voice.pitchModGain2.gain, this.values.lfoPitchDepth, now)
    const cutoff = this.filterCutoff()
    const cutoffHeadroom = Math.max(0, Math.min(cutoff, this.maxCutoff - this.filterPeak()))
    scheduleSmoothedValue(voice.cutoffModGain.gain, cutoffHeadroom * this.values.lfoFilterDepth / 100, now)
    const resonance = this.filterResonance()
    const resonanceHeadroom = Math.max(0, Math.min(resonance - 0.1, 20.1 - resonance))
    scheduleSmoothedValue(voice.resonanceModGain.gain, resonanceHeadroom * this.values.lfoResonanceDepth / 100, now)
  }

  private disconnectVoice(voice: VoiceNodes) {
    voice.lfo.disconnect(voice.pitchModGain1)
    voice.lfo.disconnect(voice.pitchModGain2)
    for (const gain of [voice.cutoffModGain, voice.resonanceModGain]) {
      voice.lfo.disconnect(gain)
      gain.disconnect()
    }
    for (const oscillator of [...voice.oscillators1, ...voice.oscillators2]) {
      oscillator.onended = null
      oscillator.disconnect()
    }
    voice.oscillator1Gain.disconnect()
    voice.oscillator2Gain.disconnect()
    voice.filter.disconnect()
    voice.ampGain.disconnect()
    voice.pitchModGain1.disconnect()
    voice.pitchModGain2.disconnect()
  }
}

export const webAudioSynth = new WebAudioSynth()
