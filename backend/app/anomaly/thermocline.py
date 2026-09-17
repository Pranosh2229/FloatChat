"""
Thermocline detection: deterministic dT/dz analysis on a real temperature-depth profile, per
spec §26. The LLM never invents a thermocline depth — this is the only source of truth for it.
"""

from dataclasses import dataclass

import numpy as np


@dataclass
class ThermoclineResult:
    depth_m: float  # representative depth (center of the strongest-gradient layer)
    min_depth_m: float
    max_depth_m: float
    max_gradient_c_per_m: float  # signed: negative = cooling with depth (the normal case)
    method: str
    quality: str  # "clear" | "weak" | "insufficient_data"


# Below this |dT/dz|, a profile reads as isothermal/well-mixed rather than genuinely having a
# thermocline — a small, real threshold from typical upper-ocean gradient magnitudes, not an
# arbitrary round number.
WEAK_GRADIENT_THRESHOLD_C_PER_M = 0.01
# The thermocline "range" extends outward from the peak-gradient interval while the gradient
# stays at least this fraction of the peak — adapts to each profile's own strength rather than
# a fixed absolute cutoff.
RANGE_FRACTION_OF_PEAK = 0.3


def detect_thermocline(
    pressure_dbar: list[float],
    temperature_c: list[float | None],
    qc_temperature: list[str],
) -> ThermoclineResult | None:
    """
    Sort -> clean (QC-good, non-null only) -> smooth -> dT/dz -> strongest-gradient layer ->
    depth/range/quality. Returns None when there isn't enough usable data to say anything,
    rather than forcing a result.
    """
    good_qc = {"1", "2"}
    pairs = [
        (depth, temp)
        for depth, temp, qc in zip(pressure_dbar, temperature_c, qc_temperature, strict=True)
        if temp is not None and qc in good_qc
    ]
    pairs.sort(key=lambda pair: pair[0])
    # Drop duplicate-depth entries (can happen with real ARGO sampling) to keep gradients finite.
    seen_depths: set[float] = set()
    deduped = []
    for depth, temp in pairs:
        if depth not in seen_depths:
            seen_depths.add(depth)
            deduped.append((depth, temp))

    if len(deduped) < 4:
        return None

    depths = np.array([d for d, _ in deduped])
    temps = np.array([t for _, t in deduped])

    # Light smoothing (3-point moving average) before differentiating, so single noisy levels
    # don't masquerade as the thermocline. Edges keep their original value (no data to average).
    smoothed = temps.copy()
    smoothed[1:-1] = (temps[:-2] + temps[1:-1] + temps[2:]) / 3.0

    depth_diffs = np.diff(depths)
    temp_diffs = np.diff(smoothed)
    # depth_diffs is always > 0 here (duplicates removed, sorted ascending).
    gradients = temp_diffs / depth_diffs

    peak_idx = int(np.argmin(gradients))  # most negative = steepest cooling with depth
    peak_gradient = float(gradients[peak_idx])

    if abs(peak_gradient) < WEAK_GRADIENT_THRESHOLD_C_PER_M:
        return ThermoclineResult(
            depth_m=float((depths[peak_idx] + depths[peak_idx + 1]) / 2),
            min_depth_m=float(depths[peak_idx]),
            max_depth_m=float(depths[peak_idx + 1]),
            max_gradient_c_per_m=peak_gradient,
            method="dT/dz_smoothed_3pt",
            quality="weak",
        )

    threshold = abs(peak_gradient) * RANGE_FRACTION_OF_PEAK
    lo = peak_idx
    while lo > 0 and abs(gradients[lo - 1]) >= threshold:
        lo -= 1
    hi = peak_idx
    while hi < len(gradients) - 1 and abs(gradients[hi + 1]) >= threshold:
        hi += 1

    return ThermoclineResult(
        depth_m=float((depths[peak_idx] + depths[peak_idx + 1]) / 2),
        min_depth_m=float(depths[lo]),
        max_depth_m=float(depths[hi + 1]),
        max_gradient_c_per_m=peak_gradient,
        method="dT/dz_smoothed_3pt",
        quality="clear",
    )
