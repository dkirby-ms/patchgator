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

## Build your first patch

Choose **Start tutorial** in the built-in Web Synth to build a classic plucky
synth bass for electronic and pop bass lines. The guided recipe uses sawtooth
oscillators, one shared low-pass filter, short amplifier and filter envelopes, and steady
pitch instead of a long pad-like tail. Start audio and try low notes around C2.

The compact **Output spectrum** beside the virtual piano keys shows 12 bands of
live bass, midrange, and treble energy while you play. It stacks below the keys
on narrow screens and collapses with the keyboard. It measures the mixed output without changing the sound;
it is not an adjustable EQ. Frequencies run left to right on a logarithmic scale.
Use **Pause spectrum** to freeze the display. Reduced-motion preferences start
it paused, and updates stop while the browser tab is hidden.

## Connect a synth

1. Power on the synth and choose its profile in the app.
2. Click **Connect MIDI** and allow access.
3. Select the MIDI input, output, and channel.

## Useful commands

Click **Debug** in the footer to show live audio and MIDI status, selected ports,
the MIDI channel, recent MIDI activity, and errors. Expand **Parameter values**
to inspect the current raw patch values. Hardware profiles also show CC and
NRPN addresses beneath their controls. 

```bash
npm run dev     # start the app
npm run build   # production build
npm run test    # run tests
```

## Notes

- Summit supports raw patch transfer and live control editing.
- UltraNova editing is supported for many controls, though some hardware features are still not implemented.
