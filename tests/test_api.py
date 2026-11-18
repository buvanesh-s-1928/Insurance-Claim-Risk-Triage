"""Run from the project root:  python -m pytest -q"""
import io
import sys
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import DB_PATH, app  # noqa: E402

client = TestClient(app)
SAMPLE = Path(__file__).resolve().parents[1] / "models" / "sample_batch.csv"


def test_schema_and_model():
    s = client.get("/api/schema").json()
    assert len(s["schema"]) == 22 and "Fault" not in [f["name"] for f in s["schema"]]
    m = client.get("/api/model").json()
    assert 0.5 < m["cv"]["model"]["roc_auc"]["mean"] < 1 and m["holdout"]["claims"] > 1000


def test_sample_is_ranked_and_explained():
    d = client.get("/api/sample").json()
    scores = [c["score"] for c in d["claims"]]
    assert scores == sorted(scores, reverse=True) and d["claims"][0]["rank"] == 1
    assert d["claims"][0]["reasons"] and 0 <= d["claims"][0]["top_share"] <= 1


def test_single_claim_matches_batch():
    d = client.get("/api/sample").json()
    c = d["claims"][5]
    body = {"claim": {**c["fields"], "ClaimID": "x"}}
    r = client.post("/api/score", json=body).json()["claim"]
    assert abs(r["score"] - c["score"]) < 1e-9


def test_upload_errors():
    r = client.post("/api/batch", files={"file": ("a.csv", io.BytesIO(b"ClaimID,Make\nA,Honda\n"), "text/csv")})
    assert r.status_code == 422 and "Month" in r.json()["problems"]["missing_columns"]
    df = pd.read_csv(SAMPLE).head(5)
    df.loc[0, "Make"] = "Zorblax"
    df.loc[1, "Deductible"] = None
    r = client.post("/api/batch", files={"file": ("b.csv", io.BytesIO(df.to_csv(index=False).encode()), "text/csv")})
    body = r.json()
    assert r.status_code == 200 and len(body["claims"]) == 4
    assert body["problems"]["unseen_values"] == {"Vehicle make": ["Zorblax"]}
    assert len(body["problems"]["skipped"]) == 1


def test_decisions_round_trip():
    assert client.post("/api/decisions", json={"claim_id": "T-1", "decision": "Fraud"}).status_code == 422
    assert client.post("/api/decisions", json={"claim_id": "T-1", "decision": "Cleared", "note": "ok"}).status_code == 200
    assert any(d["claim_id"] == "T-1" for d in client.get("/api/decisions").json())
    client.delete("/api/decisions/T-1")
    assert not any(d["claim_id"] == "T-1" for d in client.get("/api/decisions").json())
