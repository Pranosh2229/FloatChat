import datetime as dt

from sqlalchemy import select

from app.database import async_session_factory
from app.models import Anomaly, ArgoFloat, Evidence, Event, Profile, SatelliteSST


async def test_models_round_trip() -> None:
    """
    Writes one row per entity in spec §17 (plus the confirmed SST addition), reads them back,
    then rolls back — proves the schema round-trips through real Postgres/PostGIS without
    leaving test data behind in the dev database.
    """
    async with async_session_factory() as session:
        now = dt.datetime.now(dt.timezone.utc)

        argo_float = ArgoFloat(
            wmo_id="2903334",
            deployment_lat=13.0,
            deployment_lon=88.0,
            deployment_location="POINT(88.0 13.0)",
            latest_lat=13.5,
            latest_lon=88.2,
            latest_location="POINT(88.2 13.5)",
            latest_time=now,
            depth_min=0.0,
            depth_max=2000.0,
            data_mode="D",
            float_metadata={"platform": "APEX"},
        )
        session.add(argo_float)
        await session.flush()

        profile = Profile(
            float_id=argo_float.id,
            timestamp=now,
            latitude=13.5,
            longitude=88.2,
            location="POINT(88.2 13.5)",
            pressure_dbar=[0.0, 10.0, 20.0],
            temperature_c=[29.1, 28.7, 27.9],
            salinity_psu=[33.1, 33.2, 33.4],
            qc_temperature=["1", "1", "1"],
            qc_salinity=["1", "1", "1"],
            data_mode="D",
        )
        session.add(profile)
        await session.flush()

        anomaly = Anomaly(
            profile_id=profile.id,
            variable="temperature",
            depth_m=10.0,
            observed_value=28.7,
            expected_value=27.5,
            anomaly_value=1.2,
            baseline_id="WOA23",
            method="seasonal_climatology",
        )
        session.add(anomaly)
        await session.flush()

        event = Event(
            type="surface_warming",
            region="bay_of_bengal",
            start_time=now,
            end_time=now,
            depth_min=0.0,
            depth_max=50.0,
            affected_float_ids=[argo_float.id],
            anomaly_count=1,
            spatial_extent={"min_lat": 5.0, "max_lat": 22.0, "min_lon": 78.0, "max_lon": 95.0},
            method="basic_grouping",
        )
        session.add(event)
        await session.flush()

        evidence = Evidence(
            event_id=event.id,
            float_ids=[argo_float.id],
            profile_ids=[profile.id],
            baseline_id="WOA23",
            calculation={"observed": 28.7, "expected": 27.5, "anomaly": 1.2},
            source="argo_gdac",
        )
        session.add(evidence)

        sst = SatelliteSST(
            latitude=13.4,
            longitude=88.1,
            location="POINT(88.1 13.4)",
            timestamp=now,
            sst_celsius=29.3,
            source="NOAA OISST v2.1",
        )
        session.add(sst)

        await session.flush()

        result = await session.execute(select(ArgoFloat).where(ArgoFloat.id == argo_float.id))
        assert result.scalar_one().wmo_id == "2903334"

        result = await session.execute(select(Profile).where(Profile.float_id == argo_float.id))
        assert result.scalar_one().temperature_c == [29.1, 28.7, 27.9]

        result = await session.execute(select(Event).where(Event.id == event.id))
        assert result.scalar_one().affected_float_ids == [argo_float.id]

        await session.rollback()
