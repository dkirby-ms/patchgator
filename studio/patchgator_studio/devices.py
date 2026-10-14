from __future__ import annotations

from typing import Any


def midi_ports() -> dict[str, list[str]]:
    import mido

    return {
        "inputs": mido.get_input_names(),
        "outputs": mido.get_output_names(),
    }


def audio_devices() -> list[dict[str, Any]]:
    import sounddevice as sd

    return [
        {
            "index": index,
            "name": device["name"],
            "max_input_channels": device["max_input_channels"],
            "default_samplerate": device["default_samplerate"],
        }
        for index, device in enumerate(sd.query_devices())
        if device["max_input_channels"] > 0
    ]
