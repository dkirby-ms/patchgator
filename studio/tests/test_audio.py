import unittest

import numpy as np

from patchgator_studio.audio import compare_features, extract_features, resample_audio


class AudioAnalysisTests(unittest.TestCase):
    def test_resamples_to_requested_rate(self) -> None:
        source = np.linspace(-1, 1, 4800, dtype=np.float32)

        result = resample_audio(source, 48000, 24000)

        self.assertEqual(len(result), 2400)
        self.assertEqual(result.dtype, np.float32)

    def test_features_and_comparison_are_finite_and_repeatable(self) -> None:
        time = np.arange(4800) / 48000
        target = np.sin(2 * np.pi * 440 * time).astype(np.float32)
        altered = np.sin(2 * np.pi * 880 * time).astype(np.float32)

        target_features = extract_features(target, 48000)
        same_score = compare_features(target_features, extract_features(target, 48000))
        altered_score = compare_features(target_features, extract_features(altered, 48000))

        self.assertEqual(len(target_features.spectral_bands), 24)
        self.assertEqual(same_score, 0)
        self.assertGreater(altered_score, same_score)
        self.assertAlmostEqual(sum(target_features.spectral_bands), 1)

    def test_rejects_non_finite_audio(self) -> None:
        with self.assertRaisesRegex(ValueError, "non-finite"):
            extract_features(np.array([0.0] * 31 + [np.nan]), 48000)

    def test_silent_candidate_gets_a_finite_penalty(self) -> None:
        time = np.arange(4800) / 48000
        target = extract_features(np.sin(2 * np.pi * 440 * time), 48000)
        silent = extract_features(np.zeros(4800), 48000)

        score = compare_features(target, silent)

        self.assertTrue(np.isfinite(score))
        self.assertGreater(score, 0)


if __name__ == "__main__":
    unittest.main()
