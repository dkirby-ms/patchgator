# PatchGator

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

## Connect a synth

1. Power on the synth and choose its profile in the app.
2. Click **Connect MIDI** and allow access.
3. Select the MIDI input, output, and channel.

## Useful commands

```bash
npm run dev     # start the app
npm run build   # production build
npm run test    # run tests
```

## Notes

- The built-in Web Synth is the default profile.
- Summit supports raw patch transfer and live control editing.
- UltraNova editing is supported for many controls, though some hardware features are still not implemented.

## Azure hosting

The app publishes to Azure Static Web Apps using Bicep and GitHub Actions with
GitHub OIDC authentication. See [Azure hosting setup](docs/azure-hosting.md) for
the one-time resource group, identity, and GitHub variable configuration.
