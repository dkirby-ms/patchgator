import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

import numpy as np
import soundfile as sf

from patchgator_studio.optimizer import run_configured_match, run_coordinate_search, save_match_result


class CoordinateSearchTests(unittest.TestCase):
    def test_uses_bounded_local_measurements_and_returns_recipe(self) -> None:
        time = np.arange(4096) / 48000
        target = np.sin(2 * np.pi * 220 * time).astype(np.float32)
        applied: list[dict[str, int]] = []
        captures = 0

        def apply(_output: object, _synth: str, values: dict[str, int], _channel: int) -> None:
            applied.append(dict(values))

        def capture(_output: object, **_options: object) -> np.ndarray:
            nonlocal captures
            captures += 1
            return target

        result = run_coordinate_search(
            synth="summit",
            target_audio=target,
            target_sample_rate=48000,
            sample_rate=48000,
            note=60,
            channel=1,
            output=object(),
            audio_device=0,
            audio_channel=1,
            capture=capture,
            apply=apply,
        )

        self.assertEqual(result["status"], "completed")
        self.assertLessEqual(result["measurements"], 26)
        self.assertEqual(result["measurements"], captures)
        self.assertEqual(result["best_score"], 0)
        self.assertEqual(result["artifact_kind"], "Parameter recipe only; no native synth preset was exported or saved.")
        self.assertTrue(applied)

    def test_denied_confirmation_does_not_open_midi_output(self) -> None:
        target = np.sin(2 * np.pi * 220 * np.arange(4096) / 48000).astype(np.float32)
        output_factory = Mock()

        def deny() -> None:
            raise PermissionError("Hardware operation was not confirmed.")

        with tempfile.TemporaryDirectory() as temporary_directory:
            reference_path = Path(temporary_directory) / "reference.wav"
            sf.write(reference_path, target, 48000)

            with self.assertRaisesRegex(PermissionError, "not confirmed"):
                run_configured_match(
                    synth="summit",
                    reference_path=reference_path,
                    note=60,
                    channel=1,
                    midi_output="not-opened",
                    audio_device=0,
                    audio_channel=1,
                    sample_rate=48000,
                    output_factory=output_factory,
                    authorize=deny,
                )

        output_factory.assert_not_called()

    def test_persists_unique_recipe_and_history_json(self) -> None:
        result = {"best_controls": {"osc1Mix": 127}, "history": [{"score": 0.1}]}
        with tempfile.TemporaryDirectory() as temporary_directory:
            filename = save_match_result(result, temporary_directory)
            saved = json.loads((Path(temporary_directory) / filename).read_text(encoding="utf-8"))

        self.assertTrue(filename.startswith("match-"))
        self.assertEqual(saved, result)


if __name__ == "__main__":
    unittest.main()
