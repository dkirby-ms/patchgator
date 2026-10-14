from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager

import numpy as np

from .controls import Control, clamp_value, controls_for


class ConfirmationDeclined(PermissionError):
    pass


@contextmanager
def open_midi_output(name: str) -> Iterator[object]:
    import mido

    available = mido.get_output_names()
    if name not in available:
        raise ValueError(f"MIDI output {name!r} is not available. Run `patchgator-studio devices midi` to list ports.")
    with mido.open_output(name) as output:
        yield output


def send_control(output: object, control: Control, value: int, channel: int) -> None:
    import mido

    if not 1 <= channel <= 16:
        raise ValueError("MIDI channel must be from 1 through 16.")
    bounded = clamp_value(control, value)
    if control.address_type == "cc":
        output.send(mido.Message("control_change", channel=channel - 1, control=control.address[0], value=bounded))
        return
    parameter_msb, parameter_lsb = control.address
    for controller, data in ((99, parameter_msb), (98, parameter_lsb), (6, bounded)):
        output.send(mido.Message("control_change", channel=channel - 1, control=controller, value=data))


def apply_controls(output: object, synth: str, values: dict[str, int], channel: int) -> None:
    controls = controls_for(synth)
    for control in controls:
        if control.id not in values:
            raise ValueError(f"Missing search value for {control.id}.")
        send_control(output, control, values[control.id], channel)


def silence_output(output: object, channel: int) -> None:
    import mido

    output.send(mido.Message("control_change", channel=channel - 1, control=64, value=0))
    for note in range(128):
        output.send(mido.Message("note_off", channel=channel - 1, note=note, velocity=0))
    output.send(mido.Message("control_change", channel=channel - 1, control=120, value=0))
    output.send(mido.Message("control_change", channel=channel - 1, control=123, value=0))


def capture_note(
    output: object,
    *,
    note: int,
    velocity: int,
    channel: int,
    audio_device: int,
    audio_channel: int,
    sample_rate: int,
    duration_seconds: float,
) -> np.ndarray:
    import mido
    import sounddevice as sd

    if not 0 <= note <= 127:
        raise ValueError("MIDI note must be from 0 through 127.")
    if not 1 <= channel <= 16:
        raise ValueError("MIDI channel must be from 1 through 16.")
    if audio_channel < 1:
        raise ValueError("Audio channel must be a 1-based channel number.")
    if sample_rate < 8000 or sample_rate > 192000:
        raise ValueError("Sample rate must be from 8000 through 192000 Hz.")
    device = sd.query_devices(audio_device)
    if audio_channel > device["max_input_channels"]:
        raise ValueError(
            f"Audio device {audio_device} has {device['max_input_channels']} input channels, "
            f"not channel {audio_channel}."
        )

    frames = max(32, round(sample_rate * duration_seconds))
    recorded: np.ndarray | None = None
    with sd.InputStream(
        device=audio_device,
        samplerate=sample_rate,
        channels=1,
        mapping=[audio_channel],
        dtype="float32",
    ) as stream:
        time.sleep(0.05)
        output.send(mido.Message("note_on", channel=channel - 1, note=note, velocity=velocity))
        try:
            recorded, overflowed = stream.read(frames)
        finally:
            output.send(mido.Message("note_off", channel=channel - 1, note=note, velocity=0))
        if overflowed:
            raise RuntimeError("Audio input overflowed while recording the synth; reduce the sample rate or buffer load.")

    return np.asarray(recorded, dtype=np.float32).reshape(-1)


def record_audio_input(
    *,
    audio_device: int,
    audio_channel: int,
    sample_rate: int,
    duration_seconds: float,
) -> np.ndarray:
    import sounddevice as sd

    if not 0.2 <= duration_seconds <= 15:
        raise ValueError("Recording duration must be from 0.2 through 15 seconds.")
    verify_capture_configuration(audio_device, audio_channel, sample_rate)
    frames = round(sample_rate * duration_seconds)
    with sd.InputStream(
        device=audio_device,
        samplerate=sample_rate,
        channels=1,
        mapping=[audio_channel],
        dtype="float32",
    ) as stream:
        recorded, overflowed = stream.read(frames)
    if overflowed:
        raise RuntimeError("Audio input overflowed while recording the reference.")
    return np.asarray(recorded, dtype=np.float32).reshape(-1)


def verify_capture_configuration(audio_device: int, audio_channel: int, sample_rate: int) -> None:
    import sounddevice as sd

    if audio_channel < 1:
        raise ValueError("Audio channel must be a 1-based channel number.")
    if sample_rate < 8000 or sample_rate > 192000:
        raise ValueError("Sample rate must be from 8000 through 192000 Hz.")
    devices = sd.query_devices()
    if not 0 <= audio_device < len(devices):
        raise ValueError(f"Audio device index {audio_device} is not available.")
    device = devices[audio_device]
    if device["max_input_channels"] < audio_channel:
        raise ValueError(
            f"Audio device {audio_device} has only {device['max_input_channels']} input channel(s)."
        )
    sd.check_input_settings(
        device=audio_device,
        samplerate=sample_rate,
        channels=1,
        dtype="float32",
        extra_settings=None,
    )


def confirm_hardware_change(
    *,
    synth: str,
    midi_output: str,
    channel: int,
    audio_device: int,
    audio_channel: int,
    measurements: int,
    input_fn: Callable[[str], str] = input,
) -> None:
    print(
        f"This will send up to {measurements} MIDI measurements to {synth} on {midi_output!r}, "
        f"channel {channel}, and record input {audio_device}:{audio_channel}."
    )
    print("It will change the current edit buffer controls listed by this tool; it will not save a preset.")
    if input_fn("Type MATCH to continue: ").strip() != "MATCH":
        raise ConfirmationDeclined("Hardware operation was not confirmed.")


def confirm_audio_recording(
    *,
    audio_device: int,
    audio_channel: int,
    sample_rate: int,
    duration_seconds: float,
    input_fn: Callable[[str], str] = input,
) -> None:
    if not 0.2 <= duration_seconds <= 15:
        raise ValueError("Recording duration must be from 0.2 through 15 seconds.")
    print(
        f"This will record {duration_seconds:g} seconds from audio input "
        f"{audio_device}:{audio_channel} at {sample_rate} Hz."
    )
    if input_fn("Type RECORD to begin, then immediately play the isolated sound: ").strip() != "RECORD":
        raise ConfirmationDeclined("Audio recording was not confirmed.")
