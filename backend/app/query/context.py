"""
Shared dataclasses between `orchestrator.py` and `tools.py`, split into their own module purely
to avoid a circular import (orchestrator dispatches to tools; tools needs to know the shape of
what orchestrator resolved).
"""

from dataclasses import dataclass

from app.query.schema import OceanQuery


@dataclass
class QueryContext:
    """What the frontend already knows from UI state — a selection made before the question was
    typed. Several intents (`inspect_float`, `get_thermocline`, `get_evidence`) only make sense
    relative to something already selected; they are never guessed from the question text alone.
    """

    selected_region: str | None = None
    selected_float_id: int | None = None
    selected_event_id: int | None = None
    lat: float | None = None
    lon: float | None = None


@dataclass
class ResolvedQuery:
    """An `OceanQuery` plus whatever concrete ids/coordinates the orchestrator resolved it to —
    the only thing `tools.dispatch` is allowed to act on."""

    ocean_query: OceanQuery
    float_id: int | None = None
    event_id: int | None = None
    lat: float | None = None
    lon: float | None = None


@dataclass
class QueryOutcome:
    """The orchestrator's final answer to a question: either a clarification request, or a
    resolved query plus its real result."""

    intent: str
    clarification_needed: bool
    clarification_message: str | None
    ocean_query: OceanQuery | None
    result: dict | None
