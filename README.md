# Insurance Claim Risk Triage

> **Explainable ML decision-support tool** that scores auto insurance claims for fraud risk, ranks them High / Medium / Low, and explains every score for human investigators using SHAP.
>
> **Infosys Springboard Internship 7.0 — Milestone 1**

---

## ⚠️ v1 Prototype Disclaimer

This is a **v1 prototype built exclusively on publicly available historical auto claims data (1994–1996)**.

Because public fraud datasets carry well-known limitations — outdated fraud patterns (30-year-old data), no monetary claim amounts, unverified source provenance, and labels that only capture *detected* fraud — **the model has modest predictive power and must not be used to make automated decisions about claimants.**

This version demonstrates the full triage methodology and software architecture. The model will be retrained on higher-quality proprietary industry data in future versions.

**This tool never automatically rejects a claim. It only helps investigators decide which claims to look at first.**

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Application Pages](#application-pages)
3. [How It Works — Technical Architecture](#how-it-works--technical-architecture)
4. [Machine Learning Pipeline](#machine-learning-pipeline)
5. [SHAP Explainability](#shap-explainability)
6. [Heuristic Rule Checks](#heuristic-rule-checks)
7. [Model Performance (Validated Results)](#model-performance-validated-results)
8. [Fairness & Demographic Audit](#fairness--demographic-audit)
9. [Features Used & Features Excluded](#features-used--features-excluded)
10. [Dataset Description](#dataset-description)
11. [Project Layout](#project-layout)
12. [Installation & Running](#installation--running)
13. [Running Tests](#running-tests)
14. [Known Limitations](#known-limitations)
15. [Roadmap](#roadmap)

---

## What It Does

Insurance fraud investigators face a fundamental triage problem: a large batch of incoming claims, limited review capacity, and no principled way to decide where to start. Random or intuition-based review misses fraud at the top and wastes time on routine claims at the bottom.

**Claim Triage solves this by:**

- Assigning every claim a **fraud probability score** using a trained gradient boosting model.
- Ranking claims from riskiest to safest and placing each into a **High / Medium / Low risk band** calibrated to the team's review capacity.
- Explaining *why* a claim scored high using **SHAP feature attributions** mapped back to the original claim fields.
- Flagging **two heuristic rule checks** (early accident, recent address change) alongside the model score.
- Providing an **investigator decision log** (Under Review / Cleared / Escalated) with a full audit trail.

The system is designed around one principle: **a human investigator always makes the final call.**

---

## Application Pages

### 1. Claims Queue

The primary operational view.

- **Upload a CSV** of claims (up to 20,000 rows, 8 MB) or **load 400 pre-scored sample historical claims** to explore the system immediately.
- A **risk spectrum chart** (Plotly) shows every claim in the batch plotted by score, coloured by band (red = High, amber = Medium, grey = Low), with a draggable High-risk threshold.
- A **review capacity slider** (5–25% of batch) controls the High/Medium/Low band boundaries in real time — set it to match how many claims your team can actually review.
- The **ranked table** shows Rank, Claim ID, Risk Score, Band, the top SHAP driver, heuristic rule flags, and the current investigator decision.
- Filter by band (All / High / Medium / Low) or search by Claim ID.
- Click any claim to open its **full dossier**: score, band badge, SHAP bar chart, heuristic flags, and an inline decision form.
- Download the entire ranked output as a **CSV export**.

### 2. Assess a Claim

For single-claim intake scoring at the point of first contact.

- 22 dropdown fields (grouped by Policy, Vehicle, Accident, Reporting) pre-populated with the most common historical values.
- Score and SHAP chart **update automatically** after every field change (220ms debounce).
- A "Fill with highest-scoring sample claim" button lets you instantly see what a high-risk profile looks like.
- Useful for training investigators on how the model interprets different claim attributes.

### 3. Model & Limitations

A full transparency dashboard — no black boxes.

- **Key validation metrics**: fraud recall at 10% reviewed, PR-AUC, ROC-AUC, shuffled-label sanity check.
- **Review capacity curve**: shows how the share of all frauds caught increases as you review more of the ranked list, versus a random review baseline. Includes confidence bands from cross-validation.
- **Calibration curve**: checks whether the model's scores are honest probabilities — points near the diagonal mean "if the model says 10%, about 10% of those claims were actually fraud."
- **Fairness / demographic audit table**: verifies that protected attributes (sex, age, marital status) that are intentionally excluded as model inputs do not cause disproportionate flagging through proxy variables.
- **Excluded features table**: documents every field left out of the model and the methodological reason for the exclusion.

### 4. Decisions Log

A persistent audit trail of all investigator actions.

- Summary counts of decisions by status (Under Review / Cleared / Escalated).
- Full table: Claim ID, Decision, Investigator Notes, Risk Score at decision time, Timestamp.
- **CSV export** for downstream audit or case management system ingestion.
- Delete individual decision entries if entered in error.

---

## How It Works — Technical Architecture

```
┌─────────────────────────────────────────────────┐
│          Streamlit Frontend  (app.py)           │
│  Claims Queue │ Assess │ Model │ Decisions Log  │
└─────────────────────┬───────────────────────────┘
                      │ direct Python calls
┌─────────────────────▼───────────────────────────┐
│          Scoring & Triage Engine                │
│  clean_frame() → score_and_explain()            │
│  → build_triage_records()                       │
└──────┬──────────────┬──────────────┬────────────┘
       │              │              │
  joblib.load    shap.Tree-     SQLite DB
  model.joblib   Explainer     (decisions)
       │
  scikit-learn
  GradientBoosting
  Pipeline
```

**Tech Stack:**
| Layer | Technology |
|---|---|
| Frontend | Streamlit 1.30+, Plotly 5.x |
| ML Inference | scikit-learn GradientBoostingClassifier |
| Explainability | SHAP TreeExplainer |
| Data Processing | pandas, numpy, scipy |
| Persistence | SQLite (via Python stdlib `sqlite3`) |
| Legacy API | FastAPI + Uvicorn (retained for test suite) |
| Testing | pytest, FastAPI TestClient |

---

## Machine Learning Pipeline

The model is a **scikit-learn Pipeline** with two named steps:

### Step 1: Preprocessor (`pre`)
A `ColumnTransformer` that applies:
- **OneHotEncoder** (handle_unknown='ignore') on all 22 categorical claim fields.
- A **FunctionTransformer** pass-through on numeric fields (Deductible, number of cars, etc.).

### Step 2: Classifier (`model`)
A **GradientBoostingClassifier** trained to output calibrated fraud probability scores.

### Training Protocol
- **15,420 total auto claims** (923 confirmed fraud = 6.0% base rate).
- **80/20 stratified split**: 12,336 training, 3,084 holdout (held out and used exactly once for final reporting).
- **5-fold stratified cross-validation** on the training set for all reported CV metrics.
- Shuffled-label experiment run to confirm the pipeline does not leak target labels.

### Risk Band Assignment
Bands are not arbitrary thresholds — they are computed from the **percentile distribution of cross-validated scores on the training set**:

```
score_percentile = interp(claim_score, reference_quantiles, [0%, 100%])
top_share        = 1 - score_percentile / 100

High   → top_share ≤ capacity     (default: top 10%)
Medium → top_share ≤ 3 × capacity (default: top 10–30%)
Low    → everything else
```

The investigator adjusts `capacity` with the slider to match their team's actual review throughput.

---

## SHAP Explainability

Every score is decomposed using **SHAP (SHapley Additive exPlanations)** with a `TreeExplainer`, which produces exact Shapley values for tree-based models in linear time.

The raw SHAP values are over the one-hot encoded feature space. They are **aggregated back to the original claim fields** by summing the SHAP values across all one-hot columns that belong to each original field:

```python
# For each original feature f:
agg_shap[f] = sum(shap_values[:, feature_index[f]], axis=1)
```

This gives one interpretable SHAP contribution per claim field — positive means "this field raised the fraud score above average" and negative means "this field lowered it."

The top 5 drivers (by absolute SHAP magnitude) are displayed per claim as a horizontal bar chart. The fine print accompanying every explanation reads: *"These show what the model relied on. They are not proof of what caused a claim to be fraudulent."*

---

## Heuristic Rule Checks

Two plain rule checks are shown alongside the model score. They are independent of the model — they look up historical fraud rates for specific sub-groups:

| Rule | Condition | Purpose |
|---|---|---|
| **Early Accident** | `Days:Policy-Accident` ∈ {none, 1–7, 8–15} | Flags claims where the accident occurred within 15 days of policy inception — a known indicator of opportunistic fraud. |
| **Recent Address Change** | `AddressChange-Claim` ∈ {under 6 months, 1 year, 2–3 years} | Flags claims with an address change in the 3 years before the claim date. |

For each triggered rule, the UI displays the historical fraud rate for claims that share that characteristic, compared to the 6.0% overall base rate.

---

## Model Performance (Validated Results)

All figures below are on data the model never saw during training.

### Holdout Test Set (3,084 claims, used once)

| Metric | Value | Notes |
|---|---|---|
| Frauds caught in top 10% reviewed | **27.6%** | Likely range: 20.8%–33.0% (95% CI) |
| Random review baseline at 10% | **10%** | Expected catch if order is random |
| Improvement over random | **~2.8×** | At the 10% review level |

### Cross-Validation (5-fold, 12,336 training claims)

| Metric | Mean | Std Dev | Notes |
|---|---|---|---|
| PR-AUC (model) | **0.14** | ±0.014 | Random baseline: 0.06 (= base rate) |
| ROC-AUC (model) | **0.72** | — | 0.5 = random classifier |
| PR-AUC (shuffled labels) | **0.07** | — | Falls to chance: no label leakage |

### Interpreting These Numbers

- **PR-AUC of 0.14 on a 6% positive class** is roughly 2.3× better than random — meaningful signal, but far from a reliable standalone detector.
- **ROC-AUC of 0.72** indicates the model correctly ranks a fraud case above a non-fraud case 72% of the time.
- The **shuffled-label PR-AUC of 0.07** (close to the base rate of 0.06) confirms the pipeline is not memorising or leaking labels.
- **Accuracy is not reported** because predicting "not fraud" for every claim would already be ~94% accurate while catching zero fraud.

---

## Fairness & Demographic Audit

**Sex, Age, and Marital Status are intentionally excluded as model inputs.** However, correlated features (vehicle category, policy type, deductible) may serve as proxies and cause disparate impact.

The Model page displays a table auditing the **flag rate** (share of each sub-group placed in the High band), **observed fraud rate**, and **false flag rate** (High band but not fraud) across demographic sub-groups derived from fields that *are* in the data.

**Known Issue:** Policyholders aged 16–17 are flagged ~35% of the time vs. the 10% expected from a neutral model — roughly 3.5× over-representation — even though age is not a direct input. This is likely mediated through vehicle type and policy structure. With only 251 claims in this age group, the estimate is imprecise. **This must be investigated before any real-world deployment.**

---

## Features Used & Features Excluded

### 22 Input Features Used

| Group | Fields |
|---|---|
| **Timing** | Month, WeekOfMonth, DayOfWeek, MonthClaimed, WeekOfMonthClaimed, DayOfWeekClaimed |
| **Policy** | PolicyType, BasePolicy, Deductible, PastNumberOfClaims, NumberOfCars, AgentType, Days:Policy-Accident, Days:Policy-Claim, AddressChange-Claim |
| **Vehicle** | Make, VehicleCategory, VehiclePrice, AgeOfVehicle |
| **Accident** | AccidentArea, PoliceReportFiled, WitnessPresent |

### Features Intentionally Excluded

| Excluded Field | Reason |
|---|---|
| **Fault** | Decided during claim handling, not known at intake. Including it would inflate performance to indefensible levels (PR-AUC ~0.26 vs 0.14). |
| **Sex** | Protected attribute — excluded for fairness. |
| **Age / AgeOfPolicyHolder** | Protected attribute — excluded for fairness. |
| **MaritalStatus** | Protected attribute — excluded for fairness. |
| **NumberOfSuppliments** | Only known after claim payments are made — not available at intake. |
| **DriverRating** | No predictive signal in exploratory analysis. |
| **RepNumber** | Identifier — risk of model memorising agent-level patterns with no generalisation. |
| **PolicyNumber** | Unique identifier — would cause direct label leakage. |
| **Year** | All claims span 1994–1996; near-zero variance, no predictive value. |

---

## Dataset Description

| Property | Value |
|---|---|
| Total claims | 15,420 |
| Confirmed fraud labels | 923 (6.0%) |
| Date range | 1994–1996 |
| Geography | US auto insurance (simulated/historical) |
| Monetary amounts | **Not included** |
| Original source | Public GitHub repository `AA137/AutoInsuranceFraud`, attributed to Angoss |
| License | **Unverified** — suitable for academic/coursework only |

---

## Project Layout

```
Insurance-Claim-Risk-Triage/
│
├── app.py                   # Streamlit multi-page application (main entry point)
├── run.py                   # Launcher: runs `streamlit run app.py` on port 8501
├── requirements.txt         # All Python dependencies
├── README.md                # This file
│
├── app/
│   ├── main.py              # FastAPI backend (retained for API access & tests)
│   └── static/              # Legacy HTML/CSS/JS web UI
│       ├── index.html
│       ├── style.css
│       └── app.js
│
├── src/
│   └── train.py             # Full training pipeline: preprocessing, CV, eval, artifact export
│
├── models/
│   ├── model.joblib         # Trained sklearn Pipeline (preprocessor + GBM)
│   ├── meta.json            # Schema, quantiles, CV/holdout metrics, fairness audit, rules
│   ├── sample_batch.csv     # 400 holdout claims for demo (never seen during training)
│   └── template.csv         # Blank CSV template showing required column format
│
├── data/
│   └── claims_fraud_data.csv  # Full 15,420-claim dataset (training + holdout)
│
└── tests/
    └── test_api.py          # FastAPI integration tests (pytest)
```

---

## Installation & Running

**Requirements:** Python 3.10 or newer.

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Launch the Streamlit app

```bash
streamlit run app.py
# or equivalently:
python run.py
```

Open **http://localhost:8501** in your browser.

### 3. (Optional) Retrain the model

If you see scikit-learn version mismatch warnings, regenerate the model artifacts to match your installed version:

```bash
python src/train.py
# Takes approximately 1–2 minutes on a modern laptop.
```

This overwrites `models/model.joblib` and `models/meta.json`.

---

## Running Tests

The test suite covers the FastAPI backend (schema validation, scoring correctness, batch upload error handling, decisions round-trip):

```bash
python -m pytest -q
```

Expected output: **5 passed** (with sklearn version warnings — these are cosmetic, not failures).

---

## Known Limitations

1. **Outdated data.** Claims are from 1994–1996. Fraud patterns, vehicle types, policy structures, and investigation techniques have changed substantially in 30 years. Model performance on modern claims is unknown.

2. **Labels capture only detected fraud.** Claims that were fraudulent but not caught during the original investigation are labelled as honest. The model learns from past investigators' findings, not ground truth.

3. **No monetary amounts.** Claim size is a strong fraud signal in real-world systems. Its absence significantly limits this model's power.

4. **Single public dataset.** Performance estimates come from one dataset. Cross-dataset or cross-insurer generalisation is completely unknown.

5. **Unverified source and license.** The dataset was sourced from a public GitHub repository with an unverified provenance chain. It is appropriate for academic and coursework purposes only. Do not use for commercial applications.

6. **Age-group proxy discrimination.** Policyholders aged 16–17 are over-flagged ~3.5× relative to a fair benchmark. Root cause is unresolved. Must be investigated before any real deployment.

7. **Single-user SQLite database.** The decision log is a local SQLite file with no authentication, role management, or concurrency controls. Not suitable for multi-user production deployment.

8. **No network/API security.** The FastAPI backend has no authentication. It is designed for local use only.

---

## Roadmap

| Version | Planned Improvements |
|---|---|
| **v2** | Retrain on proprietary modern claims data with monetary amounts; improve PR-AUC target to >0.30 |
| **v2** | Add XGBoost / LightGBM comparison and model selection via CV |
| **v2** | Multi-user authentication and role-based access to decision log |
| **v3** | REST API with token-based auth for integration with claim management systems |
| **v3** | Automated retraining pipeline with drift detection |
| **v3** | LIME explanations as a secondary explainability method alongside SHAP |

---

## Authors

- **Buvanesh S** — ML Pipeline, Backend
- Infosys Springboard Internship 7.0, Milestone 1

---

*Decision support only. A high risk rank means look at this claim first. It does not constitute a finding of fraud, and this tool never rejects a claim.*
