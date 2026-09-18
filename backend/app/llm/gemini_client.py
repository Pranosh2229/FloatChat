"""
Gemini structured-output client (Redesign Phase 0) — turns a natural-language question into a
flat `LLMExtraction` via the Gemini API's JSON-schema-constrained generation (`responseSchema` on
`generateContent`). Replaces the local-Ollama client (`qwen2.5:3b-instruct`) with the free-tier
Gemini API (`gemini-3.5-flash-lite`) — see `REDESIGN_PLAN.md` decision #6 for why, and for the
known follow-up debt (docs/deck still claim "local, zero-cost" and need correcting separately).

The response schema below is hand-written to match `LLMExtraction` exactly, rather than converting
`LLMExtraction.model_json_schema()` automatically — Gemini's `responseSchema` is a stricter subset
of OpenAPI 3.0 (uppercase type names, no `$defs`/`$ref`/`anyOf`), and `LLMExtraction` is simple and
flat enough that hand-writing it once is safer than a general-purpose converter neither tested nor
needed elsewhere.
"""

import datetime as dt
import json

import httpx

from app.config import get_settings
from app.llm.spend_tracker import get_spend_tracker
from app.ocean.regions import REGIONS
from app.query.schema import LLMExtraction

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

_REGION_KEYS = list(REGIONS.keys())
_REGION_LIST_TEXT = "\n".join(f'- "{key}" — {region["name"]}' for key, region in REGIONS.items())

SYSTEM_PROMPT_TEMPLATE = """You extract structured information from a question about ocean data \
(ARGO floats, sea surface temperature, salinity) for a set of real ocean regions.

Today's date is {today}. Only set start_date/end_date if the question actually names a time \
period (resolve relative ones like "last week" to real ISO dates, YYYY-MM-DD); otherwise leave \
them null — do not invent a date range for a question that didn't ask for one.

Intents (pick exactly one that best fits):
- explore_region: general browsing of MULTIPLE floats in a region — "what floats are in X", \
"show me X" (a region name), "list floats", "what's out there in X", "give me an overview of X"
- find_events: asking to FIND/DISCOVER unusual or anomalous conditions somewhere, e.g. "is \
anything unusual happening in X", "any warming events", "has anything weird been going on in X", \
"what's changed in X lately"
- find_anomalies: same as find_events
- compare_regions: explicitly comparing two named regions against each other, e.g. "which is \
warmer, X or Y", "how does X differ from Y", "X vs Y"
- inspect_float: asking for general info about ONE already-selected float using "this/that \
float" or an ID, e.g. "tell me about this float", "what is this float's status", "give me the \
details on this one" — if the question asks for a specific data product (thermocline, evidence) \
about that float, use the more specific intent for that instead, not inspect_float
- get_thermocline: asking specifically about the thermocline / depth layers / where temperature \
drops fast, even if phrased "for this float", e.g. "where does it get cold fast", "what's the \
thermocline depth here"
- get_evidence: asking to JUSTIFY or EXPLAIN a conclusion that was already stated, e.g. "how do \
you know", "why do you say that", "what's the evidence", "prove it", "how do you know this is \
real", "what makes you say that's unusual" — the question challenges an existing claim, it does \
not ask to search for something new
- surface_subsurface: asking what a surface condition (SST) looks like underneath / at depth, \
e.g. "what does this look like below the surface", "is this warming happening underwater too"
- explain: a general knowledge / "how does this work" question about oceans, ocean science, \
ARGO, ARGO floats (including questions about the worldwide ARGO program as a whole, not this \
tool's own data — e.g. "how many ARGO floats exist in the world", "who runs the ARGO program"), \
sea temperature/salinity, currents, climatology baselines, marine heatwaves, El Nino, or what \
this tool does — the question wants an EXPLANATION, not a search over a specific region/float/ \
event's real data. A floats/counting question with NO region named and NOT phrased as "in this \
dataset" or "here" is explain, not explore_region — explore_region is only for browsing floats \
within one of this tool's own named regions. Never needs a region; never set \
clarification_needed for it; never set clarification_needed for an off-topic question either — \
explain also covers "not an ocean question at all" (the explain answer itself declines those).

Examples:
Q: "What is an ARGO float?" -> intent: explain
Q: "How deep do these floats go and why?" -> intent: explain
Q: "What does subsurface warming mean?" -> intent: explain
Q: "How many ARGO floats are there in the world?" -> intent: explain
Q: "Who runs the ARGO program?" -> intent: explain
Q: "What is El Nino?" -> intent: explain
Q: "What floats are in the Arabian Sea?" -> intent: explore_region
Q: "Show me the Bay of Bengal" -> intent: explore_region
Q: "What's going on in the Arabian Sea?" -> intent: explore_region
Q: "Tell me about this float" -> intent: inspect_float
Q: "Show me the thermocline for this float" -> intent: get_thermocline
Q: "Where does it get cold fast around here?" -> intent: get_thermocline
Q: "How do you know this is unusual?" -> intent: get_evidence
Q: "What makes you so sure?" -> intent: get_evidence
Q: "Is anything unusual happening in the Bay of Bengal?" -> intent: find_anomalies
Q: "Has anything weird been going on in the Arabian Sea?" -> intent: find_anomalies
Q: "What is the evidence for this event?" -> intent: get_evidence
Q: "Which is warmer, the Arabian Sea or the Bay of Bengal?" -> intent: compare_regions
Q: "Is this warm water also showing up deeper down?" -> intent: surface_subsurface
Q: "What's happening with the Gulf Stream?" -> intent: explore_region, region: gulf_stream
Q: "Any marine heatwaves in the Mediterranean?" -> intent: find_anomalies, region: mediterranean_sea
Q: "Compare the Tasman Sea and the Humboldt Current" -> intent: compare_regions, \
region: tasman_sea, region_b: humboldt_current
Q: "What's the deal with the Blob region lately?" -> intent: find_anomalies, \
region: california_current

Only these regions exist in this system — never invent or guess a region key that isn't one of
these exact keys, and match by the real place names/nicknames people would actually use, not just
the literal key spelling:
{region_list}

If the question doesn't name (or clearly imply, e.g. "the Bay" for Bay of Bengal, "the Med" for \
Mediterranean Sea, "the Blob region" for California Current) one of these regions and the intent \
you picked needs one, set clarification_needed=true and say what's missing in \
clarification_message. Do not guess a region.

variables must contain only "temperature" and/or "salinity". Infer from context (e.g. "salty" -> \
salinity); default to ["temperature"] if the question doesn't specify and a variable is needed.

region_b is only ever set for compare_regions, and only when a second distinct region is named.
"""

_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "intent": {
            "type": "STRING",
            "enum": [
                "explore_region",
                "find_events",
                "find_anomalies",
                "inspect_float",
                "get_thermocline",
                "compare_regions",
                "get_evidence",
                "surface_subsurface",
                "explain",
            ],
        },
        "region": {"type": "STRING", "enum": _REGION_KEYS, "nullable": True},
        "region_b": {"type": "STRING", "enum": _REGION_KEYS, "nullable": True},
        "start_date": {"type": "STRING", "nullable": True},
        "end_date": {"type": "STRING", "nullable": True},
        "variables": {
            "type": "ARRAY",
            "items": {"type": "STRING", "enum": ["temperature", "salinity"]},
        },
        "clarification_needed": {"type": "BOOLEAN"},
        "clarification_message": {"type": "STRING", "nullable": True},
    },
    "required": ["intent", "variables", "clarification_needed"],
}


class GeminiExtractionError(RuntimeError):
    """Raised on any failure to get a valid extraction — a failed request, an auth error, a
    timeout, or output that doesn't parse as JSON/doesn't validate against `LLMExtraction`.
    Callers must treat this as "cannot proceed," never as "no clarification needed" — see
    `app/query/orchestrator.py`."""


async def extract(question: str, *, reference_date: dt.date | None = None) -> LLMExtraction:
    """Calls the real Gemini API with JSON-schema-constrained generation and returns a validated
    `LLMExtraction`. `reference_date` is exposed for tests that need deterministic relative-date
    resolution; production calls always use the real current date."""
    settings = get_settings()
    tracker = get_spend_tracker()
    if tracker.is_exceeded():
        raise GeminiExtractionError("Daily Gemini call limit reached — try again after midnight UTC.")

    today = (reference_date or dt.date.today()).isoformat()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(today=today, region_list=_REGION_LIST_TEXT)

    url = f"{GEMINI_API_BASE}/{settings.gemini_model}:generateContent"
    tracker.record_call()
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                url,
                # The key travels as a header, not a `?key=...` query param — query strings are
                # routinely logged in full by proxies, load balancers and browser history, which
                # would otherwise leak the key; Google's own client libraries use this same header.
                headers={"x-goog-api-key": settings.gemini_api_key},
                json={
                    "contents": [{"parts": [{"text": f'{system_prompt}\n\nQuestion: "{question}"'}]}],
                    "generationConfig": {
                        "temperature": 0,
                        "responseMimeType": "application/json",
                        "responseSchema": _RESPONSE_SCHEMA,
                    },
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise GeminiExtractionError(f"Gemini request failed: {exc}") from exc

    body = response.json()
    try:
        raw = body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise GeminiExtractionError(f"Gemini returned no usable candidate: {body!r}") from exc

    try:
        payload = json.loads(raw)
        return LLMExtraction.model_validate(payload)
    except (json.JSONDecodeError, ValueError) as exc:
        raise GeminiExtractionError(f"Gemini returned an unparseable extraction: {raw!r}") from exc


EXPLAIN_PROMPT_TEMPLATE = """You are the guide inside FloatChat, a tool where people explore real \
ocean measurements from ARGO floats (robotic profiling floats that drift with currents, dive to \
about 2000 m every ~10 days, and measure temperature and salinity on the way up) plus NOAA OISST \
satellite sea-surface temperature, compared against the World Ocean Atlas 2023 (WOA23) seasonal \
climatology to find anomalies and cluster them into detected "events".

Answer the user's question in plain, friendly English for a curious non-scientist. Rules:
- Only answer questions about oceans, ocean science, ARGO / ocean-observing instruments, \
sea temperature, salinity, currents, climate-related ocean change, or how this tool works. If \
the question is about anything else, say in one sentence that you only cover the ocean, and \
suggest an ocean question instead.
- Be concrete and vivid; use one everyday analogy if it helps. 60-140 words. Short paragraphs \
or a short list. No headings, no markdown asterisks.
- Never invent specific numbers about THIS tool's dataset (float counts, temperatures, event \
counts). If the user wants those, tell them to ask about a named region or click a float or \
case file on the map. General, well-established scientific facts are fine.
- Regions this tool covers: {region_names}.

Question: "{question}"
"""


async def explain(question: str) -> str:
    """Free-text answer for the `explain` intent — general ocean/ARGO knowledge, scoped by the
    prompt above. Deliberately NOT structured output: this is the one place the LLM writes prose,
    and it is fenced to explanation only (no dataset numbers), keeping the "LLM never invents
    data" boundary intact."""
    settings = get_settings()
    tracker = get_spend_tracker()
    if tracker.is_exceeded():
        raise GeminiExtractionError("Daily Gemini call limit reached — try again after midnight UTC.")

    prompt = EXPLAIN_PROMPT_TEMPLATE.format(
        region_names=", ".join(r["name"] for r in REGIONS.values()), question=question
    )
    url = f"{GEMINI_API_BASE}/{settings.gemini_model}:generateContent"
    tracker.record_call()
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                url,
                headers={"x-goog-api-key": settings.gemini_api_key},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.4, "maxOutputTokens": 400},
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise GeminiExtractionError(f"Gemini request failed: {exc}") from exc
    body = response.json()
    try:
        return body["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as exc:
        raise GeminiExtractionError(f"Gemini returned no usable answer: {body!r}") from exc
