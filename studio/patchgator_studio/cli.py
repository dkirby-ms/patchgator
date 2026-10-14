from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from .audio import load_audio
from .controls import MAX_MEASUREMENTS
from .devices import audio_devices, midi_ports
from .foundry_agent import TOOL_DEFINITIONS, create_foundry_agent, run_agent_turn
from .hardware import (
    ConfirmationDeclined,
    confirm_audio_recording,
    confirm_hardware_change,
    open_midi_output,
    record_audio_input,
    verify_capture_configuration,
)
from .optimizer import (
    analyze_reference,
    run_configured_match,
    save_match_result,
    save_reference_recording,
)


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Set {name} in the environment or studio/.env before using Foundry.")
    return value


def _load_dotenv() -> None:
    load_dotenv(Path.cwd() / ".env", override=False)


def _create_agent(args: argparse.Namespace) -> None:
    _load_dotenv()
    result = create_foundry_agent(
        _required_env("FOUNDRY_PROJECT_ENDPOINT"),
        _required_env("FOUNDRY_MODEL_NAME"),
        os.environ.get("FOUNDRY_AGENT_NAME", "PatchGatorSoundMatcher"),
    )
    print(json.dumps(result, indent=2))


def _dispatch_tool(
    name: str,
    arguments: dict[str, Any],
    *,
    config: argparse.Namespace,
    reference_state: dict[str, Path | None],
) -> dict[str, Any]:
    if arguments:
        raise ValueError(f"{name} does not accept arguments.")
    if name == "record_reference":
        try:
            confirm_audio_recording(
                audio_device=config.audio_device,
                audio_channel=config.audio_channel,
                sample_rate=config.sample_rate,
                duration_seconds=config.record_duration,
            )
        except ConfirmationDeclined as error:
            return {"status": "cancelled", "error": str(error), "hardware_touched": False}
        audio = record_audio_input(
            audio_device=config.audio_device,
            audio_channel=config.audio_channel,
            sample_rate=config.sample_rate,
            duration_seconds=config.record_duration,
        )
        reference_state["path"] = save_reference_recording(audio, config.sample_rate)
        return {
            "status": "recorded",
            "duration_seconds": round(len(audio) / config.sample_rate, 3),
            "sample_rate": config.sample_rate,
            "note": "Reference audio remains in the local studio references folder.",
        }
    if name == "analyze_reference":
        reference_path = reference_state["path"]
        if reference_path is None:
            return {"status": "error", "error": "No reference audio is configured. Ask to record a live reference first."}
        return analyze_reference(reference_path)
    if name == "match_sound":
        reference_path = reference_state["path"]
        if reference_path is None:
            return {"status": "error", "error": "No reference audio is configured. Record or select a reference first."}
        try:
            result = run_configured_match(
                synth=config.synth,
                reference_path=reference_path,
                note=config.note,
                channel=config.midi_channel,
                midi_output=config.midi_output,
                audio_device=config.audio_device,
                audio_channel=config.audio_channel,
                sample_rate=config.sample_rate,
                output_factory=open_midi_output,
                authorize=lambda: confirm_hardware_change(
                    synth=config.synth,
                    midi_output=config.midi_output,
                    channel=config.midi_channel,
                    audio_device=config.audio_device,
                    audio_channel=config.audio_channel,
                    measurements=MAX_MEASUREMENTS,
                ),
            )
        except ConfirmationDeclined as error:
            return {"status": "cancelled", "error": str(error), "hardware_touched": False}
        result["result_file"] = save_match_result(result)
        return result
    raise ValueError(f"Unsupported local tool requested by Foundry: {name}.")


def _chat(args: argparse.Namespace) -> None:
    _load_dotenv()
    endpoint = _required_env("FOUNDRY_PROJECT_ENDPOINT")
    agent_name = os.environ.get("FOUNDRY_AGENT_NAME", "PatchGatorSoundMatcher")
    reference_path = Path(args.reference).expanduser().resolve(strict=True) if args.reference else None
    if reference_path is not None:
        load_audio(reference_path)
    if args.midi_output not in midi_ports()["outputs"]:
        raise ValueError("The selected MIDI output is not available; use `devices midi` to discover exact port names.")
    verify_capture_configuration(args.audio_device, args.audio_channel, args.sample_rate)

    from azure.ai.projects import AIProjectClient
    from azure.identity import DefaultAzureCredential

    with (
        DefaultAzureCredential() as credential,
        AIProjectClient(endpoint=endpoint, credential=credential) as project_client,
        project_client.get_openai_client(agent_name=agent_name) as openai_client,
    ):
        print(
            f"Foundry agent {agent_name!r} is ready. Local tools: "
            f"{', '.join(definition['name'] for definition in TOOL_DEFINITIONS)}."
        )
        print("Reference audio stays on this computer. Type /exit to quit.")
        reference_state: dict[str, Path | None] = {"path": reference_path}
        previous_response_id: str | None = None
        while True:
            try:
                prompt = input("You: ").strip()
            except EOFError:
                print()
                return
            if prompt.lower() in {"/exit", "exit", "quit"}:
                return
            if not prompt:
                continue
            response, previous_response_id = run_agent_turn(
                openai_client,
                prompt,
                lambda name, values: _dispatch_tool(
                    name,
                    values,
                    config=args,
                    reference_state=reference_state,
                ),
                previous_response_id=previous_response_id,
            )
            print(f"Agent: {response}")


def _devices(args: argparse.Namespace) -> None:
    if args.kind == "midi":
        print(json.dumps(midi_ports(), indent=2))
        return
    print(json.dumps(audio_devices(), indent=2))


def _analyze(args: argparse.Namespace) -> None:
    print(json.dumps(analyze_reference(args.reference), indent=2))


def _record_reference(args: argparse.Namespace) -> None:
    verify_capture_configuration(args.audio_device, args.audio_channel, args.sample_rate)
    try:
        confirm_audio_recording(
            audio_device=args.audio_device,
            audio_channel=args.audio_channel,
            sample_rate=args.sample_rate,
            duration_seconds=args.duration_seconds,
        )
    except ConfirmationDeclined as error:
        print(json.dumps({"status": "cancelled", "error": str(error), "hardware_touched": False}, indent=2))
        return
    audio = record_audio_input(
        audio_device=args.audio_device,
        audio_channel=args.audio_channel,
        sample_rate=args.sample_rate,
        duration_seconds=args.duration_seconds,
    )
    path = save_reference_recording(audio, args.sample_rate)
    print(json.dumps({
        "file": str(path),
        "duration_seconds": round(len(audio) / args.sample_rate, 3),
        "sample_rate": args.sample_rate,
    }, indent=2))


def _add_chat_configuration(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--synth", choices=("summit", "ultranova"), required=True)
    parser.add_argument("--reference", type=Path, help="Optional local WAV; the agent can request a confirmed live recording if omitted.")
    parser.add_argument("--midi-output", required=True, help="Exact output port name from `devices midi`.")
    parser.add_argument("--midi-channel", type=int, choices=range(1, 17), required=True)
    parser.add_argument("--audio-device", type=int, required=True, help="Input device index from `devices audio`.")
    parser.add_argument("--audio-channel", type=int, required=True, help="1-based interface input channel.")
    parser.add_argument("--sample-rate", type=int, required=True, help="Capture sample rate supported by the chosen interface.")
    parser.add_argument("--record-duration", type=float, default=2.0, help="Live reference duration (0.2 to 15 seconds).")
    parser.add_argument("--note", type=int, choices=range(128), default=60, help="MIDI note used for each comparison.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="patchgator-studio")
    subparsers = parser.add_subparsers(dest="command", required=True)

    devices = subparsers.add_parser("devices", help="Discover available local MIDI and audio devices.")
    device_commands = devices.add_subparsers(dest="kind", required=True)
    device_commands.add_parser("midi", help="List MIDI ports.")
    device_commands.add_parser("audio", help="List audio input devices.")

    analyze = subparsers.add_parser("analyze", help="Analyze a local WAV reference without hardware access.")
    analyze.add_argument("--reference", type=Path, required=True)

    setup = subparsers.add_parser("setup-agent", help="Register the prompt agent in an existing Foundry project.")
    setup.set_defaults(handler=_create_agent)

    chat = subparsers.add_parser("chat", help="Chat with the Foundry agent and execute tools locally.")
    _add_chat_configuration(chat)
    chat.set_defaults(handler=_chat)
    record = subparsers.add_parser("record-reference", help="Record a local reference clip from the selected interface input.")
    record.add_argument("--audio-device", type=int, required=True, help="Input device index from `devices audio`.")
    record.add_argument("--audio-channel", type=int, required=True, help="1-based interface input channel.")
    record.add_argument("--sample-rate", type=int, required=True, help="Capture sample rate supported by the chosen interface.")
    record.add_argument("--duration-seconds", type=float, required=True, help="Recording length from 0.2 through 15 seconds.")
    record.set_defaults(handler=_record_reference)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    handler = getattr(args, "handler", None)
    if handler:
        handler(args)
    elif args.command == "devices":
        _devices(args)
    elif args.command == "analyze":
        _analyze(args)


if __name__ == "__main__":
    main()
