---
title: PatchGator
description: Browser-based synth patch editing and guided sound design
---

PatchGator is a browser-based synth patch editor for creating and fine-tuning sounds on a built-in Web Synth and, optionally, Novation Summit or UltraNova hardware over MIDI.

## What it is

- Edit synth parameters in the browser
- Use a built-in virtual synth with a keyboard and tutorial
- Connect to supported Novation hardware via Web MIDI
- Import/export patch data and transfer raw Summit patches

## Get started

```bash
npm install
npm run dev
```

Then open the local Vite URL in Chrome or Edge.

## Build your first bass

Choose **Start tutorial** in the built-in Web Synth to build a classic plucky
synth bass for electronic and pop bass lines. The guided recipe uses sawtooth
oscillators, one shared low-pass filter, short amplifier and filter envelopes, and steady
pitch instead of a long pad-like tail. Start audio and try low notes around C1-C2.

Six steps unlock controls as you learn, followed by a preset-save step.
The checklist marks each step complete when you continue; saving successfully
checks off the final step. There are no badges or XP.
Earlier targets must still be met before continuing or saving. Starting replaces
your current patch; exiting keeps your work. Listening is optional, and your
saved preset stays in this browser.

The Web Synth mixes both oscillators into one selectable LP, HP, or BP filter
per note. Cutoff, resonance, the filter envelope, and filter LFO assignments
shape the mixed sound. Existing browser presets use their former Oscillator 1
filter settings for the shared filter; presets with different oscillator filters
may sound different. Reading presets leaves browser data untouched, and the next
successful save stores all presets in the single-filter format.

## Connect a synth

1. Power on the synth and choose its profile in the app.
2. Click **Connect MIDI** and allow access.
3. Select the MIDI input, output, and channel.

## Useful commands

Click **Debug** in the footer to show live audio and MIDI status, selected ports,
the MIDI channel, recent MIDI activity, and errors. Expand **Parameter values**
to inspect the current raw patch values. Hardware profiles also show CC and
NRPN addresses beneath their controls. Debug does not start audio or request
MIDI access.

```bash
npm run dev     # start the app
npm run build   # production build
npm run test    # run tests
```

## Notes

- The built-in Web Synth is the default profile.
- Summit supports raw patch transfer and live control editing.
- UltraNova editing is supported for many controls, though some hardware features are still not implemented.
