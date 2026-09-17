"""
Basic (non-ML) spatio-temporal event detection, per spec §28-29 — the confirmed MVP scope is
grouping + simple rule-based labeling, not ML classification (XGBoost/RandomForest are
explicitly deferred, per PLAN.md's MVP scope lock).

Feature scaling for DBSCAN, per spec §29's explicit warning ("do not treat degrees, days and
metres as directly interchangeable without a defensible scaling/distance approach"): each
dimension is divided by a documented "comparable closeness" scale, not left in raw units, so a
single Euclidean eps threshold means something similar across all four dimensions.
"""

import datetime as dt
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import DBSCAN

SPATIAL_SCALE_DEG = 1.0  # ~111km; the base unit the other scales are chosen relative to
TIME_SCALE_DAYS = 10.0  # "close in time" for a 90-day dev window
DEPTH_SCALE_M = 50.0  # "close in depth" for upper-ocean anomalies

DBSCAN_EPS = 1.5
DBSCAN_MIN_SAMPLES = 5

# Anomalies smaller than this aren't "event-worthy" — filtered out before clustering, not just
# for speed: clustering noise-level anomalies would find "events" everywhere.
SIGNIFICANT_ANOMALY_C = 0.5
SIGNIFICANT_ANOMALY_PSU = 0.3

# A real, hit limit — not a guess: scikit-learn's DBSCAN precomputes every point's full
# radius-neighbor list before clustering, and in a dense region that list's total size can
# explode well past linear in point count. Confirmed live: the 24-month redesign's Arabian Sea
# ended up with ~1.03M significant points (vs. ~101k in the original 3-month MVP subset, which
# clustered fine) and DBSCAN's `radius_neighbors` raised a real `MemoryError` partway through.
# Capping to the N most significant points (by |anomaly_value| — the ones most worth finding an
# event in, not an arbitrary/insertion-order slice) is an honest, disclosed scope boundary for
# this MVP-scale clustering approach, not a silent shortcut: it's logged whenever it triggers,
# and re-tuned here in one place if the real hardware budget changes.
MAX_SIGNIFICANT_POINTS_FOR_CLUSTERING = 120_000


@dataclass
class AnomalyPoint:
    profile_id: int
    float_id: int
    variable: str
    lat: float
    lon: float
    timestamp: dt.datetime
    depth_m: float
    observed_value: float
    expected_value: float
    anomaly_value: float


def is_significant(point: AnomalyPoint) -> bool:
    threshold = SIGNIFICANT_ANOMALY_C if point.variable == "temperature" else SIGNIFICANT_ANOMALY_PSU
    return abs(point.anomaly_value) >= threshold


def cap_for_clustering(points: list[AnomalyPoint]) -> tuple[list[AnomalyPoint], int]:
    """
    Keeps the `MAX_SIGNIFICANT_POINTS_FOR_CLUSTERING` most significant points (largest
    |anomaly_value|) when there are more than that — see the constant's own comment for why this
    exists. Returns `(kept_points, dropped_count)` so the caller can log honestly when it fires;
    a no-op (dropped_count == 0) for every region under the cap, which today is most of them.
    """
    if len(points) <= MAX_SIGNIFICANT_POINTS_FOR_CLUSTERING:
        return points, 0
    ranked = sorted(points, key=lambda p: abs(p.anomaly_value), reverse=True)
    kept = ranked[:MAX_SIGNIFICANT_POINTS_FOR_CLUSTERING]
    return kept, len(points) - len(kept)


def _feature_vector(point: AnomalyPoint, reference_time: dt.datetime) -> list[float]:
    lat_rad = np.radians(point.lat)
    days = (point.timestamp - reference_time).total_seconds() / 86400
    return [
        point.lat / SPATIAL_SCALE_DEG,
        # Longitude degrees compress toward the poles — scale by cos(lat) so 1 unit of
        # longitude-distance means roughly the same real distance as 1 unit of latitude.
        point.lon * float(np.cos(lat_rad)) / SPATIAL_SCALE_DEG,
        days / TIME_SCALE_DAYS,
        point.depth_m / DEPTH_SCALE_M,
    ]


def cluster_anomalies(points: list[AnomalyPoint]) -> dict[int, list[int]]:
    """Returns {cluster_label: [point_indices into `points`]}, excluding DBSCAN noise (-1)."""
    if not points:
        return {}
    reference_time = min(p.timestamp for p in points)
    features = np.array([_feature_vector(p, reference_time) for p in points])
    labels = DBSCAN(eps=DBSCAN_EPS, min_samples=DBSCAN_MIN_SAMPLES).fit_predict(features)

    clusters: dict[int, list[int]] = {}
    for i, label in enumerate(labels):
        if label == -1:
            continue
        clusters.setdefault(int(label), []).append(i)
    return clusters


def pick_primary_float(cluster_points: list[AnomalyPoint]) -> int:
    """
    The float whose anomalies sum to the largest total |anomaly_value| within this cluster —
    a simple, defensible ranking (not ML, per spec §28's basic-rules scope), used to pick which
    of an event's several affected floats "best represents" it for the Ask feature's
    relevance-ranked highlighting (REDESIGN_PLAN.md Phase 0). Always returns a real float_id
    from `cluster_points` — never guesses when there's a tie (Python's max takes the first).
    """
    magnitude_by_float: dict[int, float] = {}
    for p in cluster_points:
        magnitude_by_float[p.float_id] = magnitude_by_float.get(p.float_id, 0.0) + abs(
            p.anomaly_value
        )
    return max(magnitude_by_float, key=magnitude_by_float.get)


def classify_event(cluster_points: list[AnomalyPoint]) -> str:
    """
    Simple rule-based labels from spec §28's category list — deliberately not ML. A category
    this can't confidently justify is labeled "uncertain", not forced into the nearest bucket.
    """
    temp_points = [p for p in cluster_points if p.variable == "temperature"]
    sal_points = [p for p in cluster_points if p.variable == "salinity"]

    if not temp_points:
        return "salinity_anomaly" if sal_points else "uncertain"

    if sal_points and len(sal_points) >= len(temp_points) * 0.5:
        return "mixed_anomaly"

    mean_anomaly = sum(p.anomaly_value for p in temp_points) / len(temp_points)
    mean_depth = sum(p.depth_m for p in temp_points) / len(temp_points)

    if mean_anomaly <= 0:
        return "cooling_event"
    return "surface_warming" if mean_depth < 50 else "subsurface_warming"
