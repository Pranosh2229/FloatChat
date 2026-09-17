"""
Query Orchestrator (Part 9, spec §20/§43) — the single place a natural-language question turns
into a backend call. The LLM only extracts structure (`app/llm/gemini_client.py`); every
business rule enforced here is deterministic Python, re-checked independently of whatever the
LLM's own `clarification_needed` flag said. The model's self-assessment is not trusted as the
last line of defense against silently guessing a region, float, or event that was never actually
specified — that would violate the architecture boundary in PLAN.md/spec §4 ("LLM never
calculates, never silently guesses").
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.anomaly.baseline import BaselineUnavailableError
from app.llm.gemini_client import GeminiExtractionError, explain, extract
from app.ocean.regions import REGIONS, region_centroid
from app.query import tools
from app.query.context import QueryContext, QueryOutcome, ResolvedQuery
from app.query.schema import LLMExtraction, OceanQuery, SpatialQuery, TemporalQuery, VisualizationIntent

logger = logging.getLogger(__name__)

# Intents that operate over a whole region and have no other way to get one (no UI selection
# concept for "the region" the way a float or event can be individually selected) — these always
# require an explicit or context-supplied region before anything runs.
NEEDS_REGION = {"explore_region", "find_events", "find_anomalies"}


def _visualization_for(intent: str) -> VisualizationIntent:
    if intent == "compare_regions":
        return VisualizationIntent(fly_to_region=True, highlight_floats=True)
    if intent in ("find_events", "find_anomalies"):
        return VisualizationIntent(fly_to_region=True, show_anomalies=True, highlight_floats=True)
    if intent == "explore_region":
        return VisualizationIntent(fly_to_region=True, highlight_floats=True)
    if intent == "inspect_float":
        return VisualizationIntent(highlight_floats=True)
    if intent == "surface_subsurface":
        return VisualizationIntent(fly_to_region=True, show_anomalies=True)
    return VisualizationIntent()


def _resolve(extraction: LLMExtraction, context: QueryContext) -> ResolvedQuery | str:
    """Returns a `ResolvedQuery` ready for dispatch, or a clarification message (str) if the
    question plus whatever's already selected in the UI still isn't enough to act on safely."""
    region = extraction.region or context.selected_region
    region_b = extraction.region_b

    if extraction.intent in NEEDS_REGION and region is None:
        return extraction.clarification_message or (
            "I need to know which region you mean — Bay of Bengal or Arabian Sea. "
            "Select one, or name it in your question."
        )
    if region is not None and region not in REGIONS:
        return f"'{region}' isn't a region I have data for. Try Bay of Bengal or Arabian Sea."
    if region_b is not None and region_b not in REGIONS:
        return f"'{region_b}' isn't a region I have data for. Try Bay of Bengal or Arabian Sea."

    ocean_query = OceanQuery(
        intent=extraction.intent,
        spatial=SpatialQuery(region=region, region_b=region_b),
        temporal=TemporalQuery(start=extraction.start_date, end=extraction.end_date),
        variables=extraction.variables or ["temperature"],
        visualization=_visualization_for(extraction.intent),
    )

    if extraction.intent == "compare_regions":
        if region is None or region_b is None:
            return (
                "To compare regions I need two different named regions — "
                "Bay of Bengal and Arabian Sea."
            )
        if region == region_b:
            return "Pick two different regions to compare."
        return ResolvedQuery(ocean_query=ocean_query)

    if extraction.intent == "inspect_float":
        if context.selected_float_id is None:
            return "Select a float first, then ask about it."
        return ResolvedQuery(ocean_query=ocean_query, float_id=context.selected_float_id)

    if extraction.intent == "get_thermocline":
        if context.selected_float_id is None:
            return "Select a float first — thermocline is computed from one float's latest profile."
        return ResolvedQuery(ocean_query=ocean_query, float_id=context.selected_float_id)

    if extraction.intent == "get_evidence":
        if context.selected_event_id is None:
            return "Select a detected event first, then ask how it was concluded."
        return ResolvedQuery(ocean_query=ocean_query, event_id=context.selected_event_id)

    if extraction.intent == "surface_subsurface":
        lat, lon = context.lat, context.lon
        if lat is None and context.selected_float_id is None and region is not None:
            lat, lon = region_centroid(region)
        if lat is None and context.selected_float_id is None:
            return "I need a location — click a point on the globe, select a float, or name a region."
        return ResolvedQuery(
            ocean_query=ocean_query, float_id=context.selected_float_id, lat=lat, lon=lon
        )

    # explore_region, find_events, find_anomalies — region already validated above.
    return ResolvedQuery(ocean_query=ocean_query)


async def run_query(
    db: AsyncSession, question: str, context: QueryContext | None = None
) -> QueryOutcome:
    context = context or QueryContext()

    try:
        extraction = await extract(question)
    except GeminiExtractionError as exc:
        return QueryOutcome(
            intent="unknown",
            clarification_needed=True,
            clarification_message=f"Couldn't understand that question ({exc}). Try rephrasing.",
            ocean_query=None,
            result=None,
        )

    # General knowledge questions ("what is an ARGO float?") get a prose explanation — the one
    # intent where the LLM writes text, fenced to explanation only (see gemini_client.explain).
    if extraction.intent == "explain":
        try:
            answer = await explain(question)
        except GeminiExtractionError as exc:
            return QueryOutcome(
                intent="explain",
                clarification_needed=True,
                clarification_message=f"Couldn't answer that right now ({exc}). Try again.",
                ocean_query=None,
                result=None,
            )
        return QueryOutcome(
            intent="explain",
            clarification_needed=False,
            clarification_message=None,
            ocean_query=OceanQuery(
                intent="explain",
                spatial=SpatialQuery(),
                temporal=TemporalQuery(),
                variables=["temperature"],
                visualization=VisualizationIntent(),
            ),
            result={"answer": answer},
        )

    resolved = _resolve(extraction, context)
    if isinstance(resolved, str):
        return QueryOutcome(
            intent=extraction.intent,
            clarification_needed=True,
            clarification_message=resolved,
            ocean_query=None,
            result=None,
        )

    # Part 12 hardening (spec §44): a resolved, valid query can still fail for real domain
    # reasons (no WOA23 baseline at this exact location) or truly unexpected ones. Neither
    # should surface as a raw 500 in a live demo — both come back clarification-shaped, with
    # the unexpected case also logged server-side (with the real intent/traceback) so it stays
    # debuggable without leaking internals to the client. Never fabricate a result in either case.
    try:
        result = await tools.dispatch(db, resolved)
    except BaselineUnavailableError as exc:
        return QueryOutcome(
            intent=extraction.intent,
            clarification_needed=True,
            clarification_message=f"The scientific baseline isn't available here: {exc}",
            ocean_query=None,
            result=None,
        )
    except Exception:
        logger.exception("Unexpected error dispatching intent=%s", extraction.intent)
        return QueryOutcome(
            intent=extraction.intent,
            clarification_needed=True,
            clarification_message=(
                "Something went wrong answering that question. Try rephrasing, or ask about a "
                "different region/float."
            ),
            ocean_query=None,
            result=None,
        )

    return QueryOutcome(
        intent=extraction.intent,
        clarification_needed=False,
        clarification_message=None,
        ocean_query=resolved.ocean_query,
        result=result,
    )
