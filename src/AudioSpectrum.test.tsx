import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioSpectrum } from './AudioSpectrum'

const { analyser } = vi.hoisted(() => ({
  analyser: {
    frequencyBinCount: 2048,
    fftSize: 4096,
    context: { sampleRate: 48000 },
    minDecibels: -90,
    maxDecibels: -10,
    getFloatFrequencyData: vi.fn((data: Float32Array) => {
      data.fill(-Infinity)
      data[Math.round(440 / (48000 / 4096))] = -10
    }),
  },
}))

vi.mock('./audio/webAudioSynth', () => ({
  webAudioSynth: { getOutputAnalyser: () => analyser },
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('output spectrum', () => {
  it('renders exactly twelve empty bands before audio starts', () => {
    render(<AudioSpectrum status="idle" />)
    const plot = screen.getByRole('img', { name: 'Output frequency spectrum' })
    expect(plot).toHaveAttribute('viewBox', '0 0 120 56')
    expect(plot.querySelectorAll('rect')).toHaveLength(12)
    expect([...plot.querySelectorAll('rect')].every((bar) => bar.getAttribute('height') === '0')).toBe(true)
    expect(screen.getByRole('button', { name: 'Pause spectrum' })).toBeDisabled()
    expect(analyser.getFloatFrequencyData).not.toHaveBeenCalled()
  })

  it('maps live audio into twelve bands and cancels updates when paused or unmounted', () => {
    let draw: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      draw = callback
      return 1
    }))
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const { rerender, unmount } = render(<AudioSpectrum status="ready" />)
    draw?.(0)
    const bars = screen.getByRole('img', { name: 'Output frequency spectrum' }).querySelectorAll('rect')
    expect(bars).toHaveLength(12)
    expect(bars[5]).toHaveAttribute('height', '56')
    fireEvent.click(screen.getByRole('button', { name: 'Pause spectrum' }))
    expect(screen.getByRole('button', { name: 'Resume spectrum' })).toHaveAttribute('aria-pressed', 'true')
    expect(cancel).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Resume spectrum' }))
    rerender(<AudioSpectrum status="idle" />)
    expect([...bars].every((bar) => bar.getAttribute('height') === '0')).toBe(true)
    unmount()
    expect(cancel).toHaveBeenCalledWith(1)
  })

  it('starts paused when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    render(<AudioSpectrum status="ready" />)
    expect(screen.getByRole('button', { name: 'Resume spectrum' })).toHaveAttribute('aria-pressed', 'true')
    expect(analyser.getFloatFrequencyData).not.toHaveBeenCalled()
  })
})
