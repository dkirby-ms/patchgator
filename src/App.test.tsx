import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { defaultModMatrix, modMatrixDestinations, modMatrixSources } from './model/modMatrix'
import { defaultPatchValues, summitParameters } from './model/parameters'
import { usePatchStore } from './model/patchStore'
import { midiEngine, type MidiInputNoteEvent } from './midi/midiEngine'
import { webAudioSynth } from './audio/webAudioSynth'
import { webSynthParameterHelp, webSynthParameters, webSynthPresets } from './model/webSynthProfile'
import { ultranovaParameters } from './model/ultranovaProfile'

describe('PatchGator', () => {
  beforeEach(() => usePatchStore.setState({
    activeProfileId: 'summit',
    profileValues: { summit: { ...defaultPatchValues } },
    values: { ...defaultPatchValues },
    summitState: {
      modMatrix: defaultModMatrix.map((slot) => ({ ...slot })),
      rawPatch: null,
      rawPatchSource: null,
    },
  }))
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('places every existing parameter once in its PEAK panel section', () => {
    render(<App />)
    expect(screen.getByRole('combobox', { name: 'Synth profile' })).toHaveDisplayValue('Novation Summit')
    expect(screen.getByRole('option', { name: 'Novation Summit' })).toHaveValue('summit')
    const behindSelector = /^(lfo[234]|modEnv2)/
    for (const parameter of summitParameters) {
      expect(document.querySelectorAll(`[id="${parameter.id}"]`)).toHaveLength(behindSelector.test(parameter.id) ? 0 : 1)
    }
    expect(within(screen.getByRole('region', { name: 'Oscillator 1' })).getByLabelText('Wave')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'LFOs' })).getByRole('combobox', { name: 'Sync rate' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Filter' })).getByLabelText('Filter resonance')).toBeInTheDocument()
    for (const label of ['Attack', 'Decay', 'Sustain', 'Release']) {
      expect(within(screen.getByRole('region', { name: 'Amp envelope' })).getByLabelText(`Amplifier envelope ${label.toLowerCase()}`)).toHaveAttribute('aria-orientation', 'vertical')
    }
    for (const name of ['Distortion', 'Chorus', 'Delay', 'Reverb']) {
      expect(within(screen.getByRole('region', { name })).getByLabelText(`${name} level`)).toBeInTheDocument()
    }
  })

  it('switches the active profile using its stable ID and keeps profile controls separate', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')

    expect(usePatchStore.getState().activeProfileId).toBe('web-synth')
    expect(screen.getByRole('region', { name: 'Built-in Web Synth' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Live audio output waveform' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Oscillator 1' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Oscillator 1 manual shape')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Synth profile' })).toHaveDisplayValue('Built-in Web Synth')
  })

  it('renders the blue UltraNova panel and edits its independent hardware controls', async () => {
    const user = userEvent.setup()
    const send = vi.spyOn(midiEngine, 'sendParameter').mockReturnValue(true)
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'ultranova')
    expect(document.querySelector('.app-shell')).toHaveClass('ultranova-theme')
    expect(screen.getByLabelText('UltraNova synth panel')).toHaveClass('peak-panel', 'ultranova-panel')
    expect(screen.getByRole('combobox', { name: 'Synth profile' })).toHaveDisplayValue('Novation UltraNova')
    expect(screen.getByRole('region', { name: 'Filters' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Fetch/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
    expect(screen.getByText(/UltraNova's 20-slot matrix/)).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Amplifier envelope attack' })).toHaveAttribute('aria-orientation', 'vertical')
    expect(screen.getByRole('img', { name: 'UltraNova amplifier envelope curve' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'UltraNova envelope 2 curve' })).toBeInTheDocument()
    const slot1 = screen.getByRole('combobox', { name: 'Slot 1 type' })
    const slot2 = screen.getByRole('combobox', { name: 'Slot 2 type' })
    await user.selectOptions(slot1, '2')
    expect(within(slot2).getByRole('option', { name: 'Compressor 1' })).toBeDisabled()
    expect(within(slot2).getByRole('option', { name: 'Bypass' })).toBeEnabled()
    await user.selectOptions(slot1, '0')
    expect(within(slot2).getByRole('option', { name: 'Compressor 1' })).toBeEnabled()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Filter 1 cutoff' }), { key: 'ArrowDown' })
    expect(usePatchStore.getState().values.filter1Cutoff).toBe(126)
    expect(send).toHaveBeenLastCalledWith('filter1Cutoff', 126)
    await user.selectOptions(within(screen.getByRole('region', { name: 'Oscillator 1' })).getByLabelText('Wave'), '13')
    expect(usePatchStore.getState().values.osc1Wave).toBe(13)
    for (const parameter of ultranovaParameters.filter((item) => !/^lfo[23]|^env[3456]/.test(item.id))) {
      expect(document.querySelectorAll(`[id="${parameter.id}"]`)).toHaveLength(1)
    }
    await user.click(screen.getByRole('button', { name: 'LFO 3' }))
    expect(screen.getByRole('slider', { name: 'LFO 3 rate' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Env 6' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Envelope 6 attack' }), { target: { value: '35' } })
    expect(send).toHaveBeenLastCalledWith('env6Attack', 35)
    expect(screen.getByRole('img', { name: 'UltraNova envelope 6 curve' })).toBeInTheDocument()
    expect(document.getElementById('ultranova-envelope-6-graph-summary')).toHaveTextContent('Attack 35')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'summit')
    expect(document.querySelector('.app-shell')).not.toHaveClass('ultranova-theme')
    expect(usePatchStore.getState().values.osc1Wave).toBe(2)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'ultranova')
    expect(usePatchStore.getState().values).toMatchObject({ osc1Wave: 13, filter1Cutoff: 126, env6Attack: 35 })
  })

  it('renders web-synth controls and applies complete presets without Summit-only actions', async () => {
    const user = userEvent.setup()
    const start = vi.spyOn(webAudioSynth, 'start').mockResolvedValue(true)
    const setParameters = vi.spyOn(webAudioSynth, 'setParameters')
    render(<App />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    expect(screen.getByRole('region', { name: 'Built-in Web Synth' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Oscillator 1' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'LFO' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Modulation matrix' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect MIDI' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Filter cutoff' })).toHaveClass('rotary-control')
    expect(screen.getByRole('group', { name: 'Oscillator 1 waveform' })).toBeInTheDocument()
    for (const oscillator of [1, 2]) {
      const level = screen.getByRole('slider', { name: `Oscillator ${oscillator} level` })
      expect(level).toHaveAttribute('type', 'range')
      expect(level).toHaveAttribute('aria-orientation', 'vertical')
      fireEvent.change(level, { target: { value: '30' } })
      expect(usePatchStore.getState().values[`osc${oscillator}Level`]).toBe(30)
      fireEvent.keyDown(level, { key: 'Delete' })
      expect(level).toHaveValue('100')
    }
    for (const section of ['Amp envelope', 'Filter envelope']) {
      const envelopeRegion = screen.getByRole('region', { name: section })
      const envelope = within(envelopeRegion)
      expect(envelope.getByRole('img', { name: /envelope curve/i })).toBeInTheDocument()
      expect(envelopeRegion.querySelector('.web-envelope-layout')).toBeInTheDocument()
      expect(envelopeRegion.querySelector('.web-envelope-graph')).toHaveAttribute('preserveAspectRatio', 'none')
      for (const stage of ['Attack', 'Decay', 'Sustain', 'Release']) {
        const suffix = section === 'Amp envelope' ? 'Amplifier' : 'Filter'
        expect(envelope.getByRole('slider', { name: `${suffix} ${stage.toLowerCase()}` })).toHaveAttribute('aria-orientation', 'vertical')
      }
    }

    await user.selectOptions(screen.getByRole('combobox', { name: 'Web synth preset' }), 'soft-pad')
    expect(usePatchStore.getState().values).toEqual(webSynthPresets[0].values)
    await waitFor(() => expect(setParameters).toHaveBeenLastCalledWith(webSynthPresets[0].values))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Filter cutoff' }), { key: 'ArrowUp' })
    expect(usePatchStore.getState().values.filterCutoff).toBe(3201)
    fireEvent.change(screen.getByRole('slider', { name: 'Amplifier attack' }), { target: { value: '1000' } })
    expect(usePatchStore.getState().values.ampAttack).toBe(1000)
    expect(screen.getByRole('img', { name: 'Amplifier envelope curve' })).toHaveAccessibleDescription(/Attack 1000/)
    expect(screen.getByRole('combobox', { name: 'Web synth preset' })).toHaveValue('')
    await waitFor(() => expect(setParameters).toHaveBeenLastCalledWith(expect.objectContaining({ filterCutoff: 3201 })))
    await user.click(screen.getByRole('button', { name: 'Start audio' }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('selects graphical waveforms independently and restores their defaults and presets', async () => {
    const user = userEvent.setup()
    const setParameters = vi.spyOn(webAudioSynth, 'setParameters')
    usePatchStore.getState().setActiveProfile('web-synth')
    render(<App />)
    const oscillator1 = within(screen.getByRole('group', { name: 'Oscillator 1 waveform' }))
    const oscillator2 = within(screen.getByRole('group', { name: 'Oscillator 2 waveform' }))

    expect(oscillator1.getAllByRole('radio')).toHaveLength(4)
    expect(oscillator1.getByRole('radio', { name: 'Sawtooth' })).toBeChecked()
    await user.click(oscillator1.getByRole('radio', { name: 'Square' }))
    await user.click(oscillator2.getByRole('radio', { name: 'Sine' }))
    expect(usePatchStore.getState().values).toMatchObject({ osc1Wave: 3, osc2Wave: 0 })
    await waitFor(() => expect(setParameters).toHaveBeenLastCalledWith(expect.objectContaining({ osc1Wave: 3, osc2Wave: 0 })))
    fireEvent.keyDown(oscillator1.getByRole('radio', { name: 'Square' }), { key: 'Delete' })
    expect(oscillator1.getByRole('radio', { name: 'Sawtooth' })).toBeChecked()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Web synth preset' }), 'soft-pad')
    expect(oscillator1.getByRole('radio', { name: 'Triangle' })).toBeChecked()
    expect(oscillator2.getByRole('radio', { name: 'Sawtooth' })).toBeChecked()
  })

  it('edits one shared filter, voice counts, LFO assignments, and contextual oscillator shape', async () => {
    const user = userEvent.setup()
    const setParameters = vi.spyOn(webAudioSynth, 'setParameters')
    const sendParameter = vi.spyOn(midiEngine, 'sendParameter')
    usePatchStore.getState().setActiveProfile('web-synth')
    render(<App />)
    expect(screen.getByRole('region', { name: 'Voice / unison' })).toBeInTheDocument()
    const filter = within(screen.getByRole('region', { name: 'Filter' }))
    expect(filter.getAllByRole('combobox')).toHaveLength(1)
    expect(filter.getAllByRole('slider')).toHaveLength(3)
    expect(screen.queryByRole('combobox', { name: 'Oscillator 2 filter type' })).not.toBeInTheDocument()
    await user.selectOptions(filter.getByRole('combobox', { name: 'Filter type' }), '1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Polyphony' }), '16')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Unison voices' }), '4')
    fireEvent.keyDown(filter.getByRole('slider', { name: 'Filter cutoff' }), { key: 'ArrowDown' })
    fireEvent.keyDown(filter.getByRole('slider', { name: 'Filter resonance' }), { key: 'ArrowUp' })
    for (const label of ['LFO pitch depth', 'LFO cutoff depth', 'LFO resonance depth']) {
      fireEvent.keyDown(screen.getByRole('slider', { name: label }), { key: 'ArrowUp' })
    }
    const shape = screen.getByRole('slider', { name: 'Oscillator 1 shape' })
    expect(shape).toHaveAttribute('aria-valuetext', '0° phase')
    await user.click(within(screen.getByRole('group', { name: 'Oscillator 1 waveform' })).getByRole('radio', { name: 'Square' }))
    expect(shape).toHaveAttribute('aria-valuetext', '50% pulse width')
    fireEvent.keyDown(shape, { key: 'ArrowDown' })
    expect(shape).toHaveAttribute('aria-valuetext', '49% pulse width')
    expect(usePatchStore.getState().values).toMatchObject({
      filterType: 1, filterCutoff: 5999,
      filterResonance: 16, polyphony: 16, unisonVoices: 4,
      lfoPitchDepth: 1, lfoFilterDepth: 1, lfoResonanceDepth: 1, osc1Shape: 49, osc2Shape: 50,
    })
    await waitFor(() => expect(setParameters).toHaveBeenLastCalledWith(usePatchStore.getState().values))
    expect(sendParameter).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Polyphony' }), { key: 'Delete' })
    expect(screen.getByRole('combobox', { name: 'Polyphony' })).toHaveDisplayValue('8 notes')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Web synth preset' }), 'round-bass')
    expect(usePatchStore.getState().values).toEqual(webSynthPresets[2].values)
    expect(screen.getByRole('combobox', { name: 'Unison voices' })).toHaveDisplayValue('1 voice')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'summit')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    expect(usePatchStore.getState().values).toEqual(webSynthPresets[2].values)
  })

  it('provides clickable conceptual help for every web synth parameter without changing the patch', async () => {
    const user = userEvent.setup()
    usePatchStore.getState().setActiveProfile('web-synth')
    render(<App />)
    const before = { ...usePatchStore.getState().values }
    for (const parameter of webSynthParameters) {
      const help = screen.getByLabelText(`${parameter.label} help`)
      expect(help).toHaveTextContent('?')
      await user.click(help)
      expect(screen.getAllByRole('tooltip')).toHaveLength(1)
      expect(screen.getByRole('tooltip')).toHaveTextContent(webSynthParameterHelp[parameter.id])
      expect(help).toHaveAccessibleDescription(`${parameter.label} ${webSynthParameterHelp[parameter.id]}`)
    }
    expect(usePatchStore.getState().values).toEqual(before)
    for (const label of ['Web synth preset', 'Audio output', 'Virtual keyboard', 'Keyboard octave', 'Velocity', 'All notes off']) {
      await user.click(screen.getByLabelText(`${label} help`))
      expect(screen.getByRole('tooltip')).toHaveTextContent(label)
    }
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'summit')
    expect(screen.queryByRole('button', { name: 'Filter cutoff help' })).not.toBeInTheDocument()
    expect(document.querySelector('.click-control-tooltip')).not.toBeInTheDocument()
  })

  it('starts and releases Web Synth notes with Enter and Space on virtual piano keys', async () => {
    const user = userEvent.setup()
    vi.spyOn(webAudioSynth, 'getSnapshot').mockReturnValue({ status: 'ready', error: null })
    const noteOn = vi.spyOn(webAudioSynth, 'noteOn').mockReturnValue(true)
    const noteOff = vi.spyOn(webAudioSynth, 'noteOff').mockReturnValue(true)
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')

    const key = screen.getByRole('button', { name: 'Play C 2' })
    key.focus()
    fireEvent.keyDown(key, { key: 'Enter' })
    expect(noteOn).toHaveBeenNthCalledWith(1, 36, 100)
    fireEvent.keyUp(key, { key: 'Enter' })
    expect(noteOff).toHaveBeenNthCalledWith(1, 36)

    fireEvent.keyDown(key, { key: ' ' })
    expect(noteOn).toHaveBeenNthCalledWith(2, 36, 100)
    fireEvent.keyUp(key, { key: ' ' })
    expect(noteOff).toHaveBeenNthCalledWith(2, 36)
  })

  it('routes virtual keyboard press, release, and panic to the active Web Audio output', async () => {
    const user = userEvent.setup()
    vi.spyOn(webAudioSynth, 'getSnapshot').mockReturnValue({ status: 'ready', error: null })
    const noteOn = vi.spyOn(webAudioSynth, 'noteOn').mockReturnValue(true)
    const noteOff = vi.spyOn(webAudioSynth, 'noteOff').mockReturnValue(true)
    const allNotesOff = vi.spyOn(webAudioSynth, 'allNotesOff').mockReturnValue(0)
    const midiNoteOn = vi.spyOn(midiEngine, 'sendNoteOn')
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')

    const key = screen.getByRole('button', { name: 'Play C 2' })
    key.setPointerCapture = vi.fn()
    fireEvent.pointerDown(key, { pointerId: 1 })
    fireEvent.pointerUp(key, { pointerId: 1 })
    fireEvent.pointerDown(key, { pointerId: 2 })
    fireEvent.pointerCancel(key, { pointerId: 2 })
    await user.click(screen.getByRole('button', { name: 'All notes off' }))

    expect(noteOn).toHaveBeenCalledWith(36, 100)
    expect(noteOn).toHaveBeenCalledTimes(2)
    expect(noteOff).toHaveBeenCalledTimes(2)
    expect(noteOff).toHaveBeenCalledWith(36)
    expect(allNotesOff).toHaveBeenCalled()
    expect(midiNoteOn).not.toHaveBeenCalled()
  })

  it('routes optional MIDI input notes to the active audio synth and releases them on input panic', async () => {
    const user = userEvent.setup()
    let onInputNote: ((event: MidiInputNoteEvent) => void) | undefined
    vi.spyOn(midiEngine, 'subscribeToInputNotes').mockImplementation((listener) => {
      onInputNote = listener
      return () => true
    })
    vi.spyOn(webAudioSynth, 'getSnapshot').mockReturnValue({ status: 'ready', error: null })
    const noteOn = vi.spyOn(webAudioSynth, 'noteOn').mockReturnValue(true)
    const noteOff = vi.spyOn(webAudioSynth, 'noteOff').mockReturnValue(true)
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    if (!onInputNote) throw new Error('Active MIDI input did not subscribe for note events')

    onInputNote({ type: 'noteOn', note: 67, velocity: 81 })
    onInputNote({ type: 'noteOff', note: 67 })
    onInputNote({ type: 'noteOn', note: 72, velocity: 100 })
    onInputNote({ type: 'allNotesOff' })

    expect(noteOn).toHaveBeenNthCalledWith(1, 67, 81)
    expect(noteOn).toHaveBeenNthCalledWith(2, 72, 100)
    expect(noteOff).toHaveBeenNthCalledWith(1, 67)
    expect(noteOff).toHaveBeenNthCalledWith(2, 72)
  })

  it('releases lost pointer capture and clears held keys when the page loses focus', async () => {
    const user = userEvent.setup()
    vi.spyOn(webAudioSynth, 'getSnapshot').mockReturnValue({ status: 'ready', error: null })
    const noteOn = vi.spyOn(webAudioSynth, 'noteOn').mockReturnValue(true)
    const noteOff = vi.spyOn(webAudioSynth, 'noteOff').mockReturnValue(true)
    const panic = vi.spyOn(webAudioSynth, 'allNotesOff').mockReturnValue(0)
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    const key = screen.getByRole('button', { name: 'Play C 2' })
    key.setPointerCapture = vi.fn()

    act(() => {
      fireEvent.pointerDown(key, { pointerId: 1 })
      fireEvent.lostPointerCapture(key, { pointerId: 1 })
    })
    expect(noteOff).toHaveBeenCalledTimes(1)
    expect(key).toHaveAttribute('aria-pressed', 'false')

    fireEvent.keyDown(key, { key: 'Enter' })
    expect(key).toHaveAttribute('aria-pressed', 'true')
    fireEvent.blur(window)
    expect(panic).toHaveBeenCalledTimes(1)
    expect(key).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(key, { key: 'Enter', repeat: true })
    expect(noteOn).toHaveBeenCalledTimes(2)
    fireEvent.keyUp(key, { key: 'Enter' })
    fireEvent.keyDown(key, { key: 'Enter' })
    expect(noteOn).toHaveBeenCalledTimes(3)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(panic).toHaveBeenCalledTimes(2)
    expect(key).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(key, { key: 'Enter' })
    fireEvent(window, new Event('pagehide'))
    expect(panic).toHaveBeenCalledTimes(3)
    expect(key).toHaveAttribute('aria-pressed', 'false')
  })

  it('clears held keyboard state on panic without restarting from key repeat', async () => {
    const user = userEvent.setup()
    vi.spyOn(webAudioSynth, 'getSnapshot').mockReturnValue({ status: 'ready', error: null })
    const noteOn = vi.spyOn(webAudioSynth, 'noteOn').mockReturnValue(true)
    vi.spyOn(webAudioSynth, 'allNotesOff').mockReturnValue(0)
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    const key = screen.getByRole('button', { name: 'Play C 2' })
    fireEvent.keyDown(key, { key: ' ' })
    await user.click(screen.getByRole('button', { name: 'All notes off' }))
    expect(key).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(key, { key: ' ', repeat: true })
    expect(noteOn).toHaveBeenCalledTimes(1)
    fireEvent.keyUp(key, { key: ' ' })
    fireEvent.keyDown(key, { key: ' ' })
    expect(noteOn).toHaveBeenCalledTimes(2)
  })

  it('releases active Web Audio keyboard notes when the keyboard resizes or collapses', async () => {
    const user = userEvent.setup()
    let resize: ResizeObserverCallback | undefined
    class KeybedObserver {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', KeybedObserver)
    vi.spyOn(webAudioSynth, 'getSnapshot').mockReturnValue({ status: 'ready', error: null })
    vi.spyOn(webAudioSynth, 'noteOn').mockReturnValue(true)
    const allNotesOff = vi.spyOn(webAudioSynth, 'allNotesOff').mockReturnValue(0)
    const { container } = render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')

    const highKey = screen.getByRole('button', { name: 'Play C 7' })
    highKey.setPointerCapture = vi.fn()
    fireEvent.pointerDown(highKey, { pointerId: 1 })
    const bed = container.querySelector('.piano-bed')
    if (!bed || !resize) throw new Error('Keyboard resize observer was not initialized')
    const callback = resize
    act(() => callback([{
      target: bed,
      contentRect: new DOMRect(0, 0, 292, 98),
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    }], new KeybedObserver(callback)))
    expect(allNotesOff).toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /^Play / })).toHaveLength(13)

    const lowKey = screen.getByRole('button', { name: 'Play C 2' })
    lowKey.setPointerCapture = vi.fn()
    fireEvent.pointerDown(lowKey, { pointerId: 2 })
    await user.click(screen.getByRole('button', { name: 'Virtual keyboard' }))
    expect(allNotesOff).toHaveBeenCalledTimes(2)
    expect(lowKey).not.toBeVisible()
  })

  it('marks unsupported PEAK sections without offering non-working controls', () => {
    render(<App />)
    for (const name of ['Master / Animate', 'Arp']) {
      const section = within(screen.getByRole('region', { name }))
      expect(section.getByText('Not yet implemented')).toBeInTheDocument()
      expect(section.queryByRole('slider')).not.toBeInTheDocument()
      expect(section.getAllByRole('button')).toHaveLength(1)
      expect(section.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'true')
      expect(section.queryByRole('combobox')).not.toBeInTheDocument()
    }
    expect(screen.getByText(/Independent A\/B layer editing is not yet implemented/)).toBeInTheDocument()
  })

  it('offers documented oscillator, mixer, and filter sound controls', () => {
    render(<App />)
    for (const oscillator of [1, 2, 3]) {
      const section = within(screen.getByRole('region', { name: `Oscillator ${oscillator}` }))
      expect(section.getByLabelText('Wave')).toBeInTheDocument()
      expect(section.getByLabelText('Range')).toHaveDisplayValue("8'")
      for (const control of ['coarse tuning', 'fine tuning', 'manual shape']) {
        expect(section.getByRole('slider', { name: `Oscillator ${oscillator} ${control}` })).toBeInTheDocument()
      }
    }
    const mixer = within(screen.getByRole('region', { name: 'Mixer' }))
    for (const control of ['Oscillator 1 level', 'Oscillator 2 level', 'Oscillator 3 level', 'Ring modulator level', 'Noise level', 'VCA level']) {
      expect(mixer.getByRole('slider', { name: control })).toBeInTheDocument()
    }
    const filter = within(screen.getByRole('region', { name: 'Filter' }))
    for (const control of ['Filter frequency', 'Filter key tracking', 'Filter post drive']) {
      expect(filter.getByRole('slider', { name: control })).toBeInTheDocument()
    }
    expect(filter.getByRole('slider', { name: 'Filter frequency' })).toHaveClass('large')
    expect(filter.getByRole('slider', { name: 'Filter resonance' })).not.toHaveClass('large')
    expect(filter.getByLabelText('Slope')).toBeInTheDocument()
  })

  it('enables dual filter combination and separation only in dual mode', async () => {
    const user = userEvent.setup()
    const send = vi.spyOn(midiEngine, 'sendParameter').mockReturnValue(true)
    render(<App />)
    const filter = within(screen.getByRole('region', { name: 'Filter' }))
    const combination = filter.getByLabelText('Combination')
    const separation = filter.getByLabelText('Dual filter separation')
    expect(combination).not.toBeVisible()
    expect(separation).not.toBeVisible()
    expect(combination).toBeDisabled()
    expect(separation).toHaveAttribute('aria-disabled', 'true')

    await user.selectOptions(filter.getByLabelText('Shape'), 'Dual')
    expect(send).toHaveBeenCalledWith('filterShape', 3)
    expect(combination).toBeEnabled()
    expect(combination).toBeVisible()
    expect(separation).toBeVisible()
    expect(separation).not.toHaveAttribute('aria-disabled')

    await user.selectOptions(combination, 'LP + HP')
    expect(send).toHaveBeenCalledWith('filterDualType', 3)
    await user.selectOptions(filter.getByLabelText('Shape'), 'Low-pass')
    expect(combination).not.toBeVisible()
    await user.selectOptions(filter.getByLabelText('Shape'), 'Dual')
    expect(combination).toHaveDisplayValue('LP + HP')
  })

  it('exposes menu-only voice and oscillator settings in tabs', async () => {
    const user = userEvent.setup()
    render(<App />)
    const menus = within(screen.getByRole('region', { name: 'Voice & oscillator menus' }))
    expect(menus.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true')
    expect(menus.getByLabelText('Mode')).toHaveDisplayValue('Poly')
    expect(menus.getByLabelText('Unison')).toHaveDisplayValue('1')
    expect(menus.getByLabelText('Spread mode')).toHaveDisplayValue('Diverge')
    expect(menus.getByRole('slider', { name: 'Pre-glide' })).toHaveAttribute('aria-valuetext', '0')
    expect(menus.getByRole('slider', { name: 'Unison detune' })).toBeInTheDocument()
    expect(menus.queryByRole('slider', { name: 'Oscillator 2 bend range' })).not.toBeInTheDocument()

    await user.click(menus.getByRole('tab', { name: 'Osc 2' }))
    expect(menus.getByRole('combobox', { name: 'Wavetable' })).toHaveDisplayValue('BS Sine')
    expect(menus.getByRole('combobox', { name: 'Fixed note' })).toHaveDisplayValue('Off')
    for (const control of ['saw density', 'density detune', 'bend range', 'virtual sync']) {
      expect(menus.getByRole('slider', { name: `Oscillator 2 ${control}` })).toBeInTheDocument()
    }
    expect(menus.getByRole('slider', { name: 'Oscillator 2 bend range' })).toHaveAttribute('aria-valuetext', '+12')
    expect(menus.queryByRole('slider', { name: 'Unison detune' })).not.toBeInTheDocument()

    await user.click(menus.getByRole('tab', { name: 'Osc common' }))
    expect(menus.getByRole('slider', { name: 'Oscillator divergence' })).toBeVisible()
    expect(menus.getByRole('slider', { name: 'Oscillator drift' })).toBeVisible()
    await user.click(menus.getByRole('tab', { name: 'Osc 2' }))
    menus.getByRole('tab', { name: 'Osc 2' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(menus.getByRole('tab', { name: 'Osc 3' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches between four LFOs and gates rate against sync rate by range', async () => {
    const user = userEvent.setup()
    const sendParameter = vi.spyOn(midiEngine, 'sendParameter').mockReturnValue(false)
    render(<App />)

    const lfoPanel = within(screen.getByRole('region', { name: 'LFOs' }))
    expect(lfoPanel.getByRole('button', { name: 'LFO 1' })).toHaveAttribute('aria-pressed', 'true')
    const syncRate = lfoPanel.getByRole('combobox', { name: 'Sync rate' })
    expect(syncRate).toBeDisabled()
    expect(syncRate).toHaveDisplayValue('8 beats')
    expect(lfoPanel.getByRole('slider', { name: 'LFO 1 rate' })).not.toHaveAttribute('aria-disabled')
    expect(lfoPanel.getByRole('combobox', { name: 'Phase' })).toHaveDisplayValue('Free')

    await user.selectOptions(lfoPanel.getByRole('combobox', { name: 'Range' }), 'Sync')
    expect(sendParameter).toHaveBeenCalledWith('lfo1Range', 2)
    expect(lfoPanel.getByRole('combobox', { name: 'Sync rate' })).toBeEnabled()
    expect(lfoPanel.getByRole('slider', { name: 'LFO 1 rate' })).toHaveAttribute('aria-disabled', 'true')

    await user.click(lfoPanel.getByRole('button', { name: 'LFO 2' }))
    expect(lfoPanel.getByRole('slider', { name: 'LFO 2 rate' })).toBeInTheDocument()
    expect(lfoPanel.getByRole('combobox', { name: 'Sync rate' })).toBeDisabled()

    for (const lfo of [3, 4]) {
      await user.click(lfoPanel.getByRole('button', { name: `LFO ${lfo}` }))
      expect(lfoPanel.getByRole('button', { name: `LFO ${lfo}` })).toHaveAttribute('aria-pressed', 'true')
      expect(lfoPanel.getByRole('slider', { name: `LFO ${lfo} slew` })).toBeInTheDocument()
      expect(lfoPanel.queryByRole('combobox', { name: 'Wave' })).not.toBeInTheDocument()
      expect(lfoPanel.getByRole('button', { name: 'LFOs help' })).toHaveAccessibleDescription(`LFO ${lfo} wave and rate have no published MIDI address, so only phase, slew and fade time are editable.`)
    }
  })

  it('edits mod envelopes, glide and filter modulation depths', async () => {
    const user = userEvent.setup()
    const sendParameter = vi.spyOn(midiEngine, 'sendParameter').mockReturnValue(false)
    render(<App />)

    const modEnv = within(screen.getByRole('region', { name: 'Mod envelopes' }))
    expect(modEnv.getByLabelText('Mod envelope 1 attack')).toHaveAttribute('aria-orientation', 'vertical')
    expect(modEnv.getByRole('combobox', { name: 'MonoTrig' })).toHaveDisplayValue('Re-Trig')
    await user.click(modEnv.getByRole('button', { name: 'Mod env 2' }))
    expect(modEnv.getByRole('button', { name: 'Mod env 2' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(modEnv.getByLabelText('Mod envelope 2 decay'), { target: { value: '100' } })
    expect(sendParameter).toHaveBeenCalledWith('modEnv2Decay', 100)
    expect(modEnv.queryByLabelText('Mod envelope 1 attack')).not.toBeInTheDocument()

    const glide = within(screen.getByRole('region', { name: 'Glide' }))
    await user.selectOptions(glide.getByRole('combobox', { name: 'Glide' }), 'On')
    expect(sendParameter).toHaveBeenCalledWith('glideOn', 1)
    expect(glide.getByRole('slider', { name: 'Glide time' })).toBeInTheDocument()

    const filter = within(screen.getByRole('region', { name: 'Filter' }))
    expect(filter.getByRole('slider', { name: 'LFO 1 to filter frequency depth' })).toHaveAttribute('aria-valuetext', '0')
    expect(filter.getByRole('slider', { name: 'Oscillator 3 to filter frequency depth' })).toHaveAttribute('aria-valuetext', '0')
    expect(filter.queryByText('Not yet implemented')).not.toBeInTheDocument()

    const amp = within(screen.getByRole('region', { name: 'Amp envelope' }))
    expect(amp.getByRole('combobox', { name: 'MonoTrig' })).toHaveDisplayValue('Legato')
    expect(within(screen.getByRole('region', { name: 'Oscillator 2' })).getByRole('slider', { name: /Oscillator 2 mod envelope 2 to pitch/i })).toHaveAttribute('aria-valuetext', '0')
  })

  it('preserves parameter MIDI sends after rearranging controls', () => {
    const sendParameter = vi.spyOn(midiEngine, 'sendParameter').mockReturnValue(false)
    render(<App />)
    const resonance = screen.getByRole('slider', { name: 'Filter resonance' })
    fireEvent.pointerDown(resonance, { pointerId: 1, clientY: 100 })
    fireEvent.pointerMove(resonance, { pointerId: 1, clientY: 60 })
    expect(usePatchStore.getState().values.filterResonance).toBe(42)
    expect(sendParameter).toHaveBeenCalledWith('filterResonance', 42)
  })

  it('supports keyboard operation for rotary controls while keeping ADSR sliders', () => {
    render(<App />)
    const resonance = screen.getByRole('slider', { name: 'Filter resonance' })
    fireEvent.keyDown(resonance, { key: 'ArrowUp' })
    expect(resonance).toHaveAttribute('aria-valuenow', '1')
    fireEvent.keyDown(resonance, { key: 'End' })
    expect(resonance).toHaveAttribute('aria-valuenow', '127')
    expect(screen.getByLabelText('Amplifier envelope attack')).toHaveAttribute('type', 'range')
  })

  it('renders an offline editor with grouped documented controls', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'PatchGator' })).toBeInTheDocument()
    expect(screen.getByText('Offline editor')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter resonance')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /amplifier envelope/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Mod envelope 1 curve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect midi/i })).toBeDisabled()
  })

  it('edits and resets values without hardware', async () => {
    const user = userEvent.setup()
    render(<App />)
    const attack = screen.getByLabelText('Amplifier envelope attack')
    const initialAttack = defaultPatchValues.ampAttack
    fireEvent.change(attack, { target: { value: initialAttack + 2 } })
    expect(usePatchStore.getState().values.ampAttack).toBe(initialAttack + 2)
    const resetButton = screen.getByRole('button', { name: /reset defaults/i })
    resetButton.focus()
    await user.keyboard('{Enter}')
    expect(usePatchStore.getState().values).toEqual(defaultPatchValues)
    expect(screen.getByText('Defaults restored locally.')).toBeInTheDocument()
  })

  it('keeps raw patch actions unavailable until data exists', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled()
    expect(screen.queryByText(/fetch framing is experimental/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fetch/i })).toHaveAttribute('title', 'Experimental: request the Summit edit buffer')
  })

  it('moves control helper text to described tooltips and toggles MIDI debugging', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(document.querySelector('.module-note')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dual filter help' })).not.toBeInTheDocument()
    const addresses = [...document.querySelectorAll('.midi-address')]
    expect(addresses.length).toBeGreaterThan(0)
    expect(document.querySelector('.app-shell')).not.toHaveClass('debug-mode')
    const debug = screen.getByRole('button', { name: 'Debug' })
    expect(screen.queryByRole('region', { name: 'Debug diagnostics' })).not.toBeInTheDocument()
    await user.click(debug)
    expect(debug).toHaveAttribute('aria-pressed', 'true')
    expect(debug).toHaveAttribute('aria-controls', 'debug-panel')
    expect(screen.getByRole('region', { name: 'Debug diagnostics' })).toHaveTextContent('Novation Summit')
    expect(document.querySelector('.app-shell')).toHaveClass('debug-mode')
    await user.click(debug)
    expect(debug).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Debug diagnostics' })).not.toBeInTheDocument()
    await user.selectOptions(within(screen.getByRole('region', { name: 'Filter' })).getByLabelText('Shape'), 'Dual')
    const help = screen.getByRole('button', { name: 'Dual filter help' })
    expect(help).toHaveAccessibleDescription(/runs in series/)
    help.focus()
    await user.keyboard('{Escape}')
    expect(document.getElementById(help.getAttribute('aria-describedby')!)).toHaveClass('dismissed')
  })

  it('shows live Web Synth diagnostics without starting engines and follows profile changes', async () => {
    const user = userEvent.setup()
    const start = vi.spyOn(webAudioSynth, 'start')
    const connect = vi.spyOn(midiEngine, 'connect')
    vi.spyOn(webAudioSynth, 'getSnapshot').mockReturnValue({ status: 'error', error: 'Audio device unavailable.' })
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    await user.click(screen.getByRole('button', { name: 'Debug' }))
    const diagnostics = screen.getByRole('region', { name: 'Debug diagnostics' })
    expect(diagnostics).toHaveTextContent('Built-in Web Synth')
    expect(diagnostics).toHaveTextContent('Audio status')
    expect(diagnostics).toHaveTextContent('Audio device unavailable.')
    expect(diagnostics).toHaveTextContent('No input selected')
    expect(diagnostics).not.toHaveTextContent('MIDI output')
    expect(diagnostics).toHaveTextContent('not MIDI CC or NRPN output')
    await user.click(within(diagnostics).getByText(/^Parameter values/))
    const rawValues = within(diagnostics).getByRole('table')
    expect(within(rawValues).getAllByRole('row')).toHaveLength(webSynthParameters.length + 1)
    const cutoff = within(rawValues).getByRole('rowheader', { name: 'filterCutoff' }).closest('tr')!
    act(() => usePatchStore.getState().setValue('filterCutoff', 1234))
    expect(within(cutoff).getByRole('cell')).toHaveTextContent('1234')
    act(() => midiEngine.setChannel(7))
    expect(within(diagnostics).getByText('MIDI channel').nextElementSibling).toHaveTextContent('7')
    expect(start).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'ultranova')
    expect(diagnostics).toHaveTextContent('Novation UltraNova')
    expect(diagnostics).toHaveTextContent('No output selected')
    expect(diagnostics).not.toHaveTextContent('Audio status')
    expect(diagnostics).not.toHaveTextContent('Audio device unavailable.')
    expect(diagnostics).toHaveTextContent('CC and NRPN addresses are also shown')
    await user.click(screen.getByRole('button', { name: 'Debug' }))
    expect(screen.queryByRole('region', { name: 'Debug diagnostics' })).not.toBeInTheDocument()
    act(() => midiEngine.setChannel(1))
  })

  it('collapses sections independently without losing values or selector choices', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const name of ['Oscillator 1', 'Oscillator 2', 'Oscillator 3', 'Mixer', 'Filter', 'Amp envelope', 'Mod envelopes', 'LFOs', 'Voice & oscillator menus', 'Patch transfer', 'Effects', 'Distortion', 'Chorus', 'Delay', 'Reverb', 'Glide', 'Arp', 'Master / Animate', 'Virtual keyboard']) {
      const section = within(screen.getByRole('region', { name }))
      const toggle = section.getByRole('button', { name })
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      for (const id of toggle.getAttribute('aria-controls')!.split(' ')) {
        expect(document.getElementById(id)).not.toBeVisible()
      }
      await user.keyboard('{Enter}')
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
    }
    const coarse = screen.getByRole('slider', { name: 'Oscillator 1 coarse tuning' })
    fireEvent.keyDown(coarse, { key: 'ArrowUp' })
    await user.click(screen.getByRole('button', { name: 'Oscillator 1' }))
    expect(screen.getByRole('slider', { name: 'Oscillator 2 coarse tuning' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Oscillator 1' }))
    expect(coarse).toHaveAttribute('aria-valuetext', '+1')
    await user.click(screen.getByRole('button', { name: 'LFO 2' }))
    await user.click(screen.getByRole('button', { name: 'LFOs' }))
    await user.click(screen.getByRole('button', { name: 'LFOs' }))
    expect(screen.getByRole('button', { name: 'LFO 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('displays signed coarse and fine tuning without changing their MIDI ranges', () => {
    const sendParameter = vi.spyOn(midiEngine, 'sendParameter').mockReturnValue(false)
    render(<App />)
    for (const oscillator of [1, 2, 3]) {
      for (const tuning of ['coarse', 'fine']) {
        const control = screen.getByRole('slider', { name: `Oscillator ${oscillator} ${tuning} tuning` })
        expect(control).toHaveAttribute('aria-valuenow', '64')
        expect(control).toHaveAttribute('aria-valuetext', '0')
        expect(control.querySelector('.rotary-indicator')).toHaveStyle({ transform: 'rotate(0deg)' })
        fireEvent.keyDown(control, { key: 'Home' })
        expect(control).toHaveAttribute('aria-valuetext', tuning === 'coarse' ? '-64' : '-50')
        expect(sendParameter).toHaveBeenLastCalledWith(`osc${oscillator}${tuning === 'coarse' ? 'Coarse' : 'Fine'}`, tuning === 'coarse' ? 0 : 14)
        fireEvent.keyDown(control, { key: 'End' })
        expect(control).toHaveAttribute('aria-valuetext', tuning === 'coarse' ? '+63' : '+50')
        expect(sendParameter).toHaveBeenLastCalledWith(`osc${oscillator}${tuning === 'coarse' ? 'Coarse' : 'Fine'}`, tuning === 'coarse' ? 127 : 114)
      }
    }
  })

  it('resets knobs, faders and selectors individually on double-click or Delete', () => {
    const sendParameter = vi.spyOn(midiEngine, 'sendParameter').mockReturnValue(false)
    usePatchStore.setState({ values: { ...defaultPatchValues, osc1Coarse: 90, ampDecay: 12, osc1Wave: 0, filterDualType: 5 } })
    render(<App />)
    const coarse = screen.getByRole('slider', { name: 'Oscillator 1 coarse tuning' })
    fireEvent.doubleClick(coarse)
    expect(coarse).toHaveAttribute('aria-valuetext', '0')
    expect(sendParameter).toHaveBeenLastCalledWith('osc1Coarse', 64)
    const decay = screen.getByLabelText('Amplifier envelope decay')
    fireEvent.doubleClick(decay)
    expect(decay).toHaveValue(String(defaultPatchValues.ampDecay))
    expect(sendParameter).toHaveBeenLastCalledWith('ampDecay', defaultPatchValues.ampDecay)
    const wave = within(screen.getByRole('region', { name: 'Oscillator 1' })).getByLabelText('Wave')
    fireEvent.doubleClick(wave)
    expect(wave).toHaveDisplayValue('Saw')
    expect(sendParameter).toHaveBeenLastCalledWith('osc1Wave', defaultPatchValues.osc1Wave)
    fireEvent.keyDown(coarse, { key: 'ArrowUp' })
    fireEvent.keyDown(coarse, { key: 'Delete' })
    expect(coarse).toHaveAttribute('aria-valuetext', '0')
    expect(usePatchStore.getState().values.filterResonance).toBe(defaultPatchValues.filterResonance)
    sendParameter.mockClear()
    fireEvent.doubleClick(screen.getByLabelText('Combination'))
    fireEvent.keyDown(screen.getByLabelText('Combination'), { key: 'Delete' })
    expect(usePatchStore.getState().values.filterDualType).toBe(5)
    expect(sendParameter).not.toHaveBeenCalled()
  })

  it('visualizes the selected mod envelope and responds to ADSR edits', async () => {
    const user = userEvent.setup()
    render(<App />)
    const graph = screen.getByRole('img', { name: 'Mod envelope 1 curve' })
    const original = graph.querySelector('.envelope-line')?.getAttribute('d')
    fireEvent.change(screen.getByLabelText('Mod envelope 1 attack'), { target: { value: '100' } })
    expect(graph.querySelector('.envelope-line')?.getAttribute('d')).not.toBe(original)
    expect(graph).toHaveAccessibleDescription(/Attack 100/)
    await user.click(screen.getByRole('button', { name: 'Mod env 2' }))
    const second = screen.getByRole('img', { name: 'Mod envelope 2 curve' })
    fireEvent.change(screen.getByLabelText('Mod envelope 2 sustain'), { target: { value: '25' } })
    expect(second).toHaveAccessibleDescription(/sustain 25/)
    expect(screen.getByRole('img', { name: 'Amplifier envelope curve' })).toHaveAccessibleDescription(/sustain 127/)
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('edits all 16 modulation slots and sends their NRPN assignments', () => {
    const send = vi.spyOn(midiEngine, 'sendModMatrixValue').mockReturnValue(true)
    render(<App />)

    const matrix = within(screen.getByRole('region', { name: 'Modulation matrix' }))
    const matrixToggle = matrix.getByRole('button', { name: 'Modulation matrix' })
    expect(matrixToggle).toHaveAttribute('aria-expanded', 'false')
    expect(matrix.getByText('16 SLOTS / VERIFY MAPPING')).toBeInTheDocument()
    fireEvent.click(matrixToggle)
    const slots = matrix.getByRole('group', { name: 'Select modulation slot' })
    expect(within(slots).getAllByRole('button')).toHaveLength(16)
    expect(matrix.getByRole('combobox', { name: 'Slot 1 source A' })).toHaveValue('0')
    expect(matrix.getByRole('slider', { name: 'Slot 1 depth' })).toHaveAttribute('aria-valuetext', '0')
    expect(matrix.getByRole('combobox', { name: 'Slot 1 source A' }).querySelectorAll('option')).toHaveLength(modMatrixSources.length)
    expect(matrix.getByRole('combobox', { name: 'Slot 1 destination' }).querySelectorAll('option')).toHaveLength(modMatrixDestinations.length)
    expect(matrix.getByText(/community-documented, not published by Novation/i)).toBeInTheDocument()

    fireEvent.change(matrix.getByRole('combobox', { name: 'Slot 1 source A' }), { target: { value: '7' } })
    fireEvent.change(matrix.getByRole('combobox', { name: 'Slot 1 source B' }), { target: { value: '10' } })
    fireEvent.change(matrix.getByRole('combobox', { name: 'Slot 1 destination' }), { target: { value: '18' } })
    fireEvent.change(matrix.getByRole('slider', { name: 'Slot 1 depth' }), { target: { value: '80' } })

    expect(send).toHaveBeenNthCalledWith(1, 0, 'sourceA', 7)
    expect(send).toHaveBeenNthCalledWith(2, 0, 'sourceB', 10)
    expect(send).toHaveBeenNthCalledWith(3, 0, 'destination', 18)
    expect(send).toHaveBeenNthCalledWith(4, 0, 'depth', 80)
    expect(matrix.getByRole('slider', { name: 'Slot 1 depth' })).toHaveAttribute('aria-valuetext', '+16')
    expect(usePatchStore.getState().summitState.modMatrix[0]).toEqual({ sourceA: 7, sourceB: 10, depth: 80, destination: 18 })

    fireEvent.click(matrix.getByRole('button', { name: 'Modulation slot 16' }))
    expect(matrix.getByRole('button', { name: 'Modulation slot 16' })).toHaveAttribute('aria-pressed', 'true')
    expect(matrix.getByRole('combobox', { name: 'Slot 16 source A' })).toHaveValue('0')
    fireEvent.click(matrix.getByRole('button', { name: 'Modulation slot 1' }))
    expect(matrix.getByRole('combobox', { name: 'Slot 1 source A' })).toHaveValue('7')
  })

  it('renders an offline virtual keyboard with octave and velocity controls', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { name: /virtual keyboard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play C 2' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /^Play / })).toHaveLength(61)
    expect(screen.getByRole('button', { name: 'Play C 7' })).toBeDisabled()
    expect(screen.getByText('Select a MIDI output to play.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /decrease octave/i }))
    expect(screen.getByText('Octave 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decrease octave/i })).toBeDisabled()
    expect(screen.getByLabelText('Velocity')).toHaveValue('100')
    await user.click(screen.getByRole('button', { name: /increase octave/i }))
    expect(screen.getByText('Octave 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /increase octave/i }))
    await user.click(screen.getByRole('button', { name: /increase octave/i }))
    expect(screen.getByText('Octave 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase octave/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Play C 9' })).toBeDisabled()
  })
})
