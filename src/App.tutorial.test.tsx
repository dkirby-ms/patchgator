import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { usePatchStore } from './model/patchStore'
import { webSynthDefaultValues, webSynthParameters } from './model/webSynthProfile'
import { subtractiveLessons, tutorialDismissedStorageKey, tutorialInitialValues, tutorialSaveLesson } from './model/subtractiveTutorial'
import { readWebSynthPresets, webSynthPresetStorageKey } from './model/webSynthPresetStorage'
import { webAudioSynth } from './audio/webAudioSynth'
import { envelopeSliderMax, envelopeTimeToPosition } from './model/envelopeSliderScale'

describe('subtractive synthesis tutorial', () => {
  beforeEach(() => {
    localStorage.clear()
    usePatchStore.getState().setActiveProfile('web-synth')
    usePatchStore.getState().applyProfileValues('web-synth', webSynthDefaultValues)
    vi.spyOn(webAudioSynth, 'allNotesOff')
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('recalls legacy presets as a single-filter patch and saves the migrated recipe', async () => {
    const user = userEvent.setup()
    const values = { ...webSynthDefaultValues, filterType: 1, filterCutoff: 1700, filterResonance: 30 }
    const legacy = {
      id: 'user-legacy', name: 'Legacy bass',
      values: { ...values, filter2Type: 2, filter2Cutoff: 4000, filter2Resonance: 60 },
    }
    const raw = JSON.stringify([legacy])
    localStorage.setItem(webSynthPresetStorageKey, raw)
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Web synth preset' }), legacy.id)
    expect(usePatchStore.getState().values).toEqual(values)
    expect(screen.getByRole('slider', { name: 'Filter cutoff' })).toHaveAttribute('aria-valuenow', '1700')
    expect(screen.getByRole('combobox', { name: 'Filter type' })).toHaveDisplayValue('HP')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBe(raw)
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Shared filter bass')
    await user.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(readWebSynthPresets().map((preset) => preset.values)).toEqual([values, values])
    expect(JSON.parse(localStorage.getItem(webSynthPresetStorageKey)!)[0].values).toEqual(values)
  })

  it('accepts exact keyboard values, rejects invalid edits, and keeps sliders synchronized', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Edit filter cutoff value:/ }))
    let cutoff = screen.getByRole('spinbutton', { name: 'Filter cutoff value' })
    expect(cutoff).toHaveFocus()
    await user.clear(cutoff)
    await user.type(cutoff, '1500{Enter}')
    expect(usePatchStore.getState().values.filterCutoff).toBe(1500)
    expect(screen.getByRole('slider', { name: 'Filter cutoff' })).toHaveAttribute('aria-valuenow', '1500')
    await user.click(screen.getByRole('button', { name: /^Edit filter cutoff value:/ }))
    cutoff = screen.getByRole('spinbutton', { name: 'Filter cutoff value' })
    await user.clear(cutoff)
    await user.type(cutoff, '12001{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 100 to 12000')
    expect(cutoff).toHaveAttribute('aria-invalid', 'true')
    expect(usePatchStore.getState().values.filterCutoff).toBe(1500)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: /^Edit filter cutoff value:/ })).toHaveTextContent('1500 Hz')
    await user.click(screen.getByRole('button', { name: /^Edit filter cutoff value:/ }))
    cutoff = screen.getByRole('spinbutton', { name: 'Filter cutoff value' })
    await user.clear(cutoff)
    await user.keyboard('{Enter}')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /^Edit oscillator 2 detune value:/ }))
    const detune = screen.getByRole('spinbutton', { name: 'Oscillator 2 detune value' })
    await user.clear(detune)
    await user.type(detune, '-7')
    await user.tab()
    expect(usePatchStore.getState().values.osc2Detune).toBe(-7)
    await user.click(screen.getByRole('button', { name: /^Edit amplifier attack value:/ }))
    const attack = screen.getByRole('spinbutton', { name: 'Amplifier attack value' })
    await user.clear(attack)
    await user.type(attack, '25{Enter}')
    expect(screen.getByRole('slider', { name: 'Amplifier attack' })).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByRole('slider', { name: 'Amplifier attack' })).toHaveValue(String(envelopeTimeToPosition(25, 20000)))
    fireEvent.change(screen.getByRole('slider', { name: 'Amplifier attack' }), { target: { value: String(envelopeTimeToPosition(50, 20000)) } })
    expect(screen.getByRole('button', { name: /^Edit amplifier attack value:/ })).toHaveTextContent('50 ms')
    await user.click(screen.getByRole('button', { name: /^Edit amplifier attack value:/ }))
    await user.keyboard('{Control>}a{/Control}{Delete}')
    expect(usePatchStore.getState().values.ampAttack).toBe(50)
    await user.keyboard('{Escape}')
  })

  it('displays real envelope durations while editing milliseconds and sustain percentages', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const prefix of ['Amplifier', 'Filter']) {
      for (const [stage, maximum] of Object.entries({ attack: 20000, decay: 22000, release: 30000 })) {
        const slider = screen.getByRole('slider', { name: `${prefix} ${stage}` })
        expect(slider).toHaveAttribute('max', String(envelopeSliderMax))
        expect(slider).toHaveAttribute('aria-valuemax', String(maximum))
        fireEvent.change(slider, { target: { value: String(envelopeSliderMax) } })
        expect(slider).toHaveAttribute('aria-valuetext', `${maximum / 1000} s`)
        const button = screen.getByRole('button', { name: new RegExp(`^Edit ${prefix.toLowerCase()} ${stage} value:`) })
        expect(button).toHaveTextContent(`${maximum / 1000} s`)
        await user.click(button)
        const input = screen.getByRole('spinbutton', { name: `${prefix} ${stage} value` })
        expect(input).toHaveValue(maximum)
        expect(input).toHaveAttribute('aria-description', expect.stringContaining('milliseconds'))
        expect(screen.getByText('Milliseconds (ms)')).toBeVisible()
        await user.clear(input)
        await user.type(input, '1500{Enter}')
        expect(slider).toHaveAttribute('aria-valuenow', '1500')
        expect(slider).toHaveAttribute('aria-valuetext', '1.5 s')
        fireEvent.change(slider, { target: { value: String(envelopeTimeToPosition(999, maximum)) } })
        expect(slider).toHaveAttribute('aria-valuetext', '999 ms')
        fireEvent.keyDown(slider, { key: 'Delete' })
      }
      const sustain = screen.getByRole('slider', { name: `${prefix} sustain` })
      expect(sustain).toHaveAttribute('max', '100')
      fireEvent.change(sustain, { target: { value: '100' } })
      expect(sustain).toHaveAttribute('aria-valuetext', '100%')
    }
  })

  it('keeps filter tone controls together and adjusts short and long envelope times at different precision', async () => {
    const user = userEvent.setup()
    render(<App />)
    const filter = screen.getByRole('region', { name: 'Filter' })
    const toneControls = filter.querySelector<HTMLElement>('.web-filter-tone-controls')!
    expect(within(toneControls).getAllByRole('slider').map((slider) => slider.getAttribute('aria-label')))
      .toEqual(['Filter cutoff', 'Filter envelope amount', 'Filter resonance'])
    expect(within(filter).getByRole('combobox', { name: 'Filter type' })).toBeInTheDocument()
    expect(within(toneControls).queryByRole('combobox')).not.toBeInTheDocument()
    for (const [prefix, label] of [['amp', 'Amplifier'], ['filter', 'Filter']] as const) {
      const slider = screen.getByRole('slider', { name: `${label} attack` })
      slider.focus()
      await user.keyboard('{Home}{ArrowUp}')
      expect(usePatchStore.getState().values[`${prefix}Attack`]).toBe(1)
      await user.keyboard('{ArrowDown}')
      expect(usePatchStore.getState().values[`${prefix}Attack`]).toBe(0)
      await user.keyboard('{End}{ArrowDown}')
      expect(usePatchStore.getState().values[`${prefix}Attack`]).toBe(19960)
      await user.keyboard('{ArrowUp}')
      expect(usePatchStore.getState().values[`${prefix}Attack`]).toBe(20000)
      await user.keyboard('{PageDown}')
      expect(usePatchStore.getState().values[`${prefix}Attack`]).toBe(18050)
      await user.keyboard('{PageUp}')
      expect(usePatchStore.getState().values[`${prefix}Attack`]).toBe(20000)
      await user.keyboard('{Delete}')
      expect(usePatchStore.getState().values[`${prefix}Attack`]).toBe(webSynthDefaultValues[`${prefix}Attack`])
    }
    const sustain = screen.getByRole('slider', { name: 'Amplifier sustain' })
    fireEvent.change(sustain, { target: { value: '37' } })
    expect(usePatchStore.getState().values.ampSustain).toBe(37)
    expect(sustain).toHaveValue('37')
  })

  it('presents every challenge with structured actions, listening guidance, an accessible sketch, and a current step', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    const tutorial = within(screen.getByRole('region', { name: 'Subtractive synthesis tutorial' }))
    const targets: Readonly<Record<string, number>>[] = [
      { osc1Wave: 2 },
      { osc2Level: 25, osc2Detune: 3 },
      { filterCutoff: 350, filterResonance: 20 },
      { ampAttack: 5, ampDecay: 250, ampSustain: 10, ampRelease: 80 },
      { filterEnvelopeAmount: 35, filterAttack: 0, filterDecay: 180, filterSustain: 0, filterRelease: 80 },
      { lfoRate: 4, lfoPitchDepth: 0 },
    ]
    for (const [step, lesson] of [...subtractiveLessons, tutorialSaveLesson].entries()) {
      for (const heading of ['Learn', 'See the idea', 'Try it', 'Listen for']) {
        expect(tutorial.getByRole('heading', { name: heading, level: 4 })).toBeInTheDocument()
      }
      expect(tutorial.getByText(lesson.takeaway)).toBeInTheDocument()
      expect(tutorial.getByText(lesson.listen)).toBeInTheDocument()
      for (const action of lesson.challenge) expect(tutorial.getByText(action).tagName).toBe('LI')
      expect(tutorial.getByRole('img')).toHaveAccessibleDescription(lesson.visualCaption)
      expect(tutorial.getByRole('img')).toHaveAccessibleName()
      const steps = within(tutorial.getByRole('list', { name: 'Tutorial steps' })).getAllByRole('listitem')
      expect(steps).toHaveLength(7)
      expect(steps[step]).toHaveAttribute('aria-current', 'step')
      expect(steps.filter((item) => item.hasAttribute('aria-current'))).toHaveLength(1)
      expect(tutorial.getByText(`${step} of 7 steps complete`)).toBeInTheDocument()
      expect(tutorial.queryByText(/badge|\bXP\b/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
      for (const [index, item] of steps.entries()) {
        expect(item).toHaveTextContent(index < step ? 'Completed' : index === step ? 'Current' : 'Pending')
        if (index < step) expect(item).toHaveClass('tutorial-step-done')
        else expect(item).not.toHaveClass('tutorial-step-done')
      }
      if (step < targets.length) {
        act(() => usePatchStore.getState().applyProfileValues('web-synth', { ...usePatchStore.getState().values, ...targets[step] }))
        expect(steps[step]).not.toHaveClass('tutorial-step-done')
        await user.click(tutorial.getByRole('button', { name: 'Continue' }))
      }
    }
  })

  it('shows labeled harmonic spectra instead of the placeholder sketch', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    const diagram = screen.getByRole('img', { name: /Harmonic spectra/ })
    expect(diagram).toHaveAccessibleDescription(subtractiveLessons[0].visualCaption)
    expect(within(diagram).getByText('Sine')).toBeInTheDocument()
    expect(within(diagram).getByText('Sawtooth')).toBeInTheDocument()
    expect(within(diagram).getAllByText('Relative strength')).toHaveLength(2)
    const spectra = diagram.querySelectorAll('.harmonic-spectrum')
    expect(spectra).toHaveLength(2)
    for (const [index, spectrum] of [...spectra].entries()) {
      const bars = spectrum.querySelectorAll<HTMLElement>('.harmonic-bar')
      expect(bars).toHaveLength(8)
      for (const [harmonic, bar] of [...bars].entries()) {
        const expected = index === 0 && harmonic > 0 ? 0 : 100 / (harmonic + 1)
        expect(parseFloat(bar.style.height)).toBeCloseTo(expected)
      }
      expect(spectrum.querySelectorAll('.harmonic-tick')).toHaveLength(8)
    }
    expect(screen.queryByText(/Concept sketch, not a live audio measurement/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Top: Sine/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Bottom: Sawtooth/)).not.toBeInTheDocument()
  })

  it('is opt-in, hides locked controls from keyboard access, and exits with the current patch', async () => {
    const user = userEvent.setup()
    const original = { ...webSynthDefaultValues, filterCutoff: 2345 }
    usePatchStore.getState().applyProfileValues('web-synth', original)
    render(<App />)
    expect(screen.getByRole('region', { name: 'Filter' })).toBeInTheDocument()
    expect(usePatchStore.getState().values).toEqual(original)

    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    expect(usePatchStore.getState().values).toEqual(tutorialInitialValues)
    expect(screen.getByRole('heading', { name: /Start with a sawtooth bass/ })).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'Oscillator 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Filter' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Oscillator 1 detune' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Web synth preset' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    const waveform = within(screen.getByRole('group', { name: 'Oscillator 1 waveform' }))
    waveform.getByRole('radio', { name: 'Sine' }).focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(waveform.getByRole('radio', { name: 'Sawtooth' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('region', { name: 'Oscillator 2' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Filter' })).not.toBeInTheDocument()
    const learningPatch = { ...usePatchStore.getState().values }
    await user.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(usePatchStore.getState().values).toEqual(learningPatch)
    expect(localStorage.getItem(tutorialDismissedStorageKey)).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Build a classic plucky synth bass' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start tutorial' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Filter' })).toBeInTheDocument()
  })

  it('checks off steps with real controls and completes the checklist only after a successful save', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    expect(screen.getByRole('heading', { name: 'Build a classic plucky synth bass' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    await user.click(within(screen.getByRole('group', { name: 'Oscillator 1 waveform' })).getByRole('radio', { name: 'Sawtooth' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Oscillator 2 level' }), { target: { value: '30' } })
    const waveform = within(screen.getByRole('group', { name: 'Oscillator 1 waveform' }))
    await user.click(waveform.getByRole('radio', { name: 'Square' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByText('Review target: Start with a sawtooth bass')).toBeInTheDocument()
    await user.click(waveform.getByRole('radio', { name: 'Sawtooth' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    {
      const cutoff = screen.getByRole('slider', { name: 'Filter cutoff' })
      cutoff.focus()
      await user.keyboard('{Home}')
      await user.keyboard('{PageUp}')
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
      // Pointer drags use the same real rotary control path as the editor.
      fireEvent.pointerDown(cutoff, { pointerId: 1, clientY: 120 })
      fireEvent.pointerMove(cutoff, { pointerId: 1, clientY: 118 })
      fireEvent.pointerUp(cutoff, { pointerId: 1 })
      const resonance = screen.getByRole('slider', { name: 'Filter resonance' })
      resonance.focus()
      await user.keyboard('{PageUp}{PageUp}')
    }
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Amplifier decay' }), { target: { value: String(envelopeTimeToPosition(250, 22000)) } })
    fireEvent.change(screen.getByRole('slider', { name: 'Amplifier sustain' }), { target: { value: '10' } })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const amount = screen.getByRole('slider', { name: 'Filter envelope amount' })
    amount.focus()
    await user.keyboard('{PageUp}{PageUp}{PageUp}')
    fireEvent.change(screen.getByRole('slider', { name: 'Filter decay' }), { target: { value: String(envelopeTimeToPosition(180, 22000)) } })
    fireEvent.change(screen.getByRole('slider', { name: 'Filter sustain' }), { target: { value: '0' } })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    screen.getByRole('slider', { name: 'LFO pitch depth' }).focus()
    await user.keyboard('{PageUp}')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await user.keyboard('{Home}')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: /Save your plucky bass/ })).toHaveFocus()
    const checklist = within(screen.getByRole('list', { name: 'Tutorial steps' }))
    expect(checklist.getAllByText('Completed')).toHaveLength(6)
    expect(checklist.getAllByRole('listitem')[6]).toHaveTextContent('Current')
    expect(screen.getByText('6 of 7 steps complete')).toBeInTheDocument()
    const patch = { ...usePatchStore.getState().values }
    expect(patch).toMatchObject({
      polyphony: 1, unisonVoices: 1, osc1Wave: 2, osc2Wave: 2,
      ampAttack: 5, ampDecay: 250, ampSustain: 10, ampRelease: 80,
      filterDecay: 180, filterSustain: 0, filterRelease: 80,
      lfoPitchDepth: 0, lfoFilterDepth: 0, lfoResonanceDepth: 0,
    })
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveAttribute('placeholder', 'Classic plucky bass')
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'My plucky bass')
    fireEvent.change(screen.getByRole('slider', { name: 'Amplifier release' }), { target: { value: String(envelopeTimeToPosition(5000, 30000)) } })
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeDisabled()
    expect(screen.getByText('Review target: Make the bass pluck')).toBeInTheDocument()
    expect(screen.getByText(subtractiveLessons[3].challenge[1])).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Amplifier release' }), { target: { value: String(envelopeTimeToPosition(80, 30000)) } })
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
    await user.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Storage full')
    expect(screen.getByRole('heading', { name: /Save your plucky bass/ })).toBeInTheDocument()
    expect(screen.queryByText(/Tutorial complete\./)).not.toBeInTheDocument()
    expect(checklist.getAllByText('Completed')).toHaveLength(6)
    expect(checklist.getAllByRole('listitem')[6]).not.toHaveClass('tutorial-step-done')
    write.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(screen.getByText('Tutorial complete. Your classic plucky bass is saved. All controls are unlocked.')).toBeInTheDocument()
    const completedChecklist = within(screen.getByRole('list', { name: 'Tutorial steps' }))
    expect(completedChecklist.getAllByText('Completed')).toHaveLength(7)
    expect(completedChecklist.queryByText('Current')).not.toBeInTheDocument()
    for (const item of completedChecklist.getAllByRole('listitem')) {
      expect(item).toHaveClass('tutorial-step-done')
      expect(item).not.toHaveAttribute('aria-current')
    }
    expect(screen.getByRole('region', { name: 'Subtractive synthesis tutorial' })).not.toHaveTextContent(/badge|\bXP\b/i)
    expect(screen.getByRole('region', { name: 'Voice / unison' })).toBeInTheDocument()
    expect(readWebSynthPresets()[0].values).toEqual(patch)
    expect(Object.keys(patch)).toHaveLength(webSynthParameters.length)
    unmount()
    usePatchStore.getState().resetValues()
    render(<App />)
    expect(localStorage.getItem(tutorialDismissedStorageKey)).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Build a classic plucky synth bass' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Web synth preset' }), readWebSynthPresets()[0].id)
    expect(usePatchStore.getState().values).toEqual(patch)
  })

  it('can leave with the learning patch and restart with an unchecked checklist', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    await user.click(within(screen.getByRole('group', { name: 'Oscillator 1 waveform' })).getByRole('radio', { name: 'Sawtooth' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(within(screen.getByRole('list', { name: 'Tutorial steps' })).getAllByText('Completed')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(usePatchStore.getState().values.osc1Wave).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    expect(screen.getByRole('heading', { name: /Step 1/ })).toBeInTheDocument()
    expect(screen.getByText('0 of 7 steps complete')).toBeInTheDocument()
    const checklist = within(screen.getByRole('list', { name: 'Tutorial steps' }))
    expect(checklist.queryByText('Completed')).not.toBeInTheDocument()
    expect(checklist.getAllByText('Pending')).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(usePatchStore.getState().values.osc1Wave).toBe(tutorialInitialValues.osc1Wave)
  })

  it('remembers skipping across remounts without changing the patch and allows replay', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Skip tutorial' }))
    expect(screen.getByRole('button', { name: 'Start tutorial' })).toHaveFocus()
    expect(usePatchStore.getState().values).toEqual(webSynthDefaultValues)
    unmount()
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Build a classic plucky synth bass' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Voice / unison' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    expect(screen.getByRole('heading', { name: /Step 1/ })).toBeInTheDocument()
  })

  it('remembers exiting across profile changes and remounts', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    await user.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'summit')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument()
    unmount()
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Learn subtractive synthesis' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start tutorial' })).toBeInTheDocument()
  })

  it('exits even if storage fails and explains that the preference could not be remembered', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
    await user.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not remember tutorial preference: Storage full')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Voice / unison' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start tutorial' })).toHaveFocus()
  })

  it('reports preference read failures while keeping the tutorial optional', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === tutorialDismissedStorageKey) throw new DOMException('Storage blocked', 'SecurityError')
      return null
    })
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load tutorial preference: Storage blocked')
    expect(screen.getByRole('button', { name: 'Skip tutorial' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Voice / unison' })).toBeInTheDocument()
  })

  it('shows storage errors without claiming completion or destroying corrupted data', async () => {
    localStorage.setItem(webSynthPresetStorageKey, 'broken data')
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load presets')
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Test')
    await user.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save preset')
    expect(screen.queryByText(/Saved "Test"/)).not.toBeInTheDocument()
    expect(localStorage.getItem(webSynthPresetStorageKey)).toBe('broken data')
  })

  it('keeps Summit controls and tutorial state separate when switching profiles', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'summit')
    expect(screen.queryByRole('region', { name: 'Subtractive synthesis tutorial' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Synth profile' }), 'web-synth')
    expect(screen.getByRole('button', { name: 'Start tutorial' })).toBeInTheDocument()
    expect(usePatchStore.getState().values).toEqual(tutorialInitialValues)
  })

  it('does not advance an unmet challenge when earlier controls change', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start tutorial' }))
    act(() => usePatchStore.getState().setValue('osc1Wave', 2))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    act(() => {
      usePatchStore.getState().setValue('osc2Level', 30)
      usePatchStore.getState().setValue('osc2Detune', 7)
      usePatchStore.getState().setValue('osc1Detune', 7)
    })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })
})
