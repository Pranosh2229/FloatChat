from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Profile
from app.schemas.profiles import ProfileDetail

router = APIRouter(tags=["profiles"])


@router.get("/profiles/{profile_id}", response_model=ProfileDetail)
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)) -> ProfileDetail:
    profile = await db.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    return ProfileDetail.model_validate(profile)
