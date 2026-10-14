from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf


@dataclass(frozen=True)
class AudioFeatures:
    sample_rate: int
    duration_seconds: float
    rms: float
    spectral_bands: tuple[float, ...]


def load_audio(path: str | Path) -> tuple[np.ndarray, int]:
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    if audio.size == 0 or sample_rate <= 0:
        raise ValueError("The reference audio file is empty or has an invalid sample rate.")
    if not np.isfinite(audio).all():
        raise ValueError("The reference audio contains non-finite samples.")
    mono = audio.mean(axis=1, dtype=np.float64).astype(np.float32)
    if not np.any(mono):
        raise ValueError("The reference audio is silent.")
    return mono, int(sample_rate)


def resample_audio(audio: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate <= 0 or target_rate <= 0:
        raise ValueError("Sample rates must be positive.")
    if source_rate == target_rate:
        return np.asarray(audio, dtype=np.float32)
    output_length = max(1, round(len(audio) * target_rate / source_rate))
    source_positions = np.arange(len(audio), dtype=np.float64)
    target_positions = np.arange(output_length, dtype=np.float64) * source_rate / target_rate
    return np.interp(target_positions, source_positions, audio).astype(np.float32)


def extract_features(audio: np.ndarray, sample_rate: int, band_count: int = 24) -> AudioFeatures:
    samples = np.asarray(audio, dtype=np.float64).reshape(-1)
    if sample_rate <= 0 or band_count < 1:
        raise ValueError("Sample rate and spectral band count must be positive.")
    if len(samples) < 32:
        raise ValueError("At least 32 audio samples are required for analysis.")
    if not np.isfinite(samples).all():
        raise ValueError("Audio contains non-finite samples.")

    rms = float(np.sqrt(np.mean(np.square(samples))))
    windowed = samples * np.hanning(len(samples))
    magnitude = np.abs(np.fft.rfft(windowed))
    frequencies = np.fft.rfftfreq(len(samples), 1 / sample_rate)
    low_frequency = max(20.0, sample_rate / len(samples))
    high_frequency = sample_rate / 2
    edges = np.geomspace(low_frequency, high_frequency, band_count + 1)
    bands = []
    for lower, upper in zip(edges[:-1], edges[1:]):
        selected = magnitude[(frequencies >= lower) & (frequencies < upper)]
        bands.append(float(np.mean(selected)) if selected.size else 0.0)

    scale = sum(bands)
    normalized_bands = tuple(value / scale for value in bands) if scale > 0 else tuple(0.0 for _ in bands)
    return AudioFeatures(
        sample_rate=sample_rate,
        duration_seconds=len(samples) / sample_rate,
        rms=rms,
        spectral_bands=normalized_bands,
    )


def compare_features(target: AudioFeatures, candidate: AudioFeatures) -> float:
    if target.sample_rate != candidate.sample_rate:
        raise ValueError("Target and candidate audio must use the same sample rate.")
    if len(target.spectral_bands) != len(candidate.spectral_bands):
        raise ValueError("Target and candidate feature vectors must have the same size.")

    spectral_error = float(np.mean(np.abs(
        np.asarray(target.spectral_bands) - np.asarray(candidate.spectral_bands)
    )))
    target_rms = max(target.rms, 1e-8)
    candidate_rms = max(candidate.rms, 1e-8)
    loudness_error = abs(20 * np.log10(candidate_rms / target_rms)) / 60
    return spectral_error + 0.15 * float(loudness_error)
