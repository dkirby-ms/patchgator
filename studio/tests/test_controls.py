import unittest
from pathlib import Path
import re

from patchgator_studio.controls import CONTROLS, MAX_MEASUREMENTS, clamp_value, controls_for


class ControlRegistryTests(unittest.TestCase):
    def test_registered_cc_addresses_match_patchgator_subset(self) -> None:
        self.assertEqual(
            [(control.id, control.address[0]) for control in controls_for("summit")],
            [
                ("osc1Mix", 23),
                ("filterCutoff", 29),
                ("filterResonance", 79),
                ("ampAttack", 86),
                ("ampRelease", 89),
            ],
        )
        self.assertEqual(
            [(control.id, control.address[0]) for control in controls_for("ultranova")],
            [
                ("osc1Mix", 51),
                ("filter1Cutoff", 74),
                ("filter1Resonance", 71),
                ("ampAttack", 73),
                ("ampRelease", 72),
            ],
        )

    def test_values_are_bounded_and_search_has_a_fixed_limit(self) -> None:
        self.assertEqual(clamp_value(controls_for("summit")[0], -3), 0)
        self.assertEqual(clamp_value(controls_for("summit")[0], 140), 127)
        self.assertEqual(MAX_MEASUREMENTS, 26)
        self.assertEqual(len(CONTROLS["summit"]), len(CONTROLS["ultranova"]))
        with self.assertRaises(ValueError):
            controls_for("web-synth")

    def test_registered_addresses_stay_aligned_with_existing_patchgator_profiles(self) -> None:
        repository = Path(__file__).resolve().parents[2]
        summit_source = (repository / "src" / "model" / "parameters.ts").read_text(encoding="utf-8")
        for control in controls_for("summit"):
            match = re.search(
                rf"id: '{re.escape(control.id)}'.*?address: \{{ type: 'cc', controller: (\d+) \}}",
                summit_source,
            )
            self.assertIsNotNone(match, control.id)
            self.assertEqual(int(match.group(1)), control.address[0], control.id)

        ultranova_source = (repository / "src" / "model" / "ultranovaProfile.ts").read_text(encoding="utf-8")
        self.assertIn("cc('osc1Mix', 'Mixer', 'Oscillator 1 level', 'Osc 1', 51, 127)", ultranova_source)
        self.assertIn("filter === 1 ? 74 : 83", ultranova_source)
        self.assertIn("filter === 1 ? 71 : 85", ultranova_source)
        self.assertIn("[73, 75, 70, 72]", ultranova_source)
        self.assertEqual([control.address[0] for control in controls_for("ultranova")], [51, 74, 71, 73, 72])


if __name__ == "__main__":
    unittest.main()
