# Foundry sound-matching agent

PatchGator uses a Microsoft Foundry **prompt agent** for model reasoning and a
local Python worker for studio tools. Foundry requests local function calls; the
worker executes them on the user's computer and sends structured results back over
the authenticated Foundry connection. No local listener, public studio endpoint,
audio upload, Azure resource provisioning, or agent deployment is required by the
development workflow.

The worker keeps the sound-matching inner loop local: it can record a short reference
clip from an explicitly selected audio-interface input or read an isolated-note WAV,
then captures one note at a time from the interface and compares spectral-band
energy and RMS level. It uses a bounded coordinate search
over five registered CC controls for the Summit or UltraNova. Foundry receives only
numerical summaries, candidate scores, and the resulting parameter recipe.

## Requirements

- Python 3.11 or later and [uv](https://docs.astral.sh/uv/)
- An existing Microsoft Foundry project and model deployment
- Azure CLI sign-in for `DefaultAzureCredential` (`az login`)
- The Summit or UltraNova, MIDI output, and audio-interface input you intend to use

No Azure project or model is created by this repository. The `setup-agent` command
creates a prompt-agent version inside the configured existing Foundry project; it
does not provision infrastructure or deploy an agent container.

## Install and configure

From the repository root:

```powershell
Set-Location studio
uv sync
Copy-Item .env.example .env
```

Edit `studio/.env` with an existing project endpoint and model deployment name:

```dotenv
FOUNDRY_PROJECT_ENDPOINT=https://<account>.services.ai.azure.com/api/projects/<project>
FOUNDRY_MODEL_NAME=<existing-model-deployment>
FOUNDRY_AGENT_NAME=PatchGatorSoundMatcher
```

Sign in to Azure, then register the prompt agent and its function definitions:

```powershell
az login
uv run patchgator-studio setup-agent
```

The worker uses `DefaultAzureCredential`; no key or token is stored in the project.
The agent setup and each chat are outbound HTTPS calls to the configured Foundry
project. The worker never accepts inbound network requests.

## Discover devices and analyze a reference

Use the discovery commands to choose exact MIDI and audio device settings; do not
guess port names, audio inputs, channels, or sample rates:

```powershell
uv run patchgator-studio devices midi
uv run patchgator-studio devices audio
uv run patchgator-studio record-reference `
  --audio-device 3 `
  --audio-channel 1 `
  --sample-rate 48000 `
  --duration-seconds 2
uv run patchgator-studio analyze --reference C:\audio\isolated-note.wav
```

Use an isolated, dry note that represents the sound to match. Audio input channel
numbers are 1-based. The selected sample rate must be supported by the chosen audio
device. Live recording is limited to 0.2–15 seconds and asks for `RECORD` before
opening the input. Reference clips are saved locally in `studio/references/`.
`analyze` only reads the WAV file and does not open MIDI or record audio.

## Start an interactive session

Use the exact discovered device index and MIDI output name. Set the MIDI channel,
audio input channel, and sample rate explicitly:

```powershell
uv run patchgator-studio chat `
  --synth summit `
  --midi-output "MIDI Output Name" `
  --midi-channel 1 `
  --audio-device 3 `
  --audio-channel 1 `
  --sample-rate 48000 `
  --note 60
```

Use `--synth ultranova` for the UltraNova. The agent can analyze the selected
reference file without touching hardware. If `--reference` is omitted, ask the
agent to record a live reference; the local worker asks for `RECORD` before opening
the audio input. If the user asks it to run a match, the local worker displays the
target device and asks for the exact word `MATCH` before opening the MIDI output or
recording candidate audio. Declining either confirmation leaves hardware untouched.

The match applies the five search controls' registered defaults and tests coarse
values 0, 32, 64, 96, and 127, retaining the best score at each coordinate. It
plays MIDI note 60 by default at velocity 64 and captures 0.8 seconds per
measurement. The search is limited to 26 measurements. No volume controls, SysEx,
MIDI input, or preset-save operation is used. The best settings remain in the
synth's current edit buffer; the worker does not restore the prior values or write
a native preset. It writes a timestamped JSON **parameter recipe and trial history**
to `studio/results/`, which is ignored by Git.

Keep hardware monitoring at a conservative level. For reliable comparisons, match
the reference note, tuning, effects, and recording path as closely as possible.
The initial feature metric is a relative search score, not a claim of exact
perceptual matching.

## MIDI scope and source documentation

The worker intentionally exposes only five controls per synth. Their CC addresses
and raw 0–127 ranges mirror the corresponding existing PatchGator profile
definitions. The initial search does not claim full patch editing, wavetable
selection, NRPN support, SysEx transfer, or native preset serialization. The
recipe is not a complete synth preset.

- [Novation Summit downloads](https://downloads.novationmusic.com/novation/synthesisers/summit) — includes the official Summit / Peak 2.0 MIDI implementation addendum.
- [Official Summit / Peak 2.0 addendum (PDF)](https://downloads.novationmusic.com/sites/novation/files/novation/downloads/17273/summit_peak_fw2_addendum_en.pdf)
- [Novation UltraNova downloads](https://downloads.novationmusic.com/novation/synthesisers/ultranova) — official UltraNova documentation and downloads.
- [UltraNova User Guide (PDF)](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/UltraNova%20User%20Guide%20-%20English.pdf)

The Foundry function-calling pattern is documented in Microsoft's
[function calling with Foundry agents](https://learn.microsoft.com/azure/foundry/agents/how-to/tools/function-calling)
guide. The agent asks the calling application to execute a function; the local
worker performs that execution and returns the result.

## Validation boundary

Unit tests exercise feature extraction, control definitions, and the optimizer with
simulated captures. No Foundry project, synth, audio interface, or MIDI output is
accessed by tests. Real-device port selection, audio levels, latency, and the
hardware's response to the registered mappings still require validation in the
user's studio.
