import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import {
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileInput,
  Info,
  Minus,
  Music2,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
  Upload,
  Waves,
} from 'lucide-react'
import './App.css'
import { midiEngine, type MidiSnapshot } from './midi/midiEngine'
import { validateSysex } from './midi/sysex'
import { useMidi } from './midi/useMidi'
import { webAudioSynth, type AudioSnapshot } from './audio/webAudioSynth'
import { webSynthParameterHelp, webSynthParameters, webSynthPresets } from './model/webSynthProfile'
import { ClickControlHelp } from './ClickControlHelp'
import {
  getParameterValueLabel,
  summitParameters,
  type SummitParameterDefinition,
  type HardwareParameterDefinition,
} from './model/parameters'
import {
  modMatrixDestinations,
  modMatrixSources,
  type ModMatrixField,
} from './model/modMatrix'
import { usePatchStore } from './model/patchStore'
import { synthProfileById, synthProfiles, type SynthProfile } from './model/profiles'
import { ultranovaParameters } from './model/ultranovaProfile'
import { subtractiveLessons, tutorialComplete, tutorialDismissedStorageKey, tutorialInitialValues, tutorialParameters, tutorialSaveLesson } from './model/subtractiveTutorial'
import { TutorialExplainer } from './TutorialExplainer'
import { readWebSynthPresets, saveWebSynthPreset } from './model/webSynthPresetStorage'
import { envelopePositionToTime, envelopeSliderMax, envelopeTimeToPosition } from './model/envelopeSliderScale'

function ControlHelp({ label, text }: { label: string; text: string }) {
  const id = useId()
  const [dismissed, setDismissed] = useState(false)
  return (
    <span className="help-container" onMouseEnter={() => setDismissed(false)} onFocus={() => setDismissed(false)} onKeyDown={(event) => {
      if (event.key === 'Escape') setDismissed(true)
    }}>
      <button className="control-help" type="button" aria-label={`${label} help`} aria-describedby={id} onClick={() => setDismissed(false)}><Info aria-hidden="true" /></button>
      <span id={id} role="tooltip" className={`control-tooltip${dismissed ? ' dismissed' : ''}`}>{text}</span>
    </span>
  )
}

function SectionToggle({ title, expanded, controls, onToggle }: { title: string; expanded: boolean; controls: string; onToggle: () => void }) {
  return (
    <button className="section-toggle" type="button" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
      {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
      <span>{title}</span>
    </button>
  )
}

function PanelModule({ id, title, className, children, help, eyebrow, defaultExpanded = true }: { id: string; title: string; className: string; children: ReactNode; help?: string; eyebrow?: string; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <section className={`peak-module ${className}`} aria-labelledby={id}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <div className="module-heading">
        <h2 id={id} className="peak-module-title"><SectionToggle title={title} expanded={expanded} controls={`${id}-content`} onToggle={() => setExpanded((current) => !current)} /></h2>
        {help && <ControlHelp label={title} text={help} />}
      </div>
      <div id={`${id}-content`} hidden={!expanded}>{children}</div>
    </section>
  )
}

function UnavailableControls({ children }: { children: ReactNode }) {
  return <div className="unavailable-controls"><span>Not yet implemented</span><p>{children}</p></div>
}

const parameterList: readonly SummitParameterDefinition[] = summitParameters

function parametersInSection(section: string) {
  return parameterList.filter((parameter) => parameter.section === section)
}

const mixerOrder: readonly string[] = ['osc1Mix', 'ringModMix', 'osc2Mix', 'noiseMix', 'osc3Mix', 'vcaLevel']
const mixerParameters = parametersInSection('Mixer').sort((a, b) => mixerOrder.indexOf(a.id) - mixerOrder.indexOf(b.id))

function ParameterGroup({ parameters, disabled }: { parameters: readonly HardwareParameterDefinition[]; disabled?: (parameter: HardwareParameterDefinition) => boolean }) {
  return <>{parameters.map((parameter) => <ParameterControl key={parameter.id} parameter={parameter} disabled={disabled?.(parameter)} />)}</>
}

const keyboardOctaves = 5
const maxKeyboardOctave = Math.floor((127 - keyboardOctaves * 12) / 12) - 1
const noteNames = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B']

function ParameterControl({ parameter, disabled = false }: { parameter: HardwareParameterDefinition; disabled?: boolean }) {
  const value = usePatchStore((state) => state.values[parameter.id])
  const effectValues = usePatchStore((state) => state.activeProfileId === 'ultranova' && /^fx[1-5]Type$/.test(parameter.id) ? state.values : null)
  const setValue = usePatchStore((state) => state.setValue)

  function update(nextValue: number) {
    if (disabled) return
    const id = parameter.id
    setValue(id, nextValue)
    midiEngine.sendParameter(id, nextValue)
  }

  return (
    <div
      className={`parameter-control${parameter.prominent ? ' prominent' : ''}${disabled ? ' disabled' : ''}`}
      onDoubleClick={() => update(parameter.defaultValue)}
      onKeyDown={(event) => {
        if (event.key !== 'Delete' || disabled) return
        event.preventDefault()
        update(parameter.defaultValue)
      }}
    >
      <div className="parameter-heading">
        <label id={`${parameter.id}-label`} htmlFor={parameter.valueLabels || parameter.fader ? parameter.id : undefined}>{parameter.shortLabel}</label>
        {(parameter.valueLabels || parameter.fader) && <output>{getParameterValueLabel(parameter, value)}</output>}
      </div>
      {parameter.valueLabels ? (
        <select id={parameter.id} value={value} disabled={disabled} aria-description="Double-click or press Delete to restore the default." onChange={(event) => update(Number(event.target.value))}>
          {parameter.valueLabels.map((label, index) => {
            const optionValue = parameter.min + index
            const usedInAnotherSlot = effectValues !== null && optionValue !== 0
              && [1, 2, 3, 4, 5].some((slot) => `fx${slot}Type` !== parameter.id && effectValues[`fx${slot}Type`] === optionValue)
            return <option key={index} value={optionValue} disabled={usedInAnotherSlot}>{label}</option>
          })}
        </select>
      ) : parameter.fader ? (
        <input id={parameter.id} type="range" min={parameter.min} max={parameter.max} value={value} disabled={disabled} aria-label={parameter.label} aria-orientation="vertical" aria-description="Double-click or press Delete to restore the default." onChange={(event) => update(Number(event.target.value))} />
      ) : (
        <RotaryControl
          id={parameter.id}
          label={parameter.label}
          min={parameter.min}
          max={parameter.max}
          value={value}
          valueText={getParameterValueLabel(parameter, value)}
          center={parameter.displayOffset}
          large={parameter.prominent}
          disabled={disabled}
          onChange={update}
        />
      )}
      {!parameter.valueLabels && !parameter.fader && <output className="rotary-value" htmlFor={parameter.id}>{getParameterValueLabel(parameter, value)}</output>}
      <span className="midi-address">
        {parameter.address.type === 'cc' ? `CC ${parameter.address.controller}` : `NRPN ${parameter.address.msb}:${parameter.address.lsb}`}
      </span>
    </div>
  )
}

type WebSynthParameter = (typeof webSynthParameters)[number]

const waveformShapes = [
  'M 2 16 C 7 0 13 0 18 16 S 29 32 34 16 S 45 0 50 16',
  'M 2 16 L 10 3 L 26 29 L 42 3 L 50 16',
  'M 2 29 L 18 3 L 18 29 L 34 3 L 34 29 L 50 3',
  'M 2 29 V 3 H 14 V 29 H 26 V 3 H 38 V 29 H 50',
]

/** Commits whole-number parameter values on Enter or blur; Escape cancels an edit. */
function WebSynthNumberInput({ parameter, value, valueText, onChange }: {
  parameter: WebSynthParameter
  value: number
  valueText: string
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const id = useId()
  const valueButton = useRef<HTMLButtonElement>(null)
  const editInput = useRef<HTMLInputElement>(null)
  const editing = draft !== null
  const inputUnit = parameter.id.endsWith('Attack') || parameter.id.endsWith('Decay') || parameter.id.endsWith('Release') ? ' milliseconds' : ''

  useEffect(() => {
    if (editing) {
      editInput.current?.focus()
      editInput.current?.select()
    }
  }, [editing])

  function commit(input: HTMLInputElement, returnFocus = false) {
    if (draft === null) return
    const next = input.valueAsNumber
    if (!draft.trim() || !Number.isInteger(next) || next < parameter.min || next > parameter.max) {
      setError(`Enter a whole number from ${parameter.min} to ${parameter.max}${inputUnit}.`)
      return
    }
    onChange(next)
    setDraft(null)
    setError('')
    if (returnFocus) requestAnimationFrame(() => valueButton.current?.focus())
  }

  return (
    <div className="web-number-control" onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      {draft === null ? <button
        ref={valueButton}
        type="button"
        className="web-editable-value"
        aria-label={`Edit ${parameter.label.toLowerCase()} value: ${valueText}`}
        onClick={() => setDraft(String(value))}
      >{valueText}</button> : <><input
        ref={editInput}
        type="number"
        min={parameter.min}
        max={parameter.max}
        step={1}
        value={draft ?? value}
        aria-label={`${parameter.label} value`}
        aria-description={`Current setting: ${valueText}. Enter a whole number from ${parameter.min} to ${parameter.max}${inputUnit}. Press Enter to apply or Escape to cancel.`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? id : undefined}
        onChange={(event) => { setDraft(event.target.value); setError('') }}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(event.currentTarget, true)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(null)
            setError('')
            requestAnimationFrame(() => valueButton.current?.focus())
          }
        }}
      />{inputUnit && <span className="web-number-unit">Milliseconds (ms)</span>}</>}
      {error && <span id={id} className="web-number-error" role="alert">{error}</span>}
    </div>
  )
}

function WebSynthParameterControl({ parameter, vertical = false }: { parameter: WebSynthParameter; vertical?: boolean }) {
  const value = usePatchStore((state) => state.values[parameter.id])
  const shapeWaveform = usePatchStore((state) => state.values[parameter.id === 'osc1Shape' ? 'osc1Wave' : 'osc2Wave'])
  const setValue = usePatchStore((state) => state.setValue)

  function update(nextValue: number) {
    setValue(parameter.id, nextValue)
  }

  const valueLabels = 'valueLabels' in parameter ? parameter.valueLabels : undefined
  const isWaveform = parameter.id === 'osc1Wave' || parameter.id === 'osc2Wave'
  const isEnvelopeTime = vertical && /(?:Attack|Decay|Release)$/.test(parameter.id)
  const valueText = parameter.id.endsWith('Shape')
    ? shapeWaveform === 3 ? `${value}% pulse width` : `${Math.round((value - 50) * 3.6)}° phase`
    : getWebSynthValueText(parameter, value)
  return (
    <div className={`parameter-control web-synth-control${isWaveform ? ' web-waveform-control' : ''}`} onDoubleClick={() => update(parameter.defaultValue)} onKeyDown={(event) => {
      if (event.key !== 'Delete') return
      event.preventDefault()
      update(parameter.defaultValue)
    }}>
      <div className="parameter-heading">
        <label htmlFor={vertical || (valueLabels && !isWaveform) ? `web-${parameter.id}` : undefined}>{parameter.shortLabel}</label>
        <ClickControlHelp label={parameter.label} text={webSynthParameterHelp[parameter.id]} />
        {valueLabels && <output>{valueText}</output>}
      </div>
      {valueLabels && !isWaveform ? (
        <select id={`web-${parameter.id}`} value={value} aria-label={parameter.label} aria-description="Double-click or press Delete to restore the default." onChange={(event) => update(Number(event.target.value))}>
          {valueLabels.map((label, index) => <option key={label} value={parameter.min + index}>{label}</option>)}
        </select>
      ) : valueLabels ? (
        <fieldset className="waveform-options" aria-label={parameter.label}>
          {valueLabels.map((label, index) => (
            <label key={label} className="waveform-option" title={label}>
              <input type="radio" name={`web-${parameter.id}`} value={index} checked={value === index} onChange={() => update(index)} />
              <svg viewBox="0 0 52 32" aria-hidden="true"><path d={waveformShapes[index]} /></svg>
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      ) : vertical ? (
        <input
          id={`web-${parameter.id}`}
          type="range"
          min={parameter.min}
          max={isEnvelopeTime ? envelopeSliderMax : parameter.max}
          step={isEnvelopeTime ? 'any' : 1}
          value={isEnvelopeTime ? envelopeTimeToPosition(value, parameter.max) : value}
          aria-label={parameter.label}
          aria-valuemin={parameter.min}
          aria-valuemax={parameter.max}
          aria-valuenow={value}
          aria-valuetext={valueText}
          aria-orientation="vertical"
          aria-description={isEnvelopeTime ? 'Quadratic time scale: finer adjustment at short times, coarser at long times. Use arrow keys to adjust, Page Up or Page Down for larger changes, Home or End for the limits. Click the value to enter exact milliseconds. Double-click or press Delete to restore the default.' : 'Use arrow keys to adjust. Double-click or press Delete to restore the default.'}
          onChange={(event) => update(isEnvelopeTime ? envelopePositionToTime(Number(event.target.value), parameter.max) : Number(event.target.value))}
          onKeyDown={(event) => {
            if (!isEnvelopeTime) return
            const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'PageUp' ? 1
              : event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'PageDown' ? -1 : 0
            if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              update(event.key === 'Home' ? parameter.min : parameter.max)
            } else if (direction) {
              event.preventDefault()
              const step = event.key.startsWith('Page') ? 50 : 1
              const position = Math.min(envelopeSliderMax, Math.max(0, envelopeTimeToPosition(value, parameter.max) + direction * step))
              const next = envelopePositionToTime(position, parameter.max)
              update(Math.min(parameter.max, Math.max(parameter.min, direction > 0 ? Math.max(value + 1, next) : Math.min(value - 1, next))))
            }
          }}
        />
      ) : (
        <RotaryControl
          id={`web-${parameter.id}`}
          label={parameter.label}
          min={parameter.min}
          max={parameter.max}
          value={value}
          valueText={valueText}
          center={'displayOffset' in parameter ? parameter.displayOffset : undefined}
          onChange={update}
        />
      )}
      {!valueLabels && <WebSynthNumberInput parameter={parameter} value={value} valueText={valueText} onChange={update} />}
    </div>
  )
}

function getWebSynthValueText(parameter: WebSynthParameter, value: number) {
  if ('valueLabels' in parameter) return parameter.valueLabels[value - parameter.min]
  if (parameter.id.endsWith('Cutoff')) return `${value} Hz`
  if (parameter.id === 'osc1Detune' || parameter.id === 'osc2Detune' || parameter.id === 'lfoPitchDepth' || parameter.id === 'unisonDetune') return `${value} cents`
  if (parameter.id === 'lfoRate') return `${value} Hz`
  if (parameter.id.endsWith('Sustain') || parameter.id.endsWith('Level') || parameter.id.endsWith('Resonance') || parameter.id === 'filterEnvelopeAmount' || parameter.id === 'lfoFilterDepth' || parameter.id === 'lfoResonanceDepth') return `${value}%`
  if (parameter.id.endsWith('Attack') || parameter.id.endsWith('Decay') || parameter.id.endsWith('Release')) return value >= 1000 ? `${Number((value / 1000).toFixed(3))} s` : `${value} ms`
  return String(value)
}

function WebSynthEnvelope({ section, values }: { section: 'Amp envelope' | 'Filter envelope'; values: Record<string, number> }) {
  const prefix = section === 'Amp envelope' ? 'amp' : 'filter'
  const parameters = webSynthParameters.filter((parameter) => parameter.section === section)
  const value = (stage: 'Attack' | 'Decay' | 'Sustain' | 'Release') => values[`${prefix}${stage}`]
  const max = (stage: 'Attack' | 'Decay' | 'Sustain' | 'Release') => parameters.find((parameter) => parameter.id === `${prefix}${stage}`)?.max ?? 127

  return (
    <div className="web-envelope-layout">
      <div className="envelope-controls">
        {parameters.map((parameter) => <WebSynthParameterControl key={parameter.id} parameter={parameter} vertical />)}
      </div>
      <EnvelopeGraph
        id={`web-${prefix}-graph`}
        title={`${section === 'Amp envelope' ? 'Amplifier' : 'Filter'} envelope curve`}
        attack={value('Attack')}
        decay={value('Decay')}
        sustain={value('Sustain')}
        release={value('Release')}
        attackMax={max('Attack')}
        decayMax={max('Decay')}
        sustainMax={max('Sustain')}
        releaseMax={max('Release')}
      />
    </div>
  )
}

function WebSynthPanel({ audio }: { audio: AudioSnapshot }) {
  const values = usePatchStore((state) => state.values)
  const applyProfileValues = usePatchStore((state) => state.applyProfileValues)
  const [presetState, setPresetState] = useState(() => {
    try {
      return { presets: readWebSynthPresets(), error: '' }
    } catch (error) {
      return { presets: [], error: `Could not load presets: ${error instanceof Error || error instanceof DOMException ? error.message : 'Browser storage is unavailable.'}` }
    }
  })
  const [presetName, setPresetName] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [tutorial, setTutorial] = useState<{ step: number } | null>(null)
  const [tutorialPreference, setTutorialPreference] = useState(() => {
    try {
      const stored = localStorage.getItem(tutorialDismissedStorageKey)
      if (stored !== null && stored !== 'true') throw new Error('Saved tutorial preference is invalid.')
      return { dismissed: stored === 'true', error: '' }
    } catch (error) {
      return { dismissed: false, error: `Could not load tutorial preference: ${error instanceof Error || error instanceof DOMException ? error.message : 'Browser storage is unavailable.'}` }
    }
  })
  const [tutorialCompleted, setTutorialCompleted] = useState(false)
  const tutorialHeading = useRef<HTMLHeadingElement>(null)
  const startTutorialButton = useRef<HTMLButtonElement>(null)
  const wasInTutorial = useRef(false)
  const presets = [...webSynthPresets, ...presetState.presets]
  const selectedPreset = presets.find((preset) => webSynthParameters.every((parameter) => values[parameter.id] === preset.values[parameter.id]))?.id ?? ''
  const lesson = tutorial ? subtractiveLessons[tutorial.step] : undefined
  const targetReached = tutorial ? tutorialComplete(tutorial.step, values) : true
  const unmetLesson = tutorial ? subtractiveLessons.slice(0, tutorial.step + 1).find((item) => !item.complete(values)) : undefined
  const unlocked = tutorial ? tutorialParameters(tutorial.step) : null
  const available = (parameter: WebSynthParameter) => !unlocked || unlocked.has(parameter.id)
  const sectionAvailable = (section: string) => webSynthParameters.some((parameter) => parameter.section === section && available(parameter))
  const completedSteps = tutorialCompleted ? subtractiveLessons.length + 1 : tutorial?.step ?? 0
  const checklist = <ol className="tutorial-roadmap" aria-label="Tutorial steps">
    {[...subtractiveLessons, tutorialSaveLesson].map((item, step) => <li key={item.shortTitle} aria-current={step === tutorial?.step ? 'step' : undefined} className={step < completedSteps ? 'tutorial-step-done' : ''}>
      {step < completedSteps ? <Check aria-hidden="true" /> : <Square aria-hidden="true" />}
      <span>{step + 1}. {item.shortTitle}</span>
      <span className="tutorial-step-state">{step < completedSteps ? 'Completed' : step === tutorial?.step ? 'Current' : 'Pending'}</span>
    </li>)}
  </ol>

  useEffect(() => {
    if (tutorial) tutorialHeading.current?.focus()
    else if (wasInTutorial.current) startTutorialButton.current?.focus()
    wasInTutorial.current = Boolean(tutorial)
  }, [tutorial])

  useEffect(() => {
    webAudioSynth.setParameters(values)
  }, [values])

  function selectPreset(id: string) {
    const preset = presets.find((item) => item.id === id)
    if (preset) applyProfileValues('web-synth', preset.values)
  }

  function startTutorial() {
    webAudioSynth.allNotesOff()
    setTutorial({ step: 0 })
    applyProfileValues('web-synth', tutorialInitialValues)
    setTutorialCompleted(false)
    setSavedMessage('')
  }

  function exitTutorial() {
    try {
      localStorage.setItem(tutorialDismissedStorageKey, 'true')
      setTutorialPreference({ dismissed: true, error: '' })
    } catch (error) {
      setTutorialPreference({ dismissed: true, error: `Could not remember tutorial preference: ${error instanceof Error || error instanceof DOMException ? error.message : 'Browser storage is unavailable.'} The tutorial introduction may appear on your next visit.` })
    }
    setTutorial(null)
    startTutorialButton.current?.focus()
  }

  function savePreset() {
    try {
      if (tutorial && !targetReached) throw new Error(`Restore the bass target for "${unmetLesson?.title}" before saving.`)
      const next = saveWebSynthPreset(presetName, values)
      setPresetState({ presets: next, error: '' })
      setSavedMessage(`Saved "${presetName.trim()}" in this browser.`)
      setPresetName('')
      if (tutorial && !lesson) {
        setTutorialCompleted(true)
        exitTutorial()
      }
    } catch (error) {
      setPresetState((current) => ({ ...current, error: `Could not save preset: ${error instanceof Error || error instanceof DOMException ? error.message : 'Browser storage is unavailable.'}` }))
      setSavedMessage('')
    }
  }

  return (
    <section className="panel-workspace web-synth-panel" aria-label="Built-in Web Synth">
      <div className="web-synth-heading">
        <div>
          <span className="eyebrow">Independent browser instrument</span>
          <h2>Built-in Web Synth</h2>
          <p>Shape a two-oscillator synth and play without connected hardware.</p>
        </div>
        <div className="web-synth-actions">
          <div className="web-preset-control">
          <div className="web-action-heading"><span>Preset</span><ClickControlHelp label="Web synth preset" text="Load a complete set of oscillator, filter, envelope, and LFO settings as a starting point. A synth patch is a recipe for a sound. Editing any setting turns the selected preset into a custom patch." /></div>
          <select aria-label="Web synth preset" value={selectedPreset} disabled={Boolean(tutorial)} onChange={(event) => selectPreset(event.target.value)}>
            <option value="">Custom</option>
            {webSynthPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            {presetState.presets.length > 0 && <optgroup label="Your browser presets">
              {presetState.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </optgroup>}
          </select></div>
          <div className="web-action-with-help">
          <button type="button" className="primary-action" onClick={() => { void webAudioSynth.start() }} disabled={audio.status === 'starting'}>
            <Power aria-hidden="true" />{audio.status === 'ready' ? 'Resume audio' : audio.status === 'starting' ? 'Starting...' : 'Start audio'}
          </button>
          <ClickControlHelp label="Audio output" text="Start or resume the browser audio engine so the virtual keyboard can produce sound. Browsers require a user gesture to enable audio. The oscillators mix into one LP, HP, or BP filter per note before the amplifier envelope and speakers; no MIDI hardware is needed." />
          </div>
        </div>
      </div>
      <p className={`audio-status audio-status-${audio.status}`} role="status" aria-live="polite">
        <strong>Audio {audio.status}.</strong>{audio.error ? ` ${audio.error}` : audio.status === 'ready' ? ' Audio output is independent of MIDI.' : ' Start audio to enable the virtual keyboard.'}
      </p>
      <section className="synth-tutorial" aria-label="Subtractive synthesis tutorial">
        {!tutorial ? <>
          {!tutorialPreference.dismissed && <>
            <h3>Build a classic plucky synth bass</h3>
            <p>Learn subtractive synthesis by making a punchy bass for electronic and pop bass lines: sawtooth body, a bright filter snap, a short tail, and steady pitch. Follow six hands-on steps, then save your bass. Each step is checked off as you continue.</p>
            <p>Starting replaces your current sound with a learning patch. You can exit at any time.</p>
          </>}
          <div className="tutorial-actions">
            <button ref={startTutorialButton} type="button" onClick={startTutorial}>Start tutorial</button>
            {!tutorialPreference.dismissed && <button type="button" onClick={exitTutorial}>Skip tutorial</button>}
          </div>
          {tutorialCompleted && <>
            <p role="status">Tutorial complete. Your classic plucky bass is saved. All controls are unlocked.</p>
            {checklist}
          </>}
        </> : <>
          <div className="tutorial-progress-heading">
            <span className="eyebrow">Classic plucky bass checklist</span>
            <span>{completedSteps} of {subtractiveLessons.length + 1} steps complete</span>
          </div>
          {checklist}
          <h3 ref={tutorialHeading} tabIndex={-1}>{`Step ${tutorial.step + 1} of 7: ${(lesson ?? tutorialSaveLesson).title}`}</h3>
          <TutorialExplainer lesson={lesson ?? tutorialSaveLesson} />
          <p className="tutorial-feedback" role="status">{!targetReached ? `Reach the bass target: ${unmetLesson?.title}.` : lesson ? 'Target reached. Continue to check off this step.' : 'Your bass recipe is ready. Name and save your preset below to finish.'}</p>
          {unmetLesson && unmetLesson !== lesson && <details>
            <summary>Review target: {unmetLesson.title}</summary>
            <ol>{unmetLesson.challenge.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
          </details>}
          <div className="tutorial-actions">
            {lesson && <button type="button" disabled={!targetReached} onClick={() => setTutorial({ ...tutorial, step: tutorial.step + 1 })}>Continue</button>}
            <button type="button" onClick={exitTutorial}>Exit tutorial</button>
          </div>
        </>}
      </section>
      {tutorialPreference.error && <p className="preset-error" role="alert">{tutorialPreference.error}</p>}
      {(!tutorial || !lesson) && <form className={`web-preset-save${tutorial ? ' tutorial-preset-save' : ''}`} onSubmit={(event) => { event.preventDefault(); savePreset() }}>
        <label htmlFor="web-preset-name">Preset name</label>
        <input id="web-preset-name" value={presetName} maxLength={64} required onChange={(event) => setPresetName(event.target.value)} placeholder={tutorial ? 'Classic plucky bass' : 'My first patch'} />
        <button type="submit" disabled={!presetName.trim() || !targetReached}>Save preset</button>
        <p>Saved only in this browser. Clearing site data removes your presets.</p>
      </form>}
      {presetState.error && <p className="preset-error" role="alert">{presetState.error}</p>}
      {savedMessage && <p role="status">{savedMessage}</p>}
      <div className={`web-synth-grid${tutorial ? ' tutorial-controls' : ''}`}>
        {([
          ['Oscillator 1', 'Oscillator 2', 'Mixer', 'Filter', 'LFO'],
          ['Amp envelope', 'Filter envelope'],
        ] as const).map((sections, row) => (
          <div key={row} className={row === 0 ? 'web-synth-signal-grid' : 'web-synth-envelope-grid'}>
            {sections.filter(sectionAvailable).map((section) => (
              <PanelModule key={section} id={`web-${section.toLowerCase().replaceAll(' ', '-')}`} title={section} className={`web-synth-module web-${section.toLowerCase().replaceAll(' ', '-')}-module`}>
                {section === 'Amp envelope' || section === 'Filter envelope'
                  ? <WebSynthEnvelope section={section} values={values} />
                  : section === 'Filter' ? <>
                    <div className="web-filter-type">
                      {webSynthParameters.filter((parameter) => parameter.section === section && 'valueLabels' in parameter && available(parameter)).map((parameter) => <WebSynthParameterControl key={parameter.id} parameter={parameter} />)}
                    </div>
                    <div className="web-filter-tone-controls">
                      {webSynthParameters.filter((parameter) => parameter.section === section && !('valueLabels' in parameter) && available(parameter)).map((parameter) => <WebSynthParameterControl key={parameter.id} parameter={parameter} />)}
                    </div>
                  </> : <div className="web-synth-controls">
                    {webSynthParameters.filter((parameter) => parameter.section === section && available(parameter)).map((parameter) => (
                      <WebSynthParameterControl key={parameter.id} parameter={parameter} vertical={section === 'Mixer'} />
                    ))}
                  </div>}
              </PanelModule>
            ))}
            {row === 1 && !tutorial && <PanelModule id="web-voice-unison" title="Voice / unison" className="web-synth-module web-voice-module">
              <div className="web-synth-controls">
                {webSynthParameters.filter((parameter) => parameter.section === 'Voice / unison').map((parameter) => <WebSynthParameterControl key={parameter.id} parameter={parameter} />)}
              </div>
              <p className="web-voice-note">Changing polyphony or unison voices releases sounding notes.</p>
            </PanelModule>}
          </div>
        ))}
      </div>
    </section>
  )
}

function RotaryControl({
  id,
  label,
  min,
  max,
  value,
  valueText,
  center,
  large = false,
  disabled = false,
  onChange,
}: {
  id: string
  label: string
  min: number
  max: number
  value: number
  valueText: string
  center?: number
  large?: boolean
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const dragStart = useRef<{ pointerId: number; y: number; value: number } | null>(null)
  const range = max - min
  const angle = range === 0 ? 0 : center !== undefined && center > min && center < max
    ? value < center ? ((value - center) / (center - min)) * 135 : ((value - center) / (max - center)) * 135
    : -135 + ((value - min) / range) * 270

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const step = event.shiftKey ? 10 : 1
    let nextValue: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        nextValue = value + step
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        nextValue = value - step
        break
      case 'PageUp':
        nextValue = value + 10
        break
      case 'PageDown':
        nextValue = value - 10
        break
      case 'Home':
        nextValue = min
        break
      case 'End':
        nextValue = max
        break
      default:
        return
    }
    event.preventDefault()
    onChange(Math.min(max, Math.max(min, nextValue)))
  }

  return (
    <div
      id={id}
      className={`rotary-control${large ? ' large' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-description="Drag up or down to adjust. Use arrow keys to change by one, or Shift with an arrow key to change by ten. Double-click or press Delete to restore the default."
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.preventDefault()
        if (disabled) return
        event.currentTarget.setPointerCapture?.(event.pointerId)
        dragStart.current = { pointerId: event.pointerId, y: event.clientY, value }
      }}
      onPointerMove={(event) => {
        const start = dragStart.current
        if (!start || start.pointerId !== event.pointerId) return
        const sensitivity = event.shiftKey ? 4 : 1
        const delta = Math.round(((start.y - event.clientY) / sensitivity) * (range / 120))
        onChange(Math.min(max, Math.max(min, start.value + delta)))
      }}
      onPointerUp={(event) => {
        if (dragStart.current?.pointerId === event.pointerId) dragStart.current = null
      }}
      onPointerCancel={() => { dragStart.current = null }}
    >
      <span className="rotary-dial" aria-hidden="true">
        <span className="rotary-indicator" style={{ transform: `rotate(${angle}deg)` }} />
      </span>
    </div>
  )
}

function EnvelopeGraph({ id, title, attack, decay, sustain, release, attackMax = 127, decayMax = 127, sustainMax = 127, releaseMax = 127 }: {
  id: string
  title: string
  attack: number
  decay: number
  sustain: number
  release: number
  attackMax?: number
  decayMax?: number
  sustainMax?: number
  releaseMax?: number
}) {
  const attackX = 30 + (attack / attackMax) * 80
  const decayX = attackX + 30 + (decay / decayMax) * 70
  const sustainY = 156 - (sustain / sustainMax) * 116
  const releaseX = 270 + (release / releaseMax) * 80
  const path = `M 24 156 L ${attackX} 40 L ${decayX} ${sustainY} L 270 ${sustainY} L ${releaseX} 156`

  return (
    <svg className={`envelope-graph${id.startsWith('web-') ? ' web-envelope-graph' : ''}`} viewBox="0 0 380 190" preserveAspectRatio={id.startsWith('web-') ? 'none' : undefined} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary`}>
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-summary`}>Attack {attack}, decay {decay}, sustain {sustain}, release {release}</desc>
      <defs><pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" className="grid-line" /></pattern></defs>
      <rect width="380" height="190" fill={`url(#${id}-grid)`} />
      <path d={path} className="envelope-fill" />
      <path d={path} className="envelope-line" />
      <circle cx={attackX} cy="40" r="5" />
      <circle cx={decayX} cy={sustainY} r="5" />
      <circle cx="270" cy={sustainY} r="5" />
    </svg>
  )
}

function EnvelopeView() {
  const values = usePatchStore((state) => state.values)
  return (
    <PanelModule id="envelope-title" title="Amp envelope" className="amp-module">
      <div className="hardware-envelope-layout">
        <div className="envelope-controls">
          <ParameterGroup parameters={parametersInSection('Envelope').filter((parameter) => parameter.fader)} />
        </div>
        <EnvelopeGraph id="amp-graph" title="Amplifier envelope curve" attack={values.ampAttack} decay={values.ampDecay} sustain={values.ampSustain} release={values.ampRelease} />
      </div>
      <div className="parameter-grid envelope-options">
        <ParameterGroup parameters={parametersInSection('Envelope').filter((parameter) => !parameter.fader)} />
      </div>
    </PanelModule>
  )
}

function ModEnvelopeModule() {
  const [selected, setSelected] = useState<1 | 2>(1)
  const parameters = parametersInSection(`Mod envelope ${selected}`)
  const values = usePatchStore((state) => state.values)

  return (
    <PanelModule id="mod-envelopes-title" title="Mod envelopes" className="mod-envelopes-module" help="Mod envelope depths are set per destination in the oscillator and filter modules.">
      <div className="lfo-selector" role="group" aria-label="Select mod envelope">
        {([1, 2] as const).map((envelope) => (
          <button key={envelope} type="button" aria-pressed={selected === envelope} onClick={() => setSelected(envelope)}>
            Mod env {envelope}
          </button>
        ))}
      </div>
      <div className="hardware-envelope-layout">
        <div className="envelope-controls">
          <ParameterGroup parameters={parameters.filter((parameter) => parameter.fader)} />
        </div>
        <EnvelopeGraph
          id="mod-graph"
          title={`Mod envelope ${selected} curve`}
          attack={selected === 1 ? values.modEnv1Attack : values.modEnv2Attack}
          decay={selected === 1 ? values.modEnv1Decay : values.modEnv2Decay}
          sustain={selected === 1 ? values.modEnv1Sustain : values.modEnv2Sustain}
          release={selected === 1 ? values.modEnv1Release : values.modEnv2Release}
        />
      </div>
      <div className="parameter-grid envelope-options">
        <ParameterGroup parameters={parameters.filter((parameter) => !parameter.fader)} />
      </div>
    </PanelModule>
  )
}

function ModMatrixModule() {
  const [selectedSlot, setSelectedSlot] = useState(0)
  const slots = usePatchStore((state) => state.summitState.modMatrix)
  const setModMatrixValue = usePatchStore((state) => state.setModMatrixValue)
  const slot = slots[selectedSlot]
  const number = selectedSlot + 1

  function update(slotIndex: number, field: ModMatrixField, value: number) {
    setModMatrixValue(slotIndex, field, value)
    midiEngine.sendModMatrixValue(slotIndex, field, value)
  }

  return (
    <PanelModule
      id="mod-matrix-title"
      title="Modulation matrix"
      className="matrix-module"
      eyebrow="16 SLOTS / VERIFY MAPPING"
      defaultExpanded={false}
      help="Each slot combines two modulation sources, applies the signed depth, then routes it to one destination. Changes send immediately."
    >
      <p className="matrix-notice" role="note">
        Assignment NRPNs are community-documented, not published by Novation. Verify behavior with your Summit.
        The available choices may not include destinations added in later firmware.
      </p>
      <div className="matrix-slot-selector" role="group" aria-label="Select modulation slot">
        {slots.map((_, slotIndex) => (
          <button
            key={slotIndex}
            type="button"
            aria-label={`Modulation slot ${slotIndex + 1}`}
            aria-pressed={selectedSlot === slotIndex}
            aria-controls="mod-matrix-slot-editor"
            onClick={() => setSelectedSlot(slotIndex)}
          >
            {String(slotIndex + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
      <fieldset className="matrix-slot" id="mod-matrix-slot-editor">
        <legend>Slot {String(number).padStart(2, '0')}</legend>
        <label>
          <span>Source A</span>
          <select aria-label={`Slot ${number} source A`} value={slot.sourceA} onChange={(event) => update(selectedSlot, 'sourceA', Number(event.target.value))}>
            {modMatrixSources.map((source, index) => <option key={source} value={index}>{source}</option>)}
          </select>
        </label>
        <label>
          <span>Source B</span>
          <select aria-label={`Slot ${number} source B`} value={slot.sourceB} onChange={(event) => update(selectedSlot, 'sourceB', Number(event.target.value))}>
            {modMatrixSources.map((source, index) => <option key={source} value={index}>{source}</option>)}
          </select>
        </label>
        <label>
          <span>Destination</span>
          <select aria-label={`Slot ${number} destination`} value={slot.destination} onChange={(event) => update(selectedSlot, 'destination', Number(event.target.value))}>
            {modMatrixDestinations.map((destination, index) => <option key={destination} value={index}>{destination}</option>)}
          </select>
        </label>
        <label className="matrix-depth">
          <span>Depth <output>{slot.depth > 64 ? `+${slot.depth - 64}` : slot.depth - 64}</output></span>
          <input
            type="range"
            min="0"
            max="127"
            value={slot.depth}
            aria-label={`Slot ${number} depth`}
            aria-valuetext={slot.depth > 64 ? `+${slot.depth - 64}` : String(slot.depth - 64)}
            aria-description="Depth is bipolar with 64 as zero. Use arrow keys to adjust; double-click or press Delete to reset to zero."
            onChange={(event) => update(selectedSlot, 'depth', Number(event.target.value))}
            onDoubleClick={() => update(selectedSlot, 'depth', 64)}
            onKeyDown={(event) => {
              if (event.key !== 'Delete') return
              event.preventDefault()
              update(selectedSlot, 'depth', 64)
            }}
          />
        </label>
        <span className="midi-address">NRPN {number}:0-3 / slot select 0:125</span>
      </fieldset>
    </PanelModule>
  )
}

function LfoModule() {
  const [selectedLfo, setSelectedLfo] = useState(1)
  const parameters = parameterList.filter((parameter) => parameter.id.startsWith(`lfo${selectedLfo}`))
  const range = usePatchStore((state) => (selectedLfo === 1 ? state.values.lfo1Range : selectedLfo === 2 ? state.values.lfo2Range : null))
  const isSynced = range === LFO_RANGE_SYNC

  function isDisabled(parameter: HardwareParameterDefinition) {
    if (parameter.id.endsWith('SyncRate')) return !isSynced
    if (parameter.id.endsWith('Rate')) return isSynced
    return false
  }

  return (
    <PanelModule id="lfo-title" title="LFOs" className="lfo-module" help={selectedLfo <= 2
      ? 'Rate applies in Low and High range; Sync rate applies when Range is Sync.'
      : `LFO ${selectedLfo} wave and rate have no published MIDI address, so only phase, slew and fade time are editable.`}>
      <div className="lfo-selector" role="group" aria-label="Select LFO">
        {[1, 2, 3, 4].map((lfo) => (
          <button
            key={lfo}
            type="button"
            aria-pressed={selectedLfo === lfo}
            onClick={() => setSelectedLfo(lfo)}
          >
            LFO {lfo}
          </button>
        ))}
      </div>
      <div className="parameter-grid" id="lfo-controls">
        <ParameterGroup parameters={parameters} disabled={isDisabled} />
      </div>
    </PanelModule>
  )
}

const LFO_RANGE_SYNC = 2
const DUAL_FILTER_SHAPE = 3

function FilterModule() {
  const isDual = usePatchStore((state) => state.values.filterShape === DUAL_FILTER_SHAPE)
  const filterParameters: SummitParameterDefinition[] = summitParameters.filter((parameter) => parameter.section === 'Filter')
  const featured = filterParameters.filter((parameter) => parameter.prominent)
  const others = filterParameters.filter((parameter) => !parameter.prominent)

  return (
    <PanelModule id="filter-title" title="Filter" className="filter-module">
      <div className="parameter-grid filter-main"><ParameterGroup parameters={[...featured, ...others]} /></div>
      <div className="dual-filter" role="group" aria-labelledby="dual-filter-title" hidden={!isDual}>
        <div className="module-heading"><h3 id="dual-filter-title" className="sub-module-title">Dual filter</h3><ControlHelp label="Dual filter" text={`${isDual ? 'Combinations: ">" runs in series, "+" runs in parallel.' : 'Set Shape to Dual to edit the filter combination and separation.'} The dual combination and separation NRPNs are not in Novation's published MIDI table, so they need hardware verification.`} /></div>
        <div className="parameter-grid">
          {summitParameters.filter((parameter) => parameter.section === 'Dual filter').map((parameter) => <ParameterControl key={parameter.id} parameter={parameter} disabled={!isDual} />)}
        </div>
      </div>
      <div className="filter-modulation" role="group" aria-labelledby="filter-modulation-title">
        <div className="module-heading"><h3 id="filter-modulation-title" className="sub-module-title">Modulation</h3><ControlHelp label="Filter modulation" text="Each source has its own depth. Divergence is in the Voice menu." /></div>
        <div className="parameter-grid">
          <ParameterGroup parameters={parametersInSection('Filter modulation')} />
        </div>
      </div>
    </PanelModule>
  )
}

const menuTabs = [
  { id: 'voice', label: 'Voice', section: 'Voice menu' },
  { id: 'common', label: 'Osc common', section: 'Oscillator common menu' },
  { id: 'osc1', label: 'Osc 1', section: 'Oscillator 1 menu' },
  { id: 'osc2', label: 'Osc 2', section: 'Oscillator 2 menu' },
  { id: 'osc3', label: 'Osc 3', section: 'Oscillator 3 menu' },
  { id: 'noise', label: 'Noise', section: 'Noise menu' },
] as const

function MenuSettingsModule() {
  const [selected, setSelected] = useState<(typeof menuTabs)[number]['id']>('voice')

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % menuTabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + menuTabs.length) % menuTabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = menuTabs.length - 1
    else return
    event.preventDefault()
    setSelected(menuTabs[next].id)
    document.getElementById(`menu-tab-${menuTabs[next].id}`)?.focus()
  }

  return (
    <PanelModule id="menu-settings-title" title="Voice & oscillator menus" className="menu-module" help="Menu settings follow the Summit user guide. Noise high-pass is unverified and excluded from hardware reset. Tuning tables are not yet implemented.">
      <div className="lfo-selector menu-tabs" role="tablist" aria-label="Menu page">
        {menuTabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`menu-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            aria-controls={`menu-panel-${tab.id}`}
            tabIndex={selected === tab.id ? 0 : -1}
            onClick={() => setSelected(tab.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {menuTabs.map((tab) => (
        <div key={tab.id} id={`menu-panel-${tab.id}`} role="tabpanel" aria-labelledby={`menu-tab-${tab.id}`} hidden={selected !== tab.id}>
          <div className="parameter-grid menu-grid">
            {summitParameters.filter((parameter) => parameter.section === tab.section).map((parameter) => <ParameterControl key={parameter.id} parameter={parameter} />)}
          </div>
        </div>
      ))}
    </PanelModule>
  )
}

type PerformanceOutput = {
  enabled: boolean
  readyMessage: string
  onNoteOn: (note: number, velocity: number) => boolean
  onNoteOff: (note: number) => boolean
  allNotesOff: () => void
}

function sendPerformanceNoteOn(profileId: string, note: number, velocity: number) {
  return profileId === 'web-synth'
    ? webAudioSynth.noteOn(note, velocity)
    : midiEngine.sendNoteOn(note, velocity)
}

function sendPerformanceNoteOff(profileId: string, note: number) {
  return profileId === 'web-synth'
    ? webAudioSynth.noteOff(note)
    : midiEngine.sendNoteOff(note)
}

function releasePerformanceNotes(profileId: string) {
  if (profileId === 'web-synth') webAudioSynth.allNotesOff()
  else midiEngine.allNotesOff()
}

function requireSynthProfile(id: typeof synthProfiles[number]['id']) {
  const profile = synthProfileById.get(id)
  if (!profile) throw new Error(`Unknown active synth profile: ${id}`)
  return profile
}

function VirtualKeyboard({ output }: { output: PerformanceOutput }) {
  const isWebSynth = usePatchStore((state) => state.activeProfileId === 'web-synth')
  const keybedRef = useRef<HTMLDivElement>(null)
  const [visibleOctaves, setVisibleOctaves] = useState(keyboardOctaves)
  const [expanded, setExpanded] = useState(true)
  const [octave, setOctave] = useState(2)
  const [velocity, setVelocity] = useState(100)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set())
  const activeNotesRef = useRef<Set<number>>(new Set())
  const keyboardHeldNotes = useRef<Set<number>>(new Set())
  const baseNote = (octave + 1) * 12
  const whiteKeys = [
    ...Array.from({ length: visibleOctaves }, (_, index) => [0, 2, 4, 5, 7, 9, 11].map((offset) => index * 12 + offset)).flat(),
    visibleOctaves * 12,
  ]
  const blackKeys = Array.from({ length: visibleOctaves }, (_, index) =>
    [1, 3, 6, 8, 10].map((offset, keyIndex) => ({
      offset: index * 12 + offset,
      position: ((index * 7 + [1, 2, 4, 5, 6][keyIndex]) / whiteKeys.length) * 100,
    })),
  ).flat()

  useEffect(() => {
    const stop = () => {
      output.allNotesOff()
      activeNotesRef.current.clear()
      keyboardHeldNotes.current.clear()
      setActiveNotes(new Set())
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    window.addEventListener('blur', stop)
    window.addEventListener('pagehide', stop)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      output.allNotesOff()
      window.removeEventListener('blur', stop)
      window.removeEventListener('pagehide', stop)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [output])
  useEffect(() => {
    const keybed = keybedRef.current
    if (!keybed || typeof ResizeObserver === 'undefined') return
    let previousOctaves = keyboardOctaves
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === 0) return
      // A black key is 70% of a white key and needs a 24px tap target.
      const nextOctaves = Math.max(1, Math.min(keyboardOctaves, Math.floor((entry.contentRect.width * 0.7 / 24 - 1) / 7)))
      if (nextOctaves === previousOctaves) return
      previousOctaves = nextOctaves
      output.allNotesOff()
      activeNotesRef.current.clear()
      keyboardHeldNotes.current.clear()
      setActiveNotes(new Set())
      setVisibleOctaves(nextOctaves)
    })
    observer.observe(keybed)
    return () => observer.disconnect()
  }, [output])

  function noteLabel(offset: number) {
    const midiNote = baseNote + offset
    const name = noteNames[midiNote % 12]
    const noteOctave = Math.floor(midiNote / 12) - 1
    return `${name} ${noteOctave}`
  }

  function playNote(note: number) {
    if (!output.enabled || activeNotesRef.current.has(note)) return false
    if (!output.onNoteOn(note, velocity)) return false
    activeNotesRef.current.add(note)
    setActiveNotes((current) => new Set(current).add(note))
    return true
  }

  function releaseNote(note: number) {
    if (!activeNotesRef.current.delete(note)) return
    output.onNoteOff(note)
    setActiveNotes((current) => {
      const next = new Set(current)
      next.delete(note)
      return next
    })
  }

  function changeOctave(nextOctave: number) {
    stopAllNotes()
    setOctave(nextOctave)
  }

  function stopAllNotes() {
    output.allNotesOff()
    activeNotesRef.current.clear()
    keyboardHeldNotes.current.clear()
    setActiveNotes(new Set())
  }

  function keyButton(offset: number, kind: 'white' | 'black', position?: number) {
    const note = baseNote + offset
    return (
      <button
        key={offset}
        type="button"
        className={`piano-key ${kind}-key${activeNotes.has(note) ? ' active-key' : ''}`}
        style={position === undefined ? undefined : { left: `${position}%`, width: `${70 / whiteKeys.length}%` }}
        aria-label={`Play ${noteLabel(offset)}`}
        aria-pressed={activeNotes.has(note)}
        disabled={!output.enabled}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          playNote(note)
        }}
        onPointerUp={() => releaseNote(note)}
        onPointerCancel={() => releaseNote(note)}
        onLostPointerCapture={() => releaseNote(note)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (event.repeat) return
          if (keyboardHeldNotes.current.has(note)) return
          if (playNote(note)) keyboardHeldNotes.current.add(note)
        }}
        onKeyUp={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (!keyboardHeldNotes.current.delete(note)) return
          releaseNote(note)
        }}
        onBlur={() => {
          if (!keyboardHeldNotes.current.delete(note)) return
          releaseNote(note)
        }}
      >
        {kind === 'white' && offset % 12 === 0 ? <span>{noteLabel(offset).replace(' ', '')}</span> : null}
      </button>
    )
  }

  return (
    <section className="keyboard-section" aria-labelledby="keyboard-title">
      <div className="keyboard-inner">
        <div className="keyboard-toolbar">
          <div className="keyboard-heading">
            <Music2 aria-hidden="true" />
            <div><span className="eyebrow">Performance</span><h2 id="keyboard-title"><SectionToggle title="Virtual keyboard" expanded={expanded} controls="keyboard-content keyboard-options" onToggle={() => {
              if (expanded) stopAllNotes()
              setExpanded((current) => !current)
            }} /></h2></div>
            {isWebSynth && <ClickControlHelp label="Virtual keyboard" text="Press and hold a piano key with a pointer, or focus it and hold Space or Enter, to play a note. Releasing it starts the envelope release stages. Notes stop if the window loses focus or the page is hidden. Each note sets oscillator pitch and triggers its own envelopes, so you can play several notes together." />}
          </div>
          <div id="keyboard-options" className="keyboard-controls" hidden={!expanded}>
            <div className="octave-control" aria-label="Keyboard octave">
              <button type="button" onClick={() => changeOctave(octave - 1)} disabled={octave <= 1} aria-label="Decrease octave"><Minus aria-hidden="true" /></button>
              <output aria-live="polite">Octave {octave}</output>
              <button type="button" onClick={() => changeOctave(octave + 1)} disabled={octave >= maxKeyboardOctave} aria-label="Increase octave"><Plus aria-hidden="true" /></button>
              {isWebSynth && <ClickControlHelp label="Keyboard octave" text="Move the keyboard note range up or down by an octave. An octave spans 12 semitones; moving up one octave doubles a note's fundamental frequency, while moving down halves it. This changes the notes you play, not oscillator detune." />}
            </div>
            <div className="web-action-with-help">
            <label className="velocity-control"><span>Velocity</span><input type="range" min="1" max="127" value={velocity} onChange={(event) => setVelocity(Number(event.target.value))} /><output>{velocity}</output></label>
            {isWebSynth && <ClickControlHelp label="Velocity" text="Set the strength of new notes, from 1 to 127. Velocity normally represents how hard a keyboard key is struck. Here it scales the amplifier envelope peak: higher velocity makes a louder note without changing its pitch or ADSR timing." />}
            </div>
            <div className="web-action-with-help">
            <button className="panic-button" type="button" onClick={stopAllNotes} disabled={!output.enabled}>All notes off</button>
            {isWebSynth && <ClickControlHelp label="All notes off" text="Stop all sounding notes, including held notes and release tails. Polyphonic synthesis keeps a separate voice for each note. This panic action clears those voices when you need silence or a note becomes stuck." />}
            </div>
          </div>
        </div>
        <div id="keyboard-content" hidden={!expanded}>
          <p className="keyboard-status" role="status">{output.readyMessage}</p>
          <div className="keyboard-keybed" role="group" aria-label="Piano keyboard">
            <div className="piano-bed" ref={keybedRef}>
              <div className="white-keys">{whiteKeys.map((offset) => keyButton(offset, 'white'))}</div>
              <div className="black-keys">{blackKeys.map(({ offset, position }) => keyButton(offset, 'black', position))}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function UltraNovaPanel() {
  const [lfo, setLfo] = useState(1)
  const [envelope, setEnvelope] = useState(2)
  const values = usePatchStore((state) => state.values)
  const controls = (section: string) => (
    <div className="parameter-grid"><ParameterGroup parameters={ultranovaParameters.filter((parameter) => parameter.section === section)} /></div>
  )
  return (
    <div className="panel-workspace">
      <div className="panel-intro">
        <span className="eyebrow">Novation UltraNova sound engine</span>
        <p>Single-part editing on the selected MIDI channel. Save your hardware patch before sending defaults.</p>
      </div>
      <div className="peak-panel ultranova-panel" aria-label="UltraNova synth panel">
        <div className="utility-module">
          <PanelModule id="ultranova-master" title="Master / Touch" className="master-module">
            <UnavailableControls>Master volume and Touch performance controls.</UnavailableControls>
          </PanelModule>
          <PanelModule id="ultranova-transfer" title="Patch transfer" className="patch-panel">
            <UnavailableControls>UltraNova SysEx import, export and edit-buffer requests. Use the Novation librarian to back up patches.</UnavailableControls>
          </PanelModule>
        </div>
        <PanelModule id="ultranova-lfo" title="LFOs" className="lfo-module">
          <div className="lfo-selector">
            {[1, 2, 3].map((index) => <button key={index} type="button" aria-pressed={lfo === index} onClick={() => setLfo(index)}>LFO {index}</button>)}
          </div>
          {controls(`LFO ${lfo}`)}
        </PanelModule>
        <PanelModule id="ultranova-amp" title="Amp envelope" className="amp-module">
          <div className="hardware-envelope-layout">
            <div className="envelope-controls">
              <ParameterGroup parameters={ultranovaParameters.filter((parameter) => parameter.section === 'Amp envelope')} />
            </div>
            <EnvelopeGraph id="ultranova-amp-graph" title="UltraNova amplifier envelope curve" attack={values.ampAttack} decay={values.ampDecay} sustain={values.ampSustain} release={values.ampRelease} />
          </div>
        </PanelModule>
        <PanelModule id="ultranova-envelopes" title="Filter / mod envelopes" className="mod-envelopes-module">
          <div className="lfo-selector">
            {[2, 3, 4, 5, 6].map((index) => <button key={index} type="button" aria-pressed={envelope === index} onClick={() => setEnvelope(index)}>{index === 2 ? 'Filter env' : `Env ${index}`}</button>)}
          </div>
          <div className="hardware-envelope-layout">
            <div className="envelope-controls">
              <ParameterGroup parameters={ultranovaParameters.filter((parameter) => parameter.section === `Envelope ${envelope}`)} />
            </div>
            <EnvelopeGraph
              id={`ultranova-envelope-${envelope}-graph`}
              title={`UltraNova envelope ${envelope} curve`}
              attack={values[`env${envelope}Attack`]}
              decay={values[`env${envelope}Decay`]}
              sustain={values[`env${envelope}Sustain`]}
              release={values[`env${envelope}Release`]}
            />
          </div>
        </PanelModule>
        <div className="oscillator-bank">
          {[1, 2, 3].map((index) => <PanelModule key={index} id={`ultranova-osc-${index}`} title={`Oscillator ${index}`} className="oscillator-module">{controls(`Oscillator ${index}`)}</PanelModule>)}
        </div>
        <PanelModule id="ultranova-mixer" title="Mixer" className="mixer-module">{controls('Mixer')}</PanelModule>
        <PanelModule id="ultranova-filter" title="Filters" className="filter-module">
          {[1, 2].map((index) => <div key={index} role="group" aria-label={`Filter ${index}`}>
            <h3 className="sub-module-title">Filter {index}</h3>{controls(`Filter ${index}`)}
          </div>)}
          {controls('Filter routing')}
        </PanelModule>
        <PanelModule id="ultranova-matrix" title="Modulation matrix" className="matrix-module">
          <UnavailableControls>UltraNova's 20-slot matrix and Touch assignments. Summit matrix mappings are not used.</UnavailableControls>
        </PanelModule>
        <PanelModule id="ultranova-arp" title="Arp" className="arp-module" help="Octave range and gate only. Arpeggiator on/off, latch, clock and patterns are not yet implemented.">{controls('Arp')}</PanelModule>
        <PanelModule id="ultranova-glide" title="Glide" className="glide-module">{controls('Glide')}</PanelModule>
        <PanelModule id="ultranova-effects" title="Effects" className="effects-module" help="Select the processor and level for each of the five effect slots. Processor settings, routing and vocoder controls are not yet implemented.">{controls('Effects')}</PanelModule>
        <PanelModule id="ultranova-voice" title="Voice / oscillator common" className="menu-module">{controls('Voice')}</PanelModule>
        <div className="panel-caption"><Waves aria-hidden="true" /><span>PEAK-inspired layout / ULTRANOVA MIDI</span><span>Documented controls only</span></div>
      </div>
    </div>
  )
}

/** Shows live engine state and raw patch values without requesting MIDI access or starting audio. */
function DebugPanel({ profile, midi, audio }: { profile: SynthProfile; midi: MidiSnapshot; audio: AudioSnapshot }) {
  const values = usePatchStore((state) => state.values)
  const input = midi.inputs.find((port) => port.id === midi.selectedInputId)
  const output = midi.outputs.find((port) => port.id === midi.selectedOutputId)

  return (
    <section id="debug-panel" className="debug-panel" aria-labelledby="debug-title">
      <h2 id="debug-title">Debug diagnostics</h2>
      <dl className="debug-summary">
        <div><dt>Profile</dt><dd>{profile.name}</dd></div>
        {profile.capabilities.audioOutput && <div><dt>Audio status</dt><dd>{audio.status}</dd></div>}
        <div><dt>MIDI status</dt><dd>{midi.status}</dd></div>
        <div><dt>MIDI input</dt><dd>{input ? `${input.name} (${input.state})` : 'No input selected'}</dd></div>
        {profile.capabilities.midiOutput && <div><dt>MIDI output</dt><dd>{output ? `${output.name} (${output.state})` : 'No output selected'}</dd></div>}
        <div><dt>MIDI channel</dt><dd>{midi.channel}</dd></div>
        <div><dt>Latest MIDI activity</dt><dd>{midi.activity}</dd></div>
        {midi.error && <div><dt>MIDI error</dt><dd>{midi.error}</dd></div>}
        {profile.capabilities.audioOutput && audio.error && <div><dt>Audio error</dt><dd>{audio.error}</dd></div>}
      </dl>
      <p>{profile.capabilities.midiOutput ? 'CC and NRPN addresses are also shown beneath hardware controls.' : 'Web Synth parameters drive built-in audio, not MIDI CC or NRPN output.'}</p>
      <details key={profile.id}>
        <summary>Parameter values ({profile.parameters.length})</summary>
        <div className="debug-values" role="region" aria-label="Debug parameter values" tabIndex={0}>
          <table>
            <caption>Current raw parameter values</caption>
            <thead><tr><th scope="col">Parameter</th><th scope="col">Value</th></tr></thead>
            <tbody>{profile.parameters.map((parameter) => <tr key={parameter.id}><th scope="row">{parameter.id}</th><td>{values[parameter.id]}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

function App() {
  const [debug, setDebug] = useState(false)
  const midi = useMidi()
  const activeProfileId = usePatchStore((state) => state.activeProfileId)
  const setActiveProfile = usePatchStore((state) => state.setActiveProfile)
  const audio = useSyncExternalStore(webAudioSynth.subscribe, webAudioSynth.getSnapshot)
  const activeProfile = requireSynthProfile(activeProfileId)
  const inputHeldNotes = useRef<number[]>([])
  const keyboardOutput = useMemo<PerformanceOutput>(() => ({
    enabled: activeProfileId === 'web-synth' ? audio.status === 'ready' : Boolean(midi.selectedOutputId),
    readyMessage: activeProfileId === 'web-synth'
      ? audio.status === 'ready' ? 'Ready on built-in audio output.' : 'Start audio to enable the virtual keyboard.'
      : midi.selectedOutputId ? 'Ready on selected MIDI output.' : 'Select a MIDI output to play.',
    onNoteOn: (note, velocity) => sendPerformanceNoteOn(activeProfileId, note, velocity),
    onNoteOff: (note) => sendPerformanceNoteOff(activeProfileId, note),
    allNotesOff: () => {
      inputHeldNotes.current = []
      releasePerformanceNotes(activeProfileId)
    },
  }), [activeProfileId, audio.status, midi.selectedOutputId])
  const rawPatch = usePatchStore((state) => state.summitState.rawPatch)
  const rawPatchSource = usePatchStore((state) => state.summitState.rawPatchSource)
  const setRawPatch = usePatchStore((state) => state.setRawPatch)
  const resetValues = usePatchStore((state) => state.resetValues)
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileMessage, setFileMessage] = useState('No patch captured or imported.')

  useEffect(() => {
    inputHeldNotes.current = []
    const releaseInputNotes = () => {
      inputHeldNotes.current.splice(0).forEach((note) => sendPerformanceNoteOff(activeProfileId, note))
    }
    const unsubscribe = midiEngine.subscribeToInputNotes((event) => {
      if (event.type === 'allNotesOff') {
        releaseInputNotes()
      } else if (event.type === 'noteOn') {
        if (sendPerformanceNoteOn(activeProfileId, event.note, event.velocity)) inputHeldNotes.current.push(event.note)
      } else {
        const heldIndex = inputHeldNotes.current.lastIndexOf(event.note)
        if (heldIndex < 0) return
        inputHeldNotes.current.splice(heldIndex, 1)
        sendPerformanceNoteOff(activeProfileId, event.note)
      }
    })
    return () => {
      releaseInputNotes()
      unsubscribe()
    }
  }, [activeProfileId])

  async function importPatch(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const validation = validateSysex(bytes)
    if (!validation.valid) {
      setFileMessage(validation.reason ?? 'Invalid SysEx file.')
      event.target.value = ''
      return
    }
    setRawPatch(bytes, 'file')
    setFileMessage(`Imported ${file.name} (${bytes.length} bytes).`)
    event.target.value = ''
  }

  function exportPatch() {
    if (!rawPatch) return
    const blob = new Blob([rawPatch as BlobPart], { type: 'audio/x-midi' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'summit-edit-buffer.syx'
    link.click()
    URL.revokeObjectURL(url)
    setFileMessage(`Exported ${rawPatch.length} raw SysEx bytes.`)
  }

  function resetPatch() {
    resetValues()
    const sent = activeProfile.capabilities.midiOutput && midiEngine.resetHardwareToDefaults()
    setFileMessage(sent ? `Defaults restored locally and sent to ${activeProfileId === 'summit' ? 'Summit' : 'UltraNova'}.` : 'Defaults restored locally.')
  }

  return (
    <div className={`app-shell${activeProfileId === 'ultranova' ? ' ultranova-theme' : ''}${debug ? ' debug-mode' : ''}`}>
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 40" fill="none">
              <path d="M0 15c4 2 8 2 13 1 3-4 8-5 13-3l2-3 3 4 3-2 3 5 9 1c1 0 2 1 2 2v2H35c-2 4-6 6-11 6h-5l-1 5h-4l1-5H9l-2 5H3l4-8c-3-2-6-6-7-10Z" fill="currentColor" />
              <path d="M33 22h13" stroke="#233229" strokeWidth="1.5" strokeLinecap="round" />
              <path d="m35 22 2 3 2-3m2 0 2 3 2-3" fill="none" stroke="#233229" strokeWidth="1.1" strokeLinejoin="round" />
              <circle cx="30" cy="15" r="2" fill="#233229" />
              <circle cx="45" cy="17" r="1" fill="#233229" />
            </svg>
          </div>
          <div><h1>Patch<span>Gator</span></h1><p>Synth patch designer</p></div>
        </div>
        <div className="patch-identity">
          <label><span>Synth profile</span><select aria-label="Synth profile" value={activeProfileId} onChange={(event) => setActiveProfile(event.target.value as typeof activeProfileId)}>
            {synthProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select></label>
          <strong>WEB SYNTH TOOLS</strong>
        </div>
      </header>

      {(activeProfile.capabilities.midiInput || activeProfile.capabilities.midiOutput) && <section className="connection-strip" aria-labelledby="connection-title">
        <div className="connection-status">
          <span className={`status-light status-${midi.status}`} aria-hidden="true" />
          <div><span className="eyebrow" id="connection-title">{activeProfile.capabilities.midiOutput ? 'Hardware link' : 'Optional MIDI input'}</span><strong>{midi.status === 'ready' ? 'MIDI ready' : midi.status === 'unsupported' ? 'Offline editor' : midi.status}</strong></div>
        </div>
        <button className="primary-action" type="button" onClick={() => midiEngine.connect()} disabled={midi.status === 'unsupported' || midi.status === 'requesting'}>
          <Power aria-hidden="true" />{midi.status === 'requesting' ? 'Requesting...' : 'Connect MIDI'}
        </button>
        <label><span>Input</span><select value={midi.selectedInputId} onChange={(event) => midiEngine.selectInput(event.target.value)} disabled={midi.status !== 'ready'}><option value="">No input</option>{midi.inputs.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}</select></label>
        {activeProfile.capabilities.midiOutput && <label><span>Output</span><select value={midi.selectedOutputId} onChange={(event) => midiEngine.selectOutput(event.target.value)} disabled={midi.status !== 'ready'}><option value="">No output</option>{midi.outputs.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}</select></label>}
        <label className="channel-select"><span>Channel</span><select value={midi.channel} onChange={(event) => midiEngine.setChannel(Number(event.target.value))}>{Array.from({ length: 16 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
        <button className="icon-button" type="button" onClick={() => midiEngine.refreshPorts()} title="Refresh MIDI ports" aria-label="Refresh MIDI ports" disabled={midi.status !== 'ready'}><RefreshCw aria-hidden="true" /></button>
        <p className="status-message" role="status" aria-live="polite">{midi.error ?? midi.activity}</p>
      </section>}

      <main>
        {activeProfile.id === 'summit' ? <div className="panel-workspace">
          <div className="panel-intro">
            <div><span className="eyebrow">{activeProfile.name} sound engine</span></div>
            <p>Editing uses the selected MIDI channel. Independent A/B layer editing is not yet implemented.</p>
          </div>
          <div className="peak-panel" aria-label="PEAK-style synth panel">
            <div className="utility-module">
              <PanelModule id="master-title" title="Master / Animate" className="master-module">
                <UnavailableControls>Master volume and Animate switches.</UnavailableControls>
              </PanelModule>
              <PanelModule id="patch-panel-title" title="Patch transfer" className="patch-panel" eyebrow="Raw SysEx">
                <p className="patch-state">{rawPatch ? `${rawPatch.length} bytes / ${rawPatchSource === 'device' ? 'Captured' : 'Imported'}` : fileMessage}</p>
                <div className="patch-actions">
                  <button type="button" onClick={() => midiEngine.requestEditBuffer()} disabled={!midi.selectedOutputId} title="Experimental: request the Summit edit buffer"><Download aria-hidden="true" /> Fetch <span>EXP</span></button>
                  <button type="button" onClick={() => fileInput.current?.click()}><Upload aria-hidden="true" /> Import</button>
                  <input ref={fileInput} className="visually-hidden" type="file" accept=".syx,audio/x-midi" aria-label="Import SysEx patch file" onChange={importPatch} />
                  <button type="button" onClick={exportPatch} disabled={!rawPatch}><FileInput aria-hidden="true" /> Export</button>
                  <button type="button" onClick={() => rawPatch && midiEngine.sendSysex(rawPatch)} disabled={!rawPatch || !midi.selectedOutputId}><Send aria-hidden="true" /> Send</button>
                </div>
              </PanelModule>
            </div>
            <LfoModule />
            <EnvelopeView />
            <ModEnvelopeModule />
            <div className="oscillator-bank">
              {[1, 2, 3].map((oscillator) => {
                const parameters = summitParameters.filter((parameter) => parameter.section === `Oscillator ${oscillator}`)
                return (
                  <PanelModule key={oscillator} id={`oscillator-${oscillator}-title`} title={`Oscillator ${oscillator}`} className="oscillator-module" help="Each source has its own depth, centred at 0.">
                    <div className="parameter-grid">{parameters.map((parameter) => <ParameterControl key={parameter.id} parameter={parameter} />)}</div>
                  </PanelModule>
                )
              })}
            </div>
            <PanelModule id="mixer-title" title="Mixer" className="mixer-module">
              <div className="parameter-grid"><ParameterGroup parameters={mixerParameters} /></div>
            </PanelModule>
            <FilterModule />
            <ModMatrixModule />
            <PanelModule id="arp-title" title="Arp" className="arp-module">
              <UnavailableControls>Gate, key latch and arpeggiator on/off.</UnavailableControls>
            </PanelModule>
            <PanelModule id="glide-title" title="Glide" className="glide-module">
              <div className="parameter-grid"><ParameterGroup parameters={parametersInSection('Glide')} /></div>
            </PanelModule>
            <PanelModule id="effects-title" title="Effects" className="effects-module" help="Effect levels only. Other effect controls and bypass are not yet implemented.">
              <div className="effects-bank">
              <div className="effects-top-row">
                {summitParameters.filter((parameter) => parameter.id === 'distortionLevel' || parameter.id === 'chorusLevel').map((parameter) => (
                  <PanelModule key={parameter.id} id={`${parameter.id}-title`} title={parameter.shortLabel} className="effect-module">
                    <ParameterControl parameter={parameter} />
                  </PanelModule>
                ))}
              </div>
              {summitParameters.filter((parameter) => parameter.id === 'delayLevel' || parameter.id === 'reverbLevel').map((parameter) => (
                <PanelModule key={parameter.id} id={`${parameter.id}-title`} title={parameter.shortLabel} className="effect-module">
                  <ParameterControl parameter={parameter} />
                </PanelModule>
              ))}
              </div>
            </PanelModule>
            <MenuSettingsModule />
            <div className="panel-caption"><Waves aria-hidden="true" /><span>PEAK-inspired layout / SUMMIT MIDI</span><span>Documented controls only</span></div>
          </div>
        </div> : activeProfileId === 'ultranova' ? <UltraNovaPanel /> : <WebSynthPanel audio={audio} />}
      </main>

      {(activeProfile.capabilities.audioOutput || activeProfile.capabilities.midiOutput) && <VirtualKeyboard key={`${activeProfileId}:${activeProfileId === 'web-synth' ? audio.status : midi.selectedOutputId}`} output={keyboardOutput} />}

      {debug && <DebugPanel profile={activeProfile} midi={midi} audio={audio} />}

      <footer className="app-footer">
        {activeProfile.capabilities.midiOutput && <div><Cable aria-hidden="true" /><span>{activeProfile.capabilities.sysex ? 'Web MIDI / SysEx' : 'Web MIDI / CC + NRPN'}</span></div>}
        {activeProfile.capabilities.audioOutput && <div><Waves aria-hidden="true" /><span>Web Audio / optional MIDI input</span></div>}
        <p>Best in current Chrome, Edge, or Firefox on desktop. Web MIDI requires HTTPS or localhost; built-in audio does not require MIDI.</p>
        <div className="footer-actions">
          <button type="button" aria-pressed={debug} aria-controls="debug-panel" onClick={() => setDebug((current) => !current)} title="Show engine diagnostics and parameter values">Debug</button>
          <button type="button" onClick={resetPatch}><RotateCcw aria-hidden="true" /> Reset defaults</button>
        </div>
      </footer>
    </div>
  )
}

export default App
