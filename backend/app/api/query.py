from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.query.context import QueryContext
from app.query.orchestrator import run_query
from app.schemas.query import QueryRequest, QueryResponse

router = APIRouter(tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def post_query(request: QueryRequest, db: AsyncSession = Depends(get_db)) -> QueryResponse:
    """
    Part 9 — the natural-language entry point. Never calculates anything itself: extracts intent
    via Gemini, validates/resolves it against real business rules (`app/query/orchestrator.py`),
    then dispatches to the same deterministic backend functions every other endpoint uses
    (`app/query/tools.py`). Ambiguous questions come back with `clarification_needed=true` and a
    `result` of `null` — never a guessed answer.
    """
    context = QueryContext(**request.context.model_dump()) if request.context else QueryContext()
    outcome = await run_query(db, request.question, context)
    return QueryResponse(
        intent=outcome.intent,
        clarification_needed=outcome.clarification_needed,
        clarification_message=outcome.clarification_message,
        query=outcome.ocean_query,
        result=outcome.result,
    )
