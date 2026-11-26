import sys
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app, db, seed_demo_user

client = TestClient(app)


def setup_module():
    seed_demo_user()


def test_demo_login():
    res = client.post("/api/auth/demo-login")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["user"]["email"] == "elena.rostova@claimtriage.internal"
    assert data["user"]["hasCompletedTour"] is True
    assert "token" in data


def test_register_validation():
    # Name too short
    r1 = client.post("/api/auth/register", json={"name": "A", "email": "a@b.com", "password": "password123"})
    assert r1.status_code == 400

    # Invalid email
    r2 = client.post("/api/auth/register", json={"name": "Alice Smith", "email": "invalidemail", "password": "password123"})
    assert r2.status_code == 400

    # Password too short
    r3 = client.post("/api/auth/register", json={"name": "Alice Smith", "email": "alice@corp.com", "password": "123"})
    assert r3.status_code == 400


def test_register_and_login_flow():
    test_email = "investigator.unit@testinsurer.com"
    test_pass = "SecurePass2026!"

    # Clean up test user if exists from previous run
    with db() as con:
        con.execute("DELETE FROM users WHERE email = ?", (test_email,))

    # 1. Register
    reg_res = client.post("/api/auth/register", json={
        "name": "Unit Tester",
        "email": test_email,
        "password": test_pass,
        "role": "Fraud Specialist"
    })
    assert reg_res.status_code == 200
    reg_data = reg_res.json()
    assert reg_data["ok"] is True
    assert reg_data["user"]["email"] == test_email
    assert reg_data["user"]["hasCompletedTour"] is False
    token = reg_data["token"]

    # 2. Duplicate registration fails
    dup_res = client.post("/api/auth/register", json={
        "name": "Unit Tester",
        "email": test_email,
        "password": test_pass
    })
    assert dup_res.status_code == 400

    # 3. Login wrong password fails
    bad_pass_res = client.post("/api/auth/login", json={
        "email": test_email,
        "password": "WrongPassword!"
    })
    assert bad_pass_res.status_code == 401

    # 4. Login correct password succeeds
    login_res = client.post("/api/auth/login", json={
        "email": test_email,
        "password": test_pass
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["user"]["email"] == test_email
    assert login_data["user"]["hasCompletedTour"] is False

    # 5. Complete tour
    tour_res = client.post("/api/auth/complete-tour", json={"email": test_email})
    assert tour_res.status_code == 200
    assert tour_res.json()["hasCompletedTour"] is True

    # 6. Check login again - tour is now completed
    login2_res = client.post("/api/auth/login", json={
        "email": test_email,
        "password": test_pass
    })
    assert login2_res.status_code == 200
    assert login2_res.json()["user"]["hasCompletedTour"] is True

    # 7. Check /api/auth/me with session token
    me_res = client.get(f"/api/auth/me?token={token}")
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == test_email

    # 8. Logout
    logout_res = client.post(f"/api/auth/logout?token={token}")
    assert logout_res.status_code == 200

    # 9. Session invalidated
    me2_res = client.get(f"/api/auth/me?token={token}")
    assert me2_res.status_code == 401
