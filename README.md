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
- Match a local reference recording on a Summit or UltraNova with a Foundry-hosted agent and local Python studio tools

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

## Match a sound with the Foundry agent

PatchGator's optional Python studio worker uses a Microsoft Foundry prompt agent for
high-level guidance while keeping audio capture, MIDI control, and candidate search
on the local computer. See [docs/sound-matching-agent.md](docs/sound-matching-agent.md)
for installation and configuration. The worker only contacts the configured Foundry
project over authenticated outbound HTTPS; it does not expose a local studio endpoint.
Reference audio stays local; the agent receives numerical analysis and match results.

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

The optional local studio tools are installed and run separately from the browser app:

```powershell
Set-Location studio
uv sync
uv run patchgator-studio devices midi
uv run patchgator-studio devices audio
```

## Notes

- Summit supports raw patch transfer and live control editing.
- UltraNova editing is supported for many controls, though some hardware features are still not implemented.
