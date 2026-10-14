from __future__ import annotations

from collections.abc import Callable
import json
from pathlib import Path
from typing import Any

import numpy as np

from .audio import compare_features, extract_features, load_audio, resample_audio
from .controls import SEARCH_VALUES, controls_for
from .hardware import apply_controls, capture_note


def analyze_reference(path: str | Path) -> dict[str, Any]:
    audio, sample_rate = load_audio(path)
    features = extract_features(audio, sample_rate)
    return {
        "duration_seconds": round(features.duration_seconds, 3),
        "sample_rate": features.sample_rate,
        "rms": round(features.rms, 6),
        "spectral_bands": [round(value, 6) for value in features.spectral_bands],
        "note": "Only numerical audio features are returned to the Foundry agent; audio samples stay local.",
    }


def run_coordinate_search(
    *,
    synth: str,
    target_audio: np.ndarray,
    target_sample_rate: int,
    sample_rate: int,
    note: int,
    channel: int,
    output: object,
    audio_device: int,
    audio_channel: int,
    capture: Callable[..., np.ndarray] = capture_note,
    apply: Callable[[object, str, dict[str, int], int], None] = apply_controls,
) -> dict[str, Any]:
    controls = controls_for(synth)
    target = resample_audio(target_audio, target_sample_rate, sample_rate)
    target_features = extract_features(target, sample_rate)
    values = {control.id: control.default for control in controls}
    measurements: list[dict[str, Any]] = []

    def measure() -> float:
        audio = capture(
            output,
            note=note,
            velocity=64,
            channel=channel,
            audio_device=audio_device,
            audio_channel=audio_channel,
            sample_rate=sample_rate,
            duration_seconds=0.8,
        )
        score = compare_features(target_features, extract_features(audio, sample_rate))
        measurements.append({"score": round(score, 6), "values": dict(values)})
        return score

    apply(output, synth, values, channel)
    best_score = measure()
    for control in controls:
        selected_value = values[control.id]
        for candidate in SEARCH_VALUES:
            if candidate == selected_value:
                continue
            trial_values = {**values, control.id: candidate}
            apply(output, synth, trial_values, channel)
            score = measure()
            if score < best_score:
                values = trial_values
                selected_value = candidate
                best_score = score
            else:
                apply(output, synth, values, channel)

    apply(output, synth, values, channel)
    return {
        "status": "completed",
        "synth": synth,
        "note": note,
        "sample_rate": sample_rate,
        "reference_sample_rate": target_sample_rate,
        "reference_duration_seconds": round(len(target_audio) / target_sample_rate, 3),
        "midi_channel": channel,
        "audio_device": audio_device,
        "audio_channel": audio_channel,
        "measurements": len(measurements),
        "best_score": round(best_score, 6),
        "best_controls": values,
        "control_labels": {control.id: control.label for control in controls},
        "history": measurements,
        "artifact_kind": "Parameter recipe only; no native synth preset was exported or saved.",
    }


def run_configured_match(
    *,
    synth: str,
    reference_path: str | Path,
    note: int,
    channel: int,
    midi_output: str,
    audio_device: int,
    audio_channel: int,
    sample_rate: int,
    output_factory: Callable[[str], Any],
    authorize: Callable[[], None],
) -> dict[str, Any]:
    audio, reference_rate = load_audio(reference_path)
    authorize()
    with output_factory(midi_output) as output:
        try:
            result = run_coordinate_search(
                synth=synth,
                target_audio=audio,
                target_sample_rate=reference_rate,
                sample_rate=sample_rate,
                note=note,
                channel=channel,
                output=output,
                audio_device=audio_device,
                audio_channel=audio_channel,
            )
            result["midi_output"] = midi_output
            return result
        finally:
            from .hardware import silence_output

            silence_output(output, channel)


def save_match_result(result: dict[str, Any], results_dir: str | Path = "results") -> str:
    from datetime import datetime, timezone
    from uuid import uuid4

    directory = Path(results_dir)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"match-{datetime.now(timezone.utc):%Y%m%dT%H%M%S-%fZ}-{uuid4().hex[:8]}.json"
    path = directory / filename
    with path.open("x", encoding="utf-8") as result_file:
        json.dump(result, result_file, indent=2)
        result_file.write("\n")
    return filename


def save_reference_recording(
    audio: np.ndarray,
    sample_rate: int,
    references_dir: str | Path = "references",
) -> Path:
    from datetime import datetime, timezone
    from uuid import uuid4

    import soundfile as sf

    directory = Path(references_dir)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"reference-{datetime.now(timezone.utc):%Y%m%dT%H%M%S-%fZ}-{uuid4().hex[:8]}.wav"
    path = directory / filename
    sf.write(path, audio, sample_rate, subtype="PCM_24")
    return path
