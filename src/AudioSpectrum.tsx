import { useEffect, useId, useRef, useState } from 'react'
import { webAudioSynth, type AudioStatus } from './audio/webAudioSynth'

const bandCount = 12
const plotHeight = 56

/** Displays logarithmic frequency bands from the mixed output without modifying audio or announcing animation frames. */
export function AudioSpectrum({ status }: { status: AudioStatus }) {
  const descriptionId = useId()
  const bars = useRef<Array<SVGRectElement | null>>([])
  const [paused, setPaused] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  useEffect(() => {
    const preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    const changed = () => setPaused(preference?.matches ?? false)
    preference?.addEventListener('change', changed)
    return () => preference?.removeEventListener('change', changed)
  }, [])

  useEffect(() => {
    const clear = () => bars.current.forEach((bar) => {
      bar?.setAttribute('y', String(plotHeight))
      bar?.setAttribute('height', '0')
    })
    if (status !== 'ready') {
      clear()
      return
    }
    const analyser = webAudioSynth.getOutputAnalyser()
    if (paused || !analyser) return
    const data = new Float32Array(analyser.frequencyBinCount)
    const binHz = analyser.context.sampleRate / analyser.fftSize
    const maxHz = Math.min(20000, analyser.context.sampleRate / 2)
    const ranges = Array.from({ length: bandCount }, (_, index) => {
      const lower = 20 * (maxHz / 20) ** (index / bandCount)
      const upper = 20 * (maxHz / 20) ** ((index + 1) / bandCount)
      const first = Math.max(1, Math.floor(lower / binHz))
      return { first, end: Math.min(data.length, Math.max(first + 1, Math.ceil(upper / binHz))) }
    })
    let frame = 0
    let lastTime = -Infinity
    const draw = (time: number) => {
      if (time - lastTime >= 1000 / 30) {
        analyser.getFloatFrequencyData(data)
        ranges.forEach(({ first, end }, index) => {
          let peak = -Infinity
          for (let bin = first; bin < end; bin++) peak = Math.max(peak, data[bin])
          const level = Math.min(1, Math.max(0, (peak - analyser.minDecibels) / (analyser.maxDecibels - analyser.minDecibels)))
          const height = level * plotHeight
          bars.current[index]?.setAttribute('y', String(plotHeight - height))
          bars.current[index]?.setAttribute('height', String(height))
        })
        lastTime = time
      }
      frame = requestAnimationFrame(draw)
    }
    const visibilityChanged = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden) frame = requestAnimationFrame(draw)
    }
    visibilityChanged()
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [status, paused])

  return <section className="audio-spectrum" aria-label="Live output spectrum">
    <div className="audio-spectrum-heading">
      <h3>Output spectrum</h3>
      <span>{status !== 'ready' ? 'Start audio to view' : paused ? 'Display paused' : 'Play a note to view'}</span>
      <button type="button" disabled={status !== 'ready'} onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
        {paused ? 'Resume spectrum' : 'Pause spectrum'}
      </button>
    </div>
    <p id={descriptionId} className="visually-hidden">Live frequency energy from 20 Hz to 20 kHz, bass on the left and treble on the right, on a logarithmic frequency scale. Taller bars indicate stronger energy, from -90 to -10 dBFS. This display does not change the sound.</p>
    <svg className="audio-spectrum-plot" viewBox={`0 0 ${bandCount * 10} ${plotHeight}`} preserveAspectRatio="none" role="img" aria-label="Output frequency spectrum" aria-describedby={descriptionId}>
      {[0, 0.5, 1].map((level) => <line key={level} x1="0" x2={bandCount * 10} y1={level * plotHeight} y2={level * plotHeight} />)}
      {Array.from({ length: bandCount }, (_, index) => <rect key={index} ref={(element) => { bars.current[index] = element }} x={index * 10 + 1} y={plotHeight} width="8" height="0" />)}
    </svg>
    <div className="audio-spectrum-labels" aria-hidden="true"><span>20 Hz · Bass</span><span>Midrange</span><span>Treble · 20 kHz</span></div>
  </section>
}
