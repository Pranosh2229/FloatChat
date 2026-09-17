from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Event, Evidence
from app.schemas.events import EventSummary, EvidenceOut

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[EventSummary])
async def list_events(
    region: str | None = Query(None), db: AsyncSession = Depends(get_db)
) -> list[EventSummary]:
    stmt = select(Event).order_by(Event.anomaly_count.desc())
    if region:
        stmt = stmt.where(Event.region == region)
    result = await db.execute(stmt)
    return [EventSummary.model_validate(e) for e in result.scalars().all()]


@router.get("/events/{event_id}", response_model=EventSummary)
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)) -> EventSummary:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return EventSummary.model_validate(event)


@router.get("/events/{event_id}/evidence", response_model=EvidenceOut)
async def get_event_evidence(event_id: int, db: AsyncSession = Depends(get_db)) -> EvidenceOut:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    evidence = await db.scalar(select(Evidence).where(Evidence.event_id == event_id))
    if evidence is None:
        raise HTTPException(status_code=404, detail=f"No evidence recorded for event {event_id}")
    return EvidenceOut.model_validate(evidence)
