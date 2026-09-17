"""
API tests against the real ingested dev subset (43 floats, 600 profiles across Bay of Bengal +
Arabian Sea) — not mocked/fixture data, since the DoD is "real endpoints return real data."
Requires the dev database to already have Part 5's ingestion run.
"""

from fastapi.testclient import TestClient

from app.main import app


def test_list_regions() -> None:
    with TestClient(app) as client:
        response = client.get("/regions")
        assert response.status_code == 200
        keys = {r["key"] for r in response.json()}
        # Redesign Phase 0 expanded from 2 regions to 11 (REDESIGN_PLAN.md decision #5) — assert
        # the original two are still present rather than an exact set, so this test doesn't need
        # editing again every time a region is added/renamed.
        assert {"bay_of_bengal", "arabian_sea"} <= keys
        assert len(keys) == 11


def test_list_floats_filtered_by_region() -> None:
    with TestClient(app) as client:
        response = client.get("/floats", params={
            "min_lat": 5, "max_lat": 22, "min_lon": 78, "max_lon": 95,
        })
        assert response.status_code == 200
        floats = response.json()
        assert len(floats) > 0
        assert all(5 <= f["latest_lat"] <= 22 for f in floats)


def test_float_detail_and_trajectory() -> None:
    with TestClient(app) as client:
        floats = client.get("/floats").json()
        assert len(floats) > 0
        float_id = floats[0]["id"]

        detail = client.get(f"/floats/{float_id}")
        assert detail.status_code == 200
        assert detail.json()["id"] == float_id

        trajectory = client.get(f"/floats/{float_id}/trajectory")
        assert trajectory.status_code == 200
        body = trajectory.json()
        assert body["float_id"] == float_id
        assert len(body["points"]) > 0
        # Trajectory must be time-ordered.
        timestamps = [p["timestamp"] for p in body["points"]]
        assert timestamps == sorted(timestamps)


def test_float_not_found() -> None:
    with TestClient(app) as client:
        response = client.get("/floats/999999")
        assert response.status_code == 404


def test_profile_detail_has_aligned_arrays() -> None:
    with TestClient(app) as client:
        floats = client.get("/floats").json()
        trajectory = client.get(f"/floats/{floats[0]['id']}/trajectory").json()
        profile_id = trajectory["points"][0]["profile_id"]

        response = client.get(f"/profiles/{profile_id}")
        assert response.status_code == 200
        body = response.json()
        n = len(body["pressure_dbar"])
        assert len(body["temperature_c"]) == n
        assert len(body["qc_temperature"]) == n


def test_region_observations() -> None:
    with TestClient(app) as client:
        response = client.get("/regions/bay_of_bengal/observations")
        assert response.status_code == 200
        assert len(response.json()) > 0

        response = client.get("/regions/not_a_real_region/observations")
        assert response.status_code == 404


def test_dashboard_stats_returns_real_totals_across_all_regions() -> None:
    with TestClient(app) as client:
        response = client.get("/dashboard/stats")
        assert response.status_code == 200
        body = response.json()
        assert body["total_regions"] == 11
        assert len(body["regions"]) == 11
        assert body["total_floats"] > 0
        assert body["total_floats"] == sum(r["float_count"] for r in body["regions"])
        assert body["total_events"] == sum(r["event_count"] for r in body["regions"])
        if body["most_active_region_key"] is not None:
            keys = {r["key"] for r in body["regions"]}
            assert body["most_active_region_key"] in keys


def test_compare_regions_returns_real_comparable_stats() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/compare", params={"region_a": "bay_of_bengal", "region_b": "arabian_sea"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["region_a"]["float_count"] > 0
        assert body["region_b"]["float_count"] > 0
        assert body["region_a"]["mean_surface_temperature_c"] is not None
