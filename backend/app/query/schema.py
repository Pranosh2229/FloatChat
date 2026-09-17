"""
Ocean Query Language (spec §19) — the internal contract between the LLM and the backend.
Scoped honestly to intents this backend can actually fulfill (Parts 4-8), not the full spec
list — `compare_time_periods`, `get_timeseries`, `get_salinity_gradient`, `find_similar_events`
aren't built, so they aren't offered as choices the LLM could pick and then have nothing behind
them. `surface_subsurface` is a real addition beyond spec's literal list, exposing the confirmed
Part 7 feature — spec's intent list is presented as "possible intents," not a closed set.

Two schemas, deliberately: `LLMExtraction` (flat, no nested objects) is what the LLM actually
targets via JSON-schema-constrained output. This shape was settled while the local
`qwen2.5:3b-instruct` model backed the LLM layer — a real test against that 3b model showed the
fully nested `OceanQuery.model_json_schema()` (with `$defs`/`$ref` indirection) degrades badly
(missing fields, garbage repeated array values), while a flat schema with the exact same
information extracts reliably. Kept flat after the move to the Gemini API (see
`REDESIGN_PLAN.md`) since it still extracts reliably there and there's no reason to reintroduce
nesting a smaller model once needed to avoid. `OceanQuery` is the clean internal representation
the rest of the backend consumes, built by mapping a validated `LLMExtraction`.
"""

from typing import Literal

from pydantic import BaseModel, Field

Intent = Literal[
    "explore_region",
    "find_events",
    "find_anomalies",
    "inspect_float",
    "get_thermocline",
    "compare_regions",
    "get_evidence",
    "surface_subsurface",
    "explain",
]

RegionKey = Literal[
    "bay_of_bengal",
    "arabian_sea",
    "gulf_stream",
    "mediterranean_sea",
    "california_current",
    "kuroshio_current",
    "norwegian_sea",
    "tasman_sea",
    "benguela_current",
    "humboldt_current",
    "southern_ocean",
]
Variable = Literal["temperature", "salinity"]


class LLMExtraction(BaseModel):
    """What the LLM actually produces — flat, so Ollama's JSON-schema-constrained generation
    stays reliable with a 3b model. See module docstring."""

    intent: Intent
    # Explicit `= None` on every nullable field, not just the `| None` type: Gemini's structured
    # output only guarantees the fields listed in the schema's own "required" array (intent,
    # variables, clarification_needed — see gemini_client._RESPONSE_SCHEMA) will be present. A
    # nullable field it decides not to set is legally just *omitted* from the JSON, not emitted
    # as a literal `null` — and without a default, Pydantic treats an omitted `X | None` field as
    # still required, so `model_validate` raised on any real answer that left one out (caught a
    # live failure on "What is ARGO?": the response omitted `end_date` entirely).
    region: RegionKey | None = None
    region_b: RegionKey | None = None
    start_date: str | None = None
    end_date: str | None = None
    variables: list[Variable]
    clarification_needed: bool
    clarification_message: str | None = None


class SpatialQuery(BaseModel):
    region: RegionKey | None = None
    region_b: RegionKey | None = None
    lat: float | None = None
    lon: float | None = None


class TemporalQuery(BaseModel):
    start: str | None = None
    end: str | None = None


class DepthQuery(BaseModel):
    min_m: float | None = None
    max_m: float | None = None


class VisualizationIntent(BaseModel):
    fly_to_region: bool = False
    update_timeline: bool = False
    highlight_floats: bool = False
    show_anomalies: bool = False


class OceanQuery(BaseModel):
    """The clean internal representation — never constructed directly from raw LLM output,
    only via `orchestrator.build_ocean_query`, which is where context (selected float/region/
    event) gets merged in and validation happens."""

    intent: Intent
    spatial: SpatialQuery = Field(default_factory=SpatialQuery)
    temporal: TemporalQuery = Field(default_factory=TemporalQuery)
    depth: DepthQuery = Field(default_factory=DepthQuery)
    variables: list[Variable] = Field(default_factory=list)
    visualization: VisualizationIntent = Field(default_factory=VisualizationIntent)


class ClarificationNeeded(BaseModel):
    """Returned instead of an OceanQuery when the question is ambiguous — the orchestrator's
    "never silently guess a region/time/depth" rule (spec §43), enforced as real business logic
    (checked regardless of what the LLM's own clarification_needed flag says), not just a
    prompt instruction the model might ignore."""

    message: str
