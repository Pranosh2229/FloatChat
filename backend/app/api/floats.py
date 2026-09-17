from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ArgoFloat, Profile
from app.schemas.floats import FloatDetail, FloatSummary, TrajectoryPoint, TrajectoryResponse

router = APIRouter(tags=["floats"])


@router.get("/floats", response_model=list[FloatSummary])
async def list_floats(
    min_lat: float | None = Query(None),
    max_lat: float | None = Query(None),
    min_lon: float | None = Query(None),
    max_lon: float | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[FloatSummary]:
    stmt = select(ArgoFloat)
    if None not in (min_lat, max_lat, min_lon, max_lon):
        stmt = stmt.where(
            ArgoFloat.latest_lat.between(min_lat, max_lat),
            ArgoFloat.latest_lon.between(min_lon, max_lon),
        )
    result = await db.execute(stmt)
    return [FloatSummary.model_validate(f) for f in result.scalars().all()]


@router.get("/floats/{float_id}", response_model=FloatDetail)
async def get_float(float_id: int, db: AsyncSession = Depends(get_db)) -> FloatDetail:
    argo_float = await db.get(ArgoFloat, float_id)
    if argo_float is None:
        raise HTTPException(status_code=404, detail=f"Float {float_id} not found")
    return FloatDetail.model_validate(argo_float)


@router.get("/floats/{float_id}/trajectory", response_model=TrajectoryResponse)
async def get_float_trajectory(
    float_id: int, db: AsyncSession = Depends(get_db)
) -> TrajectoryResponse:
    argo_float = await db.get(ArgoFloat, float_id)
    if argo_float is None:
        raise HTTPException(status_code=404, detail=f"Float {float_id} not found")

    result = await db.execute(
        select(Profile)
        .where(Profile.float_id == float_id)
        .order_by(Profile.timestamp.asc())
    )
    points = [
        TrajectoryPoint(
            profile_id=p.id, timestamp=p.timestamp, latitude=p.latitude, longitude=p.longitude
        )
        for p in result.scalars().all()
    ]
    return TrajectoryResponse(float_id=float_id, wmo_id=argo_float.wmo_id, points=points)
