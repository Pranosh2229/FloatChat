"""
Controlled tool dispatch (Part 9) — the only bridge between a resolved query and the real
backend logic built in Parts 4-8. Each intent maps to one specific, already-tested function
(region stats, float lookups, anomaly/thermocline calculations, event queries, the
surface->subsurface investigation); nothing here lets the LLM invoke arbitrary code — the
orchestrator decides *which* function runs and with *which* arguments, never the model itself.
"""

import dataclasses
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.anomaly import get_profile_thermocline, get_surface_subsurface
from app.api.events import get_event, get_event_evidence, list_events
from app.api.floats import get_float, get_float_trajectory
from app.api.regions import _region_stats, region_observations
from app.models import ArgoFloat, Profile
from app.query.context import ResolvedQuery


async def _latest_profile_id(db: AsyncSession, float_id: int) -> int | None:
    return await db.scalar(
        select(Profile.id)
        .where(Profile.float_id == float_id)
        .order_by(Profile.timestamp.desc())
        .limit(1)
    )


async def dispatch(db: AsyncSession, resolved: ResolvedQuery) -> dict[str, Any]:
    intent = resolved.ocean_query.intent
    region = resolved.ocean_query.spatial.region

    if intent == "explore_region":
        floats = await region_observations(region, db)
        return {"region": region, "floats": [f.model_dump(mode="json") for f in floats]}

    if intent in ("find_events", "find_anomalies"):
        events = await list_events(region=region, db=db)
        return {"region": region, "events": [e.model_dump(mode="json") for e in events]}

    if intent == "compare_regions":
        region_b = resolved.ocean_query.spatial.region_b
        stats_a = await _region_stats(db, region)
        stats_b = await _region_stats(db, region_b)
        return {
            "region_a": stats_a.model_dump(mode="json"),
            "region_b": stats_b.model_dump(mode="json"),
        }

    if intent == "inspect_float":
        detail = await get_float(resolved.float_id, db)
        trajectory = await get_float_trajectory(resolved.float_id, db)
        return {
            "float": detail.model_dump(mode="json"),
            "trajectory": trajectory.model_dump(mode="json"),
        }

    if intent == "get_thermocline":
        profile_id = await _latest_profile_id(db, resolved.float_id)
        if profile_id is None:
            return {"profile_id": None, "thermocline": None, "note": "no profiles for this float"}
        # `get_profile_thermocline` returns `ThermoclineResult`, a plain dataclass (not a
        # Pydantic model) — FastAPI serializes it via `response_model` when called as an HTTP
        # endpoint, but called directly here it needs `dataclasses.asdict`, not `.model_dump()`.
        thermocline = await get_profile_thermocline(profile_id, db)
        return {
            "profile_id": profile_id,
            "thermocline": dataclasses.asdict(thermocline) if thermocline else None,
        }

    if intent == "get_evidence":
        event = await get_event(resolved.event_id, db)
        evidence = await get_event_evidence(resolved.event_id, db)
        return {"event": event.model_dump(mode="json"), "evidence": evidence.model_dump(mode="json")}

    if intent == "surface_subsurface":
        lat, lon = resolved.lat, resolved.lon
        if lat is None and resolved.float_id is not None:
            argo_float = await db.get(ArgoFloat, resolved.float_id)
            lat, lon = argo_float.latest_lat, argo_float.latest_lon
        # `get_surface_subsurface` returns `SurfaceSubsurfaceResult`, a plain dataclass (with
        # nested dataclasses for thermocline/anomalies) — same `asdict`, not `.model_dump()`,
        # reasoning as the get_thermocline branch above.
        result = await get_surface_subsurface(lat, lon, db)
        return {"lat": lat, "lon": lon, "result": dataclasses.asdict(result) if result else None}

    raise ValueError(f"No tool wired for intent: {intent}")
