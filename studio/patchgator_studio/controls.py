from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


AddressType = Literal["cc", "nrpn"]


@dataclass(frozen=True)
class Control:
    id: str
    label: str
    minimum: int
    maximum: int
    default: int
    address_type: AddressType
    address: tuple[int, ...]


# This deliberately limited search set mirrors PatchGator's registered
# Summit and UltraNova control definitions in src/model/parameters.ts and
# src/model/ultranovaProfile.ts. It does not represent a full patch dump.
CONTROLS: dict[str, tuple[Control, ...]] = {
    "summit": (
        Control("osc1Mix", "Oscillator 1 level", 0, 127, 127, "cc", (23,)),
        Control("filterCutoff", "Filter cutoff", 0, 127, 127, "cc", (29,)),
        Control("filterResonance", "Filter resonance", 0, 127, 0, "cc", (79,)),
        Control("ampAttack", "Amplifier attack", 0, 127, 0, "cc", (86,)),
        Control("ampRelease", "Amplifier release", 0, 127, 40, "cc", (89,)),
    ),
    "ultranova": (
        Control("osc1Mix", "Oscillator 1 level", 0, 127, 127, "cc", (51,)),
        Control("filter1Cutoff", "Filter 1 cutoff", 0, 127, 127, "cc", (74,)),
        Control("filter1Resonance", "Filter 1 resonance", 0, 127, 0, "cc", (71,)),
        Control("ampAttack", "Amplifier attack", 0, 127, 2, "cc", (73,)),
        Control("ampRelease", "Amplifier release", 0, 127, 40, "cc", (72,)),
    ),
}

SEARCH_VALUES = (0, 32, 64, 96, 127)
MAX_MEASUREMENTS = 1 + len(SEARCH_VALUES) * len(CONTROLS["summit"])


def controls_for(synth: str) -> tuple[Control, ...]:
    try:
        return CONTROLS[synth]
    except KeyError as error:
        raise ValueError(f"Unsupported synth: {synth}") from error


def clamp_value(control: Control, value: int) -> int:
    if not isinstance(value, int):
        raise ValueError(f"{control.id} must be an integer.")
    return min(control.maximum, max(control.minimum, value))
