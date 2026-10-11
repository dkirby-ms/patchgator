import { webSynthDefaultValues, type WebSynthParameterId } from './webSynthProfile'

export const tutorialDismissedStorageKey = 'zinth.web-synth-tutorial-dismissed.v1'

/** A self-paced lesson with an illustrative diagram, actions, and a bass patch target. */
export type TutorialLesson = {
  title: string
  shortTitle: string
  takeaway: string
  concept: string
  challenge: readonly string[]
  listen: string
  visual: 'harmonics' | 'blend' | 'filter' | 'amplitude' | 'brightness' | 'vibrato' | 'preset'
  visualCaption: string
  parameters: readonly WebSynthParameterId[]
  complete: (values: Readonly<Record<string, number>>) => boolean
}

export const tutorialInitialValues = {
  ...webSynthDefaultValues,
  osc1Wave: 0,
  osc2Wave: 2,
  osc2Level: 0,
  osc2Detune: 0,
  filterCutoff: 12000,
  filterResonance: 0,
  filterEnvelopeAmount: 0,
  lfoPitchDepth: 0,
  lfoFilterDepth: 0,
  lfoResonanceDepth: 0,
  ampAttack: 5,
  ampDecay: 0,
  ampSustain: 100,
  ampRelease: 80,
  filterAttack: 0,
  filterDecay: 0,
  filterSustain: 100,
  filterRelease: 80,
  polyphony: 1,
  unisonVoices: 1,
}

export const subtractiveLessons: readonly TutorialLesson[] = [
  {
    title: 'Start with a sawtooth bass',
    shortTitle: 'Wave',
    takeaway: 'Sawtooth gives your plucky bass a buzzy body to sculpt.',
    concept: 'An oscillator repeats a waveform to make sound. Sine contains one frequency: the fundamental. Sawtooth and square add harmonics, higher frequencies that make the same note sound brighter.',
    challenge: [
      'Start audio, then play C2 with Sine selected. Use Decrease octave for a deeper C1 bass.',
      'In Oscillator 1, choose Sawtooth. Play the same note, then compare it with Square.',
      'Finish on Sawtooth. This patch is mono (one note at a time), with one unison voice.',
    ],
    listen: 'Sine sounds smooth and pure. Sawtooth sounds buzzy; Square has a hollow edge. The pitch stays the same, but the tone changes.',
    visual: 'harmonics',
    visualCaption: 'Each bar is a frequency in the sound. Sine has just the fundamental; a sawtooth adds higher harmonics. These are the ingredients a filter can subtract.',
    parameters: ['osc1Wave'],
    complete: (v) => v.osc1Wave === 2,
  },
  {
    title: 'Add a little bass body',
    shortTitle: 'Blend',
    takeaway: 'A quieter second sawtooth adds body without overpowering the bass.',
    concept: 'The mixer combines the oscillators. Detune shifts pitch by cents (100 cents is one semitone). A small difference makes the waves move in and out of alignment, creating a slow pulse called beating. This is not FM.',
    challenge: [
      'Choose Sawtooth for Oscillator 2. Set Mixer levels to 80-100% for Oscillator 1 and 15-40% for Oscillator 2; try 100% and 25%.',
      'Set Oscillator 1 detune to 0 cents and Oscillator 2 to -5 through +5 cents; try +3 for thickness.',
      'Hold a note. Compare the blend with Oscillator 2 level at 0%, then bring it back into the target range.',
    ],
    listen: 'Listen for a gentle pulsing or thicker tone, rather than two separate notes. More detune makes the beating faster.',
    visual: 'blend',
    visualCaption: 'Two waves with slightly different frequencies gradually slip out of alignment. Their sum gets stronger and weaker, producing beating.',
    parameters: ['osc1Detune', 'osc1Shape', 'osc2Wave', 'osc2Detune', 'osc2Shape', 'osc1Level', 'osc2Level'],
    complete: (v) => v.osc2Wave === 2 && v.osc1Level >= 80 && v.osc1Level <= 100
      && v.osc2Level >= 15 && v.osc2Level <= 40 && v.osc1Detune === 0 && Math.abs(v.osc2Detune) <= 5,
  },
  {
    title: 'Darken the bass body',
    shortTitle: 'Filter',
    takeaway: 'A low cutoff keeps the bass round, leaving room for a bright opening snap.',
    concept: 'A low-pass (LP) filter lets lower frequencies through and reduces higher ones above the cutoff. Resonance emphasizes the area around the cutoff. In this synth, the oscillators mix before passing through one shared filter.',
    challenge: [
      'In Filter, choose LP to shape both oscillators together.',
      'Set cutoff to 200-600 Hz; try 350 Hz. Set resonance to 10-30%; try 20%.',
      'Play a note while lowering and raising cutoff. Finish inside the target ranges.',
    ],
    listen: 'Lower cutoff should make the sound darker or softer in tone. Resonance adds a more focused, sometimes whistling edge near the cutoff.',
    visual: 'filter',
    visualCaption: 'The solid curve is a low-pass response: low frequencies pass, while higher harmonics are reduced. The small bump near cutoff represents resonance.',
    parameters: ['filterType', 'filterCutoff', 'filterResonance'],
    complete: (v) => v.filterType === 0 && v.filterCutoff >= 200 && v.filterCutoff <= 600
      && v.filterResonance >= 10 && v.filterResonance <= 30,
  },
  {
    title: 'Make the bass pluck',
    shortTitle: 'Shape',
    takeaway: 'A fast attack and short decay turn the held tone into a punchy bass pluck.',
    concept: 'The amplifier envelope changes loudness over the life of a note. Attack rises to a peak; decay falls to the sustain level while you hold the key. Release fades to silence after you let go. Sustain is a level, not a duration.',
    challenge: [
      'In Amp envelope, set attack to 0-10 ms and decay to 150-400 ms. Try 5 ms and 250 ms.',
      'Set sustain to 0-15% and release to 50-150 ms. Try 10% and 80 ms.',
      'Tap a key, then hold one. Watch the envelope curve below as you change the controls.',
    ],
    listen: 'Hear a quick punch that fades even while you hold the key. After key-up, the short tail leaves space for the next bass note instead of washing together like a pad.',
    visual: 'amplitude',
    visualCaption: 'Read left to right: loudness rises during attack, falls during decay, stays at sustain while held, and fades during release after key-up. The control graph below responds to your settings.',
    parameters: ['ampAttack', 'ampDecay', 'ampSustain', 'ampRelease'],
    complete: (v) => v.ampAttack >= 0 && v.ampAttack <= 10 && v.ampDecay >= 150 && v.ampDecay <= 400
      && v.ampSustain >= 0 && v.ampSustain <= 15 && v.ampRelease >= 50 && v.ampRelease <= 150,
  },
  {
    title: 'Add the filter snap',
    shortTitle: 'Brightness',
    takeaway: 'A short filter envelope gives each bass note a bright snap, then a round body.',
    concept: 'The filter envelope moves cutoff above its base setting each time a note starts. Amount controls how far it moves. The amp envelope still shapes loudness; the filter envelope shapes brightness.',
    challenge: [
      'In Filter envelope, set amount to 25-50%; try 35%.',
      'Set attack to 0-10 ms, decay to 100-350 ms, sustain to 0-10%, and release to 50-150 ms. Try 0 ms, 180 ms, 0%, and 80 ms.',
      'Repeat low notes. Compare amount at 0%, then return to 25-50%. Keep base cutoff at 200-600 Hz.',
    ],
    listen: 'Listen for a bright opening that mellows as the note continues. Each new note restarts that change, even when the base cutoffs stay still.',
    visual: 'brightness',
    visualCaption: 'This curve represents cutoff movement, not volume. A note starts at base cutoff, opens the filter, then settles. Amount controls the height of that movement.',
    parameters: ['filterEnvelopeAmount', 'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease'],
    complete: (v) => v.filterEnvelopeAmount >= 25 && v.filterEnvelopeAmount <= 50
      && v.filterAttack >= 0 && v.filterAttack <= 10 && v.filterDecay >= 100 && v.filterDecay <= 350
      && v.filterSustain >= 0 && v.filterSustain <= 10 && v.filterRelease >= 50 && v.filterRelease <= 150,
  },
  {
    title: 'Keep the bass pitch steady',
    shortTitle: 'Steady pitch',
    takeaway: 'Try vibrato, then turn it off to keep the bass steady.',
    concept: 'A low-frequency oscillator (LFO) cycles slowly to move another control. Rate is the number of cycles per second, in Hz. Pitch depth is how far the pitch moves, in cents. Small pitch movements are called vibrato.',
    challenge: [
      'In LFO, set rate to 2-8 Hz; try 4 Hz.',
      'Try pitch depth at 20 cents and hold a low note to hear vibrato. This is only a comparison.',
      'Finish with all three depths at 0. Play short C2, G2, C2 notes (or C1, G1, C1) to hear your plucky bass.',
    ],
    listen: 'Raised pitch depth makes the note sway. At zero, hear a steady bass with a punchy start and short tail. This recipe leaves repeating LFO movement off.',
    visual: 'vibrato',
    visualCaption: 'The wave repeats around the original pitch (dashed line). Rate controls cycles per second; depth controls the distance above and below that pitch.',
    parameters: ['lfoRate', 'lfoPitchDepth', 'lfoFilterDepth', 'lfoResonanceDepth'],
    complete: (v) => v.lfoRate >= 2 && v.lfoRate <= 8 && v.lfoPitchDepth === 0
      && v.lfoFilterDepth === 0 && v.lfoResonanceDepth === 0,
  },
]

/** The save step uses the same explainer structure but completes through a successful preset save. */
export const tutorialSaveLesson = {
  title: 'Save your plucky bass',
  shortTitle: 'Save',
  takeaway: 'You built a classic plucky synth bass: save the recipe and use it in a bass line.',
  concept: 'A preset stores your oscillator, mixer, filter, envelope, and LFO settings together. It remembers how to make the sound, not a recording of the notes you played.',
  challenge: [
    'Play short low notes once more. Check for sawtooth body, a bright filter snap, a short tail, and steady pitch.',
    'Enter a descriptive preset name below, such as "Classic plucky bass".',
    'Choose Save preset to check off the final step and unlock the full editor.',
  ],
  listen: 'Listen for a punchy low note that starts bright and quickly becomes round and quiet. Once saved, your bass appears under Your browser presets. Try your own variations in the full editor.',
  visual: 'preset',
  visualCaption: 'One preset keeps the whole sound recipe together. Presets are saved only in this browser and site; clearing site data removes them.',
} satisfies Omit<TutorialLesson, 'parameters' | 'complete'>

export function tutorialParameters(step: number) {
  return new Set(subtractiveLessons.slice(0, step + 1).flatMap((lesson) => lesson.parameters))
}

/** Checks every unlocked target so later edits cannot invalidate the bass recipe. The save step checks all lessons. */
export function tutorialComplete(step: number, values: Readonly<Record<string, number>>) {
  return subtractiveLessons.slice(0, step + 1).every((lesson) => lesson.complete(values))
}
