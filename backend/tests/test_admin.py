"""
/admin/* (app/api/admin.py) — the rebuilt admin API's core safety property: no configured key
means no access, ever, regardless of what's sent. This is the direct opposite of a hardcoded
default key, and is the thing worth actually testing here (the endpoints' own data is already
covered by test_retrieval_api.py's equivalent counts).
"""

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_admin_endpoints_refuse_everything_when_no_key_is_configured(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "admin_api_key", "")
    with TestClient(app) as client:
        response = client.get("/admin/status", headers={"X-Admin-Key": "anything"})
    assert response.status_code == 503


def test_admin_endpoints_reject_a_wrong_key(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "admin_api_key", "the-real-key")
    with TestClient(app) as client:
        response = client.get("/admin/status", headers={"X-Admin-Key": "wrong-key"})
    assert response.status_code == 401


def test_admin_endpoints_reject_a_missing_key(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "admin_api_key", "the-real-key")
    with TestClient(app) as client:
        response = client.get("/admin/status")
    assert response.status_code == 401


def test_admin_status_returns_real_counts_with_the_right_key(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "admin_api_key", "the-real-key")
    with TestClient(app) as client:
        response = client.get("/admin/status", headers={"X-Admin-Key": "the-real-key"})
    assert response.status_code == 200
    body = response.json()
    assert body["database"] == "ok"
    assert set(body["counts"]) == {"floats", "profiles", "events"}


def test_admin_spend_reset_zeroes_the_counter(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "admin_api_key", "the-real-key")
    with TestClient(app) as client:
        headers = {"X-Admin-Key": "the-real-key"}
        before = client.get("/admin/spend", headers=headers).json()
        assert "daily_limit" in before
        after = client.post("/admin/spend/reset", headers=headers).json()
    assert after["calls_today"] == 0
