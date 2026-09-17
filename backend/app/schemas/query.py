from pydantic import BaseModel

from app.query.schema import OceanQuery, RegionKey


class QueryRequestContext(BaseModel):
    """What the frontend already knows from UI state — see `app/query/context.QueryContext`."""

    selected_region: RegionKey | None = None
    selected_float_id: int | None = None
    selected_event_id: int | None = None
    lat: float | None = None
    lon: float | None = None


class QueryRequest(BaseModel):
    question: str
    context: QueryRequestContext | None = None


class QueryResponse(BaseModel):
    intent: str
    clarification_needed: bool
    clarification_message: str | None
    query: OceanQuery | None
    result: dict | None
