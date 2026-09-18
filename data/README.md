# Data

`raw/` and `processed/` are gitignored (see root `.gitignore`) — real ARGO NetCDF files, WOA23
climatology files, and satellite SST products are never committed to the repo.

- `raw/` — untouched downloads from the ARGO GDAC, WOA23, and SST sources (Part 5).
- `processed/` — QC'd, standardized output (Parquet + references into PostGIS) produced by
  `scripts/ingest_argo.py` / `scripts/preprocess.py`.

To reproduce the dev subset locally, run the ingestion scripts described in `docs/data-pipeline.md`
once Part 5 lands. Nothing in this repo fabricates observations — if a file isn't here, the feature
that needs it isn't wired to real data yet (see `PROGRESS.md`).
