from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.anomaly.baseline import BaselineUnavailableError
from app.anomaly.engine import calculate_profile_anomalies
from app.anomaly.surface_subsurface import investigate
from app.anomaly.thermocline import detect_thermocline
from app.database import get_db
from app.models import Profile
from app.schemas.anomaly import AnomalyOut, SurfaceSubsurfaceOut, ThermoclineOut

router = APIRouter(tags=["anomaly"])


async def _get_profile_or_404(profile_id: int, db: AsyncSession) -> Profile:
    profile = await db.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    return profile


@router.get("/profiles/{profile_id}/anomalies", response_model=list[AnomalyOut])
async def get_profile_anomalies(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await _get_profile_or_404(profile_id, db)
    try:
        anomalies = calculate_profile_anomalies(
            profile.latitude,
            profile.longitude,
            profile.pressure_dbar,
            profile.temperature_c,
            profile.salinity_psu,
            profile.qc_temperature,
            profile.qc_salinity,
            profile.timestamp.month,
        )
    except BaselineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return anomalies


@router.get("/profiles/{profile_id}/thermocline", response_model=ThermoclineOut | None)
async def get_profile_thermocline(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await _get_profile_or_404(profile_id, db)
    return detect_thermocline(profile.pressure_dbar, profile.temperature_c, profile.qc_temperature)


@router.get("/surface-subsurface", response_model=SurfaceSubsurfaceOut | None)
async def get_surface_subsurface(lat: float, lon: float, db: AsyncSession = Depends(get_db)):
    try:
        result = await investigate(db, lat, lon)
    except BaselineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return result
