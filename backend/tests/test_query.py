"""
Part 9 — LLM query layer. Two kinds of tests, matching the pattern used throughout the project:

1. Pure logic tests for the orchestrator's validation rules (`_resolve`), constructed directly
   from `LLMExtraction` objects — no real Gemini call, so these run fast and deterministically
   even if the model's own judgment on a given question drifts.
2. Real end-to-end tests against the real Gemini API and the real ingested dev database via
   `TestClient` — not mocked. Requires `GEMINI_API_KEY` set in `backend/.env` and Part 5's
   ingestion to have been run (same precondition as every other real API test in this suite).
"""

from fastapi.testclient import TestClient

from app.anomaly.baseline import BaselineUnavailableError
from app.database import async_session_factory
from app.main import app
from app.query import orchestrator, tools
from app.query.context import QueryContext
from app.query.orchestrator import _resolve, run_query
from app.query.schema import LLMExtraction


def _extraction(**overrides) -> LLMExtraction:
    defaults = dict(
        intent="explore_region",
        region=None,
        region_b=None,
        start_date=None,
        end_date=None,
        variables=["temperature"],
        clarification_needed=False,
        clarification_message=None,
    )
    defaults.update(overrides)
    return LLMExtraction(**defaults)


def test_explore_region_without_region_or_context_is_clarified() -> None:
    """The core 'never silently guess' rule — even if the LLM itself says
    clarification_needed=False, no region anywhere means we still don't act."""
    resolved = _resolve(_extraction(intent="explore_region", clarification_needed=False), QueryContext())
    assert isinstance(resolved, str)


def test_explore_region_resolved_from_extraction_region() -> None:
    resolved = _resolve(_extraction(intent="explore_region", region="arabian_sea"), QueryContext())
    assert resolved.ocean_query.spatial.region == "arabian_sea"


def test_explore_region_resolved_from_context_when_extraction_has_none() -> None:
    """A UI selection can supply the region even when the question text doesn't name one."""
    resolved = _resolve(
        _extraction(intent="explore_region", region=None),
        QueryContext(selected_region="bay_of_bengal"),
    )
    assert resolved.ocean_query.spatial.region == "bay_of_bengal"


def test_unknown_region_key_is_rejected() -> None:
    # `LLMExtraction.region` is a `Literal["bay_of_bengal", "arabian_sea"]`, so Pydantic itself
    # already refuses to construct one with any other region — real Gemini output can never
    # reach the orchestrator with an invalid key. `model_construct` bypasses that validation to
    # exercise the orchestrator's own defense-in-depth check directly, in case that type-safety
    # guarantee is ever weakened (e.g. more regions added without updating validation elsewhere).
    bad_extraction = LLMExtraction.model_construct(
        intent="explore_region",
        region="pacific_ocean",
        region_b=None,
        start_date=None,
        end_date=None,
        variables=["temperature"],
        clarification_needed=False,
        clarification_message=None,
    )
    resolved = _resolve(bad_extraction, QueryContext())
    assert isinstance(resolved, str)


def test_compare_regions_requires_two_distinct_regions() -> None:
    assert isinstance(
        _resolve(_extraction(intent="compare_regions", region="arabian_sea", region_b=None), QueryContext()),
        str,
    )
    assert isinstance(
        _resolve(
            _extraction(intent="compare_regions", region="arabian_sea", region_b="arabian_sea"),
            QueryContext(),
        ),
        str,
    )
    resolved = _resolve(
        _extraction(intent="compare_regions", region="arabian_sea", region_b="bay_of_bengal"),
        QueryContext(),
    )
    assert resolved.ocean_query.spatial.region_b == "bay_of_bengal"


def test_inspect_float_requires_selected_float_context() -> None:
    assert isinstance(_resolve(_extraction(intent="inspect_float"), QueryContext()), str)
    resolved = _resolve(_extraction(intent="inspect_float"), QueryContext(selected_float_id=42))
    assert resolved.float_id == 42


def test_get_thermocline_requires_selected_float_context() -> None:
    assert isinstance(_resolve(_extraction(intent="get_thermocline"), QueryContext()), str)
    resolved = _resolve(_extraction(intent="get_thermocline"), QueryContext(selected_float_id=7))
    assert resolved.float_id == 7


def test_get_evidence_requires_selected_event_context() -> None:
    assert isinstance(_resolve(_extraction(intent="get_evidence"), QueryContext()), str)
    resolved = _resolve(_extraction(intent="get_evidence"), QueryContext(selected_event_id=3))
    assert resolved.event_id == 3


def test_surface_subsurface_falls_back_to_region_centroid() -> None:
    """No clicked point, no selected float, but a named region -> resolves to that region's
    bounding-box midpoint rather than asking for clarification unnecessarily."""
    resolved = _resolve(
        _extraction(intent="surface_subsurface", region="arabian_sea"), QueryContext()
    )
    assert resolved.lat is not None and resolved.lon is not None


def test_surface_subsurface_without_any_location_is_clarified() -> None:
    resolved = _resolve(_extraction(intent="surface_subsurface", region=None), QueryContext())
    assert isinstance(resolved, str)


# --- Real end-to-end tests: real Gemini API, real ingested DB, real /query endpoint ---


def test_query_explore_region_real_end_to_end() -> None:
    with TestClient(app) as client:
        response = client.post("/query", json={"question": "What floats are in the Arabian Sea?"})
        assert response.status_code == 200
        body = response.json()
        assert body["intent"] == "explore_region"
        assert body["clarification_needed"] is False
        assert body["query"]["spatial"]["region"] == "arabian_sea"
        assert len(body["result"]["floats"]) > 0


def test_query_compare_regions_real_end_to_end() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/query", json={"question": "Compare the Arabian Sea and Bay of Bengal"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["intent"] == "compare_regions"
        assert body["result"]["region_a"]["float_count"] > 0
        assert body["result"]["region_b"]["float_count"] > 0


def test_query_off_topic_question_is_declined_by_the_guide_not_guessed() -> None:
    """Redesign: general questions go to the `explain` intent. An off-topic one still never
    turns into a fabricated data query — the guide answers in prose that it only covers the
    ocean (and no region/float/event is ever invented)."""
    with TestClient(app) as client:
        response = client.post("/query", json={"question": "What is the weather like on Mars?"})
        assert response.status_code == 200
        body = response.json()
        assert body["intent"] == "explain"
        assert body["clarification_needed"] is False
        assert "ocean" in body["result"]["answer"].lower()
        assert body["query"]["spatial"]["region"] is None


def test_query_general_knowledge_question_gets_a_prose_answer() -> None:
    with TestClient(app) as client:
        response = client.post("/query", json={"question": "What is an ARGO float?"})
        assert response.status_code == 200
        body = response.json()
        assert body["intent"] == "explain"
        assert body["clarification_needed"] is False
        answer = body["result"]["answer"]
        assert len(answer) > 80
        assert "float" in answer.lower()


def test_query_inspect_float_requires_context_end_to_end() -> None:
    with TestClient(app) as client:
        no_context = client.post("/query", json={"question": "Tell me about this float"})
        assert no_context.json()["clarification_needed"] is True

        float_id = client.get("/floats").json()[0]["id"]
        with_context = client.post(
            "/query",
            json={
                "question": "Tell me about this float",
                "context": {"selected_float_id": float_id},
            },
        )
        body = with_context.json()
        assert body["clarification_needed"] is False
        assert body["result"]["float"]["id"] == float_id


# --- Part 12 hardening: a resolved, valid query whose dispatch fails must not surface a raw
# 500/traceback in a live demo (spec §44). Monkeypatched at the dispatch layer, not by breaking
# real WOA23 data on disk, so these stay fast/deterministic and don't disturb other tests. ---


def _fixed_extraction(**overrides) -> LLMExtraction:
    defaults = dict(
        intent="explore_region",
        region="arabian_sea",
        region_b=None,
        start_date=None,
        end_date=None,
        variables=["temperature"],
        clarification_needed=False,
        clarification_message=None,
    )
    defaults.update(overrides)
    return LLMExtraction(**defaults)


async def test_run_query_baseline_unavailable_returns_clarification_not_a_crash(monkeypatch) -> None:
    async def fake_extract(question, *, reference_date=None):
        return _fixed_extraction()

    async def fake_dispatch(db, resolved):
        raise BaselineUnavailableError("WOA23 climatology files not found in data/raw/woa23")

    monkeypatch.setattr(orchestrator, "extract", fake_extract)
    monkeypatch.setattr(tools, "dispatch", fake_dispatch)

    async with async_session_factory() as session:
        outcome = await run_query(session, "What floats are in the Arabian Sea?")

    assert outcome.clarification_needed is True
    assert outcome.result is None
    assert "baseline" in outcome.clarification_message.lower()


async def test_run_query_unexpected_dispatch_error_returns_clarification_not_a_crash(
    monkeypatch,
) -> None:
    async def fake_extract(question, *, reference_date=None):
        return _fixed_extraction()

    async def fake_dispatch(db, resolved):
        raise RuntimeError("simulated unexpected failure")

    monkeypatch.setattr(orchestrator, "extract", fake_extract)
    monkeypatch.setattr(tools, "dispatch", fake_dispatch)

    async with async_session_factory() as session:
        outcome = await run_query(session, "What floats are in the Arabian Sea?")

    assert outcome.clarification_needed is True
    assert outcome.result is None
    assert "went wrong" in outcome.clarification_message.lower()


def test_unhandled_error_on_a_plain_endpoint_returns_clean_500_not_a_traceback(monkeypatch) -> None:
    """The generic safety net in `main.py` isn't /query-specific — any endpoint's unexpected
    failure comes back as a clean, generic JSON error, never a raw Python traceback."""
    from app.api import regions as regions_api

    async def boom(db, region_key):
        raise RuntimeError("simulated unexpected failure")

    monkeypatch.setattr(regions_api, "_region_stats", boom)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            "/compare", params={"region_a": "arabian_sea", "region_b": "bay_of_bengal"}
        )
        assert response.status_code == 500
        assert response.json() == {
            "detail": "Something went wrong on the server. This has been logged."
        }


def test_query_get_evidence_requires_context_end_to_end() -> None:
    with TestClient(app) as client:
        events = client.get("/events").json()
        if not events:
            import pytest

            pytest.skip("No events in DB — run `python scripts/detect_events.py` first")
        event_id = events[0]["id"]

        response = client.post(
            "/query",
            json={
                "question": "How do you know this is unusual?",
                "context": {"selected_event_id": event_id},
            },
        )
        body = response.json()
        assert body["clarification_needed"] is False
        assert body["result"]["evidence"]["baseline_id"] == "WOA23"
