"""
Shapes an event's contributing anomaly points into the JSON structures stored on the
`evidence` row — the Region->Event->Floats->Profiles->Observations->Baseline->Anomaly->
Conclusion chain from spec §35, made concrete.
"""

from app.events.detection import AnomalyPoint


def _summarize(points: list[AnomalyPoint]) -> dict | None:
    if not points:
        return None
    values = [p.anomaly_value for p in points]
    return {
        "count": len(points),
        "mean_observed": sum(p.observed_value for p in points) / len(points),
        "mean_expected": sum(p.expected_value for p in points) / len(points),
        "mean_anomaly": sum(values) / len(values),
        "min_anomaly": min(values),
        "max_anomaly": max(values),
    }


def build_calculation(cluster_points: list[AnomalyPoint]) -> dict:
    """The 'why' — observed/expected/anomaly breakdown, per variable, for Evidence.calculation."""
    return {
        "temperature": _summarize([p for p in cluster_points if p.variable == "temperature"]),
        "salinity": _summarize([p for p in cluster_points if p.variable == "salinity"]),
    }


def build_coverage(cluster_points: list[AnomalyPoint]) -> dict:
    return {
        "profile_count": len({p.profile_id for p in cluster_points}),
        "float_count": len({p.float_id for p in cluster_points}),
        "observation_count": len(cluster_points),
    }
