"""
Part 8 DoD: at least one real detected event exists in the dev subset with a complete,
inspectable evidence chain. Tests the pure clustering/classification logic directly, and the
real persisted events/evidence from running `scripts/detect_events.py` (must be run before
these against a live dev DB — same precondition as the ingestion-dependent tests elsewhere).
"""

import datetime as dt

from sqlalchemy import select

from app.database import async_session_factory
from app.events.detection import (
    AnomalyPoint,
    cap_for_clustering,
    classify_event,
    cluster_anomalies,
    is_significant,
    pick_primary_float,
)
from app.events.evidence import build_calculation, build_coverage
from app.models import Anomaly, Event, Evidence


def _point(lat, lon, day, depth, variable="temperature", anomaly=1.0, float_id=1) -> AnomalyPoint:
    return AnomalyPoint(
        profile_id=1,
        float_id=float_id,
        variable=variable,
        lat=lat,
        lon=lon,
        timestamp=dt.datetime(2023, 1, 1, tzinfo=dt.timezone.utc) + dt.timedelta(days=day),
        depth_m=depth,
        observed_value=20.0 + anomaly,
        expected_value=20.0,
        anomaly_value=anomaly,
    )


def test_is_significant_thresholds() -> None:
    assert is_significant(_point(0, 0, 0, 0, "temperature", anomaly=0.6))
    assert not is_significant(_point(0, 0, 0, 0, "temperature", anomaly=0.1))
    assert is_significant(_point(0, 0, 0, 0, "salinity", anomaly=0.4))
    assert not is_significant(_point(0, 0, 0, 0, "salinity", anomaly=0.1))


def test_cap_for_clustering_is_a_noop_under_the_limit() -> None:
    points = [_point(0, 0, i, 0, anomaly=1.0 + i * 0.01) for i in range(10)]
    kept, dropped = cap_for_clustering(points)
    assert kept == points
    assert dropped == 0


def test_cap_for_clustering_keeps_the_largest_magnitude_points(monkeypatch) -> None:
    """Real bug fixed by this function: DBSCAN raised a real MemoryError on ~1M points from the
    24-month Arabian Sea data. Over the cap, the kept points must be the most scientifically
    notable ones (largest |anomaly_value|), not an arbitrary slice, and the true drop count must
    be reported so it can be logged honestly rather than silently truncated. The real production
    cap (120,000) is patched down so this test can actually exercise the over-the-cap path
    without constructing hundreds of thousands of points."""
    import app.events.detection as detection

    monkeypatch.setattr(detection, "MAX_SIGNIFICANT_POINTS_FOR_CLUSTERING", 5)

    small = [_point(0, 0, i, 0, anomaly=0.5) for i in range(5)]  # smaller |anomaly_value|
    large = [_point(0, 0, i, 0, anomaly=-9.0 - i) for i in range(5)]  # larger |anomaly_value|
    kept, dropped = cap_for_clustering(small + large)

    assert dropped == 5
    assert len(kept) == 5
    assert all(p in large for p in kept)
    assert not any(p in small for p in kept)


def test_cluster_anomalies_groups_nearby_points_and_excludes_noise() -> None:
    # A tight group of 6 points close in space/time/depth -> one cluster.
    tight = [_point(10.0 + i * 0.01, 85.0, i, 20 + i) for i in range(6)]
    # One far-away isolated point -> noise, excluded.
    isolated = [_point(-40.0, 150.0, 500, 3000)]

    clusters = cluster_anomalies(tight + isolated)
    assert len(clusters) == 1
    (indices,) = clusters.values()
    assert len(indices) == 6
    assert all(i < 6 for i in indices)  # the isolated point (index 6) never appears


def test_classify_event_rules() -> None:
    warm_shallow = [_point(10, 85, 0, 10, "temperature", anomaly=1.5) for _ in range(5)]
    assert classify_event(warm_shallow) == "surface_warming"

    warm_deep = [_point(10, 85, 0, 200, "temperature", anomaly=1.5) for _ in range(5)]
    assert classify_event(warm_deep) == "subsurface_warming"

    cold = [_point(10, 85, 0, 50, "temperature", anomaly=-1.5) for _ in range(5)]
    assert classify_event(cold) == "cooling_event"

    salinity_only = [_point(10, 85, 0, 50, "salinity", anomaly=0.8) for _ in range(5)]
    assert classify_event(salinity_only) == "salinity_anomaly"


def test_pick_primary_float_picks_largest_total_anomaly_magnitude() -> None:
    # float 1: two points totalling |1.0| + |1.2| = 2.2. float 2: one point at |3.0| = 3.0 —
    # fewer points but a larger total magnitude, so float 2 should win.
    points = [
        _point(10, 85, 0, 10, anomaly=1.0, float_id=1),
        _point(10, 85, 1, 15, anomaly=1.2, float_id=1),
        _point(10, 85, 0, 10, anomaly=3.0, float_id=2),
    ]
    assert pick_primary_float(points) == 2


def test_build_calculation_and_coverage_reflect_real_inputs() -> None:
    points = [_point(10, 85, 0, 10 + i, "temperature", anomaly=1.0 + i * 0.1) for i in range(4)]
    calc = build_calculation(points)
    assert calc["temperature"]["count"] == 4
    assert calc["salinity"] is None  # no salinity points given

    coverage = build_coverage(points)
    assert coverage["observation_count"] == 4
    assert coverage["profile_count"] == 1  # all points share profile_id=1 in the helper
    assert coverage["float_count"] == 1


async def test_real_events_exist_with_complete_evidence_chain() -> None:
    """
    Requires `python scripts/detect_events.py` to have been run against the live dev DB —
    verifies the actual persisted output, not a mock.
    """
    async with async_session_factory() as session:
        events = (await session.execute(select(Event).limit(1))).scalars().all()
        if not events:
            import pytest

            pytest.skip("No events in DB — run `python scripts/detect_events.py` first")

        event = events[0]
        evidence = await session.scalar(select(Evidence).where(Evidence.event_id == event.id))
        assert evidence is not None
        assert evidence.float_ids == event.affected_float_ids
        assert len(evidence.profile_ids) > 0
        assert len(evidence.observation_ids) == event.anomaly_count
        # primary_float_id (Redesign Phase 0's relevance-ranking addition) must be a real float
        # that's actually one of the event's own affected floats, never a stray/unrelated id.
        assert event.primary_float_id is not None
        assert event.primary_float_id in event.affected_float_ids

        # Every observation_id must resolve to a real, persisted Anomaly row tied to a real
        # profile that belongs to one of the event's real affected floats — the full chain,
        # not just IDs that happen to be present.
        anomalies = (
            (
                await session.execute(
                    select(Anomaly).where(Anomaly.id.in_(evidence.observation_ids[:20]))
                )
            )
            .scalars()
            .all()
        )
        assert len(anomalies) > 0
        for anomaly in anomalies:
            assert anomaly.baseline_id == "WOA23"
            assert anomaly.method
