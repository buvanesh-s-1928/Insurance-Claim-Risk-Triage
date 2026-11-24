"""Claim risk triage: FastAPI backend.

Run from the project root:  python run.py   (or: uvicorn app.main:app)
"""
import io
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
STATIC = Path(__file__).resolve().parent / "static"
DB_PATH = ROOT / "data" / "decisions.db"
MAX_ROWS = 20000
MAX_BYTES = 8 * 1024 * 1024

pipe = joblib.load(MODELS / "model.joblib")
meta = json.loads((MODELS / "meta.json").read_text())
FEATURES = meta["features"]
SCHEMA = {f["name"]: f for f in meta["schema"]}
NUMERIC = [f["name"] for f in meta["schema"] if f["type"] == "num"]
QUANT = np.array(meta["quantiles"])
BASE_RATE = meta["base_rate"]

pre, model = pipe.named_steps["pre"], pipe.named_steps["model"]
OUT_NAMES = list(pre.get_feature_names_out())
# Map every encoded column back to the original claim field it came from.
OUT_TO_FEATURE = []
for name in OUT_NAMES:
    stem = name.split("__", 1)[1]
    owner = next((f for f in sorted(FEATURES, key=len, reverse=True) if stem == f or stem.startswith(f + "_")), None)
    OUT_TO_FEATURE.append(owner)
FEATURE_INDEX = {f: [i for i, o in enumerate(OUT_TO_FEATURE) if o == f] for f in FEATURES}
explainer = shap.TreeExplainer(model)
_raw = pd.read_csv(ROOT / "data" / "claims_fraud_data.csv")
DEFAULTS = {f: (int(_raw[f].mode().iloc[0]) if f in NUMERIC else str(_raw[f].mode().iloc[0])) for f in FEATURES}

RULES = {
    "early_accident": lambda r: r["Days:Policy-Accident"] in ("none", "1 to 7", "8 to 15"),
    "recent_move": lambda r: r["AddressChange-Claim"] in ("under 6 months", "1 year", "2 to 3 years"),
}
RULE_INFO = {r["id"]: r for r in meta["rules"]}


def db():
    DB_PATH.parent.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("""CREATE TABLE IF NOT EXISTS decisions (
        claim_id TEXT PRIMARY KEY, decision TEXT NOT NULL, note TEXT, score REAL, updated TEXT NOT NULL)""")
    return con


app = FastAPI(title="Claim risk triage", docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")


def top_share(scores):
    """Share of reference claims that scored higher: 0 is the very riskiest, 1 the safest."""
    pct = np.interp(scores, QUANT, np.linspace(0, 100, len(QUANT)))
    return 1 - pct / 100


def clean_frame(df):
    """Validate an uploaded or typed table. Returns (usable frame, problems)."""
    problems = {"missing_columns": [], "skipped": [], "unseen_values": {}}
    missing = [c for c in FEATURES if c not in df.columns]
    if missing:
        problems["missing_columns"] = missing
        return None, problems
    df = df.copy()
    if "ClaimID" not in df.columns:
        df.insert(0, "ClaimID", [f"row-{i + 1}" for i in range(len(df))])
    df["ClaimID"] = df["ClaimID"].astype(str)
    keep = np.ones(len(df), dtype=bool)
    for c in FEATURES:
        s = df[c]
        if c in NUMERIC:
            s = pd.to_numeric(s, errors="coerce")
            df[c] = s
        else:
            df[c] = s.astype("object").where(s.notna(), None)
            df[c] = df[c].map(lambda v: v.strip() if isinstance(v, str) else v)
        bad = s.isna().to_numpy() if c in NUMERIC else df[c].isna().to_numpy()
        for i in np.where(bad & keep)[0]:
            problems["skipped"].append({"claim_id": df["ClaimID"].iloc[i], "reason": f"{SCHEMA[c]['label']} is missing or not valid"})
        keep &= ~bad
        known = set(map(str, SCHEMA[c]["options"]))
        col = df.loc[keep, c]
        unseen = (col.map(lambda v: str(int(v)) if float(v).is_integer() else str(v)) if c in NUMERIC else col).astype(str)
        unseen = unseen[~unseen.isin(known)]
        if len(unseen):
            problems["unseen_values"][SCHEMA[c]["label"]] = sorted(unseen.unique().tolist())[:5]
    return df[keep].reset_index(drop=True), problems


def explain(frame):
    X = frame[FEATURES]
    scores = pipe.predict_proba(X)[:, 1]
    enc = pre.transform(X)
    sv = explainer.shap_values(enc)
    sv = sv[1] if isinstance(sv, list) else sv
    agg = np.column_stack([sv[:, FEATURE_INDEX[f]].sum(axis=1) for f in FEATURES])
    return scores, agg


def build_rows(frame, scores, agg, outcomes=None):
    shares = top_share(scores)
    rows = []
    for i in range(len(frame)):
        rec = frame.iloc[i]
        order = np.argsort(-np.abs(agg[i]))[:5]
        reasons = [{"field": FEATURES[j], "label": SCHEMA[FEATURES[j]]["label"], "value": str(rec[FEATURES[j]]),
                    "effect": float(agg[i][j]), "direction": "raises" if agg[i][j] > 0 else "lowers"}
                   for j in order if abs(agg[i][j]) > 1e-4]
        flags = []
        for rid, test in RULES.items():
            if test(rec):
                info = RULE_INFO[rid]
                flags.append({"id": rid, "title": info["title"], "claims": info["claims"], "fraud_rate": info["fraud_rate"]})
        row = {"id": str(rec["ClaimID"]), "score": float(scores[i]), "top_share": float(shares[i]),
               "reasons": reasons, "flags": flags,
               "fields": {f: (int(rec[f]) if f in NUMERIC else str(rec[f])) for f in FEATURES}}
        if outcomes is not None:
            row["outcome"] = outcomes[i]
        rows.append(row)
    rows.sort(key=lambda r: -r["score"])
    for k, r in enumerate(rows, 1):
        r["rank"] = k
    return rows


def run_batch(df):
    frame, problems = clean_frame(df)
    if frame is None:
        return {"error": "missing_columns", "problems": problems}
    outcomes = None
    if "FraudFound" in frame.columns:
        outcomes = frame["FraudFound"].astype(str).tolist()
    if len(frame) == 0:
        return {"error": "no_valid_rows", "problems": problems}
    scores, agg = explain(frame)
    rows = build_rows(frame, scores, agg, outcomes)
    return {"claims": rows, "problems": problems, "has_outcomes": outcomes is not None,
            "summary": {"count": len(rows), "mean_score": float(scores.mean())}}


@app.get("/api/schema")
def schema():
    return {"schema": meta["schema"], "excluded": meta["excluded"], "bands": meta["bands"],
            "dataset": meta["dataset"], "base_rate": BASE_RATE, "rules": meta["rules"], "defaults": DEFAULTS}


@app.get("/api/model")
def model_info():
    keys = ("holdout", "cv", "capacity_curve", "calibration", "fairness", "dataset", "base_rate", "rules", "excluded")
    return {k: meta[k] for k in keys}


class SingleClaim(BaseModel):
    claim: dict


@app.post("/api/score")
def score_one(body: SingleClaim):
    merged = {**DEFAULTS, **body.claim}
    df = pd.DataFrame([merged])
    out = run_batch(df)
    if "error" in out:
        raise HTTPException(422, out)
    return {"claim": out["claims"][0], "problems": out["problems"]}


@app.post("/api/batch")
async def score_batch(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, {"error": "too_large", "message": "File is larger than 8 MB."})
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception:
        raise HTTPException(422, {"error": "unreadable", "message": "This file could not be read as a CSV."})
    if len(df) > MAX_ROWS:
        raise HTTPException(413, {"error": "too_many_rows", "message": f"Limit is {MAX_ROWS:,} claims per file."})
    out = run_batch(df)
    if "error" in out:
        raise HTTPException(422, out)
    return out


@app.get("/api/sample")
def sample():
    return run_batch(pd.read_csv(MODELS / "sample_batch.csv"))


@app.get("/api/template.csv")
def template():
    return FileResponse(MODELS / "template.csv", media_type="text/csv", filename="claims_template.csv")


@app.get("/api/sample.csv")
def sample_csv():
    return FileResponse(MODELS / "sample_batch.csv", media_type="text/csv", filename="sample_claims.csv")


class Decision(BaseModel):
    claim_id: str
    decision: str
    note: str = ""
    score: float | None = None


DECISIONS = ("Under review", "Cleared", "Escalated")


@app.get("/api/decisions")
def decisions():
    with db() as con:
        rows = con.execute("SELECT claim_id, decision, note, score, updated FROM decisions ORDER BY updated DESC").fetchall()
    return [{"claim_id": r[0], "decision": r[1], "note": r[2], "score": r[3], "updated": r[4]} for r in rows]


@app.post("/api/decisions")
def save_decision(d: Decision):
    if d.decision not in DECISIONS:
        raise HTTPException(422, {"message": f"Decision must be one of: {', '.join(DECISIONS)}."})
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with db() as con:
        con.execute("""INSERT INTO decisions(claim_id, decision, note, score, updated) VALUES (?,?,?,?,?)
                       ON CONFLICT(claim_id) DO UPDATE SET decision=excluded.decision, note=excluded.note,
                       score=excluded.score, updated=excluded.updated""",
                    (d.claim_id, d.decision, d.note[:1000], d.score, now))
    return {"ok": True, "updated": now}


@app.delete("/api/decisions/{claim_id}")
def delete_decision(claim_id: str):
    with db() as con:
        con.execute("DELETE FROM decisions WHERE claim_id = ?", (claim_id,))
    return {"ok": True}


@app.get("/api/decisions.csv")
def decisions_csv():
    df = pd.DataFrame(decisions(), columns=["claim_id", "decision", "note", "score", "updated"])
    return PlainTextResponse(df.to_csv(index=False), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=decisions.csv"})


@app.exception_handler(HTTPException)
async def http_exc(_, exc):
    detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=detail)


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
