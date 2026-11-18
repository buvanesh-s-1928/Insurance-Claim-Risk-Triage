"""Train the claim-risk model and export everything the app needs.

Run from the project root:  python src/train.py
Outputs go to models/.
"""
import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import (RepeatedStratifiedKFold, StratifiedKFold, cross_val_predict,
                                     cross_validate, train_test_split)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "models"
OUT.mkdir(exist_ok=True)
SEED = 42

# Columns kept out of the model, with the reason shown in the app.
EXCLUDED = {
    "PolicyNumber": "Row counter, identifies the claim but says nothing about it.",
    "RepNumber": "The adjuster who handled the claim, not a property of the claim.",
    "Fault": "May be decided during claim handling, so it may not exist at intake. Without it, scores are lower but defensible.",
    "NumberOfSuppliments": "Counts extra payments made after the claim, so it is known only later.",
    "DriverRating": "Fraud rate is the same at every level; it behaves like noise.",
    "Sex": "Protected attribute. Used only to check whether groups are flagged unevenly.",
    "Age": "Protected attribute, and 320 values are missing (stored as 0).",
    "AgeOfPolicyHolder": "Age group of the policyholder; same concern as Age.",
    "MaritalStatus": "Possible stand-in for protected attributes.",
    "Year": "Claim year. Fraud rate drifts over the three years, so the model should not learn it.",
}

LABELS = {
    "Month": "Month of accident", "WeekOfMonth": "Week of accident", "DayOfWeek": "Day of accident",
    "Make": "Vehicle make", "AccidentArea": "Accident area", "DayOfWeekClaimed": "Day claim reported",
    "MonthClaimed": "Month claim reported", "WeekOfMonthClaimed": "Week claim reported",
    "PolicyType": "Policy type", "VehicleCategory": "Vehicle category", "VehiclePrice": "Vehicle price",
    "Deductible": "Deductible", "Days:Policy-Accident": "Days from policy start to accident",
    "Days:Policy-Claim": "Days from policy start to claim", "PastNumberOfClaims": "Previous claims",
    "AgeOfVehicle": "Vehicle age", "PoliceReportFiled": "Police report filed",
    "WitnessPresent": "Witness present", "AgentType": "Agent type",
    "AddressChange-Claim": "Address change before claim", "NumberOfCars": "Cars on policy",
    "BasePolicy": "Base cover",
}

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
ORDER = {
    "Month": MONTHS, "MonthClaimed": MONTHS, "DayOfWeek": DAYS, "DayOfWeekClaimed": DAYS,
    "VehiclePrice": ["less than 20,000", "20,000 to 29,000", "30,000 to 39,000", "40,000 to 59,000",
                     "60,000 to 69,000", "more than 69,000"],
    "Days:Policy-Accident": ["none", "1 to 7", "8 to 15", "15 to 30", "more than 30"],
    "Days:Policy-Claim": ["none", "8 to 15", "15 to 30", "more than 30"],
    "PastNumberOfClaims": ["none", "1", "2 to 4", "more than 4"],
    "AgeOfVehicle": ["new", "2 years", "3 years", "4 years", "5 years", "6 years", "7 years", "more than 7"],
    "AddressChange-Claim": ["under 6 months", "1 year", "2 to 3 years", "4 to 8 years", "no change"],
    "NumberOfCars": ["1 vehicle", "2 vehicles", "3 to 4", "5 to 8", "more than 8"],
}

# Plain rules an investigator would recognise. Each is shown with how often it was fraud in the data.
RULES = [
    {"id": "early_accident", "title": "Accident within 15 days of the policy starting",
     "test": lambda r: r["Days:Policy-Accident"] in ("none", "1 to 7", "8 to 15")},
    {"id": "recent_move", "title": "Address changed within 3 years before the claim",
     "test": lambda r: r["AddressChange-Claim"] in ("under 6 months", "1 year", "2 to 3 years")},
]


def recall_at(y, s, share):
    k = max(1, int(round(share * len(y))))
    return float(y[np.argsort(-s, kind="stable")[:k]].sum() / y.sum())


def make_pipeline(num, cat):
    pre = ColumnTransformer(
        [("n", "passthrough", num),
         ("c", OneHotEncoder(handle_unknown="infrequent_if_exist", min_frequency=30, sparse_output=False), cat)])
    model = GradientBoostingClassifier(n_estimators=150, max_depth=3, learning_rate=0.05,
                                       subsample=0.8, min_samples_leaf=40, random_state=SEED)
    return Pipeline([("pre", pre), ("model", model)])


def main():
    raw = pd.read_csv(ROOT / "data" / "claims_fraud_data.csv")
    y_all = (raw["FraudFound"] == "Yes").astype(int).to_numpy()
    features = [c for c in raw.columns if c not in EXCLUDED and c != "FraudFound"]
    X_all = raw[features]
    num = X_all.select_dtypes("number").columns.tolist()
    cat = [c for c in features if c not in num]

    idx = np.arange(len(raw))
    tr_i, te_i = train_test_split(idx, test_size=0.2, stratify=y_all, random_state=SEED)
    Xtr, Xte, ytr, yte = X_all.iloc[tr_i], X_all.iloc[te_i], y_all[tr_i], y_all[te_i]

    # 1) Out-of-fold scores on the training split: used for band thresholds, capacity curve, calibration, fairness.
    oof = cross_val_predict(make_pipeline(num, cat), Xtr, ytr,
                            cv=StratifiedKFold(5, shuffle=True, random_state=SEED), method="predict_proba")[:, 1]

    # 2) Repeated CV ranges, a dummy baseline, and a label-shuffle control.
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=2, random_state=SEED)
    def scorer_recall10(est, X, y):
        return recall_at(np.asarray(y), est.predict_proba(X)[:, 1], 0.10)
    scoring = {"pr_auc": "average_precision", "roc_auc": "roc_auc", "recall10": scorer_recall10}
    res = cross_validate(make_pipeline(num, cat), Xtr, ytr, cv=cv, scoring=scoring, n_jobs=-1)
    rng = np.random.RandomState(SEED)
    shuf = cross_validate(make_pipeline(num, cat), Xtr, rng.permutation(ytr), cv=cv, scoring=scoring, n_jobs=-1)
    dummy = cross_validate(Pipeline([("pre", ColumnTransformer([("n", "passthrough", num)])),
                                     ("m", DummyClassifier(strategy="prior"))]),
                           Xtr, ytr, cv=cv, scoring=scoring, n_jobs=-1)
    def ms(r, k):
        return {"mean": float(np.mean(r[k])), "sd": float(np.std(r[k]))}
    cv_summary = {
        "model": {k: ms(res, "test_" + k) for k in ("pr_auc", "roc_auc", "recall10")},
        "dummy": {k: ms(dummy, "test_" + k) for k in ("pr_auc", "roc_auc", "recall10")},
        "shuffled": {k: ms(shuf, "test_" + k) for k in ("pr_auc", "roc_auc", "recall10")},
    }

    # 3) Final model on the training split only; the held-out split stays unseen until now.
    pipe = make_pipeline(num, cat).fit(Xtr, ytr)
    s_te = pipe.predict_proba(Xte)[:, 1]
    boot = np.random.RandomState(SEED)
    pr, roc, r10, r20 = [], [], [], []
    for _ in range(1000):
        b = boot.randint(0, len(yte), len(yte))
        if yte[b].sum() == 0:
            continue
        pr.append(average_precision_score(yte[b], s_te[b]))
        roc.append(roc_auc_score(yte[b], s_te[b]))
        r10.append(recall_at(yte[b], s_te[b], 0.10))
        r20.append(recall_at(yte[b], s_te[b], 0.20))
    def ci(v):
        return [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]
    holdout = {
        "claims": int(len(yte)), "frauds": int(yte.sum()),
        "pr_auc": float(average_precision_score(yte, s_te)), "pr_auc_ci": ci(pr),
        "roc_auc": float(roc_auc_score(yte, s_te)), "roc_auc_ci": ci(roc),
        "recall10": recall_at(yte, s_te, 0.10), "recall10_ci": ci(r10),
        "recall20": recall_at(yte, s_te, 0.20), "recall20_ci": ci(r20),
        "base_rate": float(yte.mean()),
    }

    # 4) Review-capacity curve from out-of-fold scores, with a bootstrap range.
    shares = [round(x, 2) for x in np.arange(0.05, 0.505, 0.05)]
    curve = []
    boot = np.random.RandomState(SEED + 1)
    for sh in shares:
        vals = []
        for _ in range(300):
            b = boot.randint(0, len(ytr), len(ytr))
            vals.append(recall_at(ytr[b], oof[b], sh))
        curve.append({"share": sh, "recall": recall_at(ytr, oof, sh), "lo": float(np.percentile(vals, 2.5)),
                      "hi": float(np.percentile(vals, 97.5))})

    # 5) Reference score quantiles: a claim's band comes from where its score falls in this distribution.
    quantiles = [float(np.quantile(oof, q / 100)) for q in range(0, 101)]

    # 6) Calibration (reliability) by score decile.
    order = np.argsort(oof)
    calib = []
    for chunk in np.array_split(order, 10):
        calib.append({"predicted": float(oof[chunk].mean()), "observed": float(ytr[chunk].mean()), "n": int(len(chunk))})

    # 7) Fairness check: who lands in the top 10% (High), using out-of-fold scores.
    thr_high = quantiles[90]
    flagged = oof >= thr_high
    fair = []
    train_raw = raw.iloc[tr_i].reset_index(drop=True)
    for col, nice in (("Sex", "Sex"), ("MaritalStatus", "Marital status"), ("AgeOfPolicyHolder", "Policyholder age group")):
        for g, sub in train_raw.groupby(col):
            m = (train_raw[col] == g).to_numpy()
            n = int(m.sum())
            if n < 100:
                continue
            neg = m & (ytr == 0)
            fair.append({"attribute": nice, "group": str(g), "claims": n,
                         "flag_rate": float(flagged[m].mean()),
                         "fraud_rate": float(ytr[m].mean()),
                         "false_flag_rate": float(flagged[neg].mean()) if neg.sum() else None})

    # 8) Rule statistics from the full data.
    rule_stats = []
    for r in RULES:
        hit = raw.apply(r["test"], axis=1).to_numpy()
        rule_stats.append({"id": r["id"], "title": r["title"], "claims": int(hit.sum()),
                           "fraud_rate": float(y_all[hit].mean()) if hit.sum() else None,
                           "base_rate": float(y_all.mean())})

    # 9) Schema for the form and for CSV validation.
    schema = []
    for c in features:
        if c in num:
            vals = sorted(int(v) for v in raw[c].unique())
            schema.append({"name": c, "label": LABELS[c], "type": "num", "options": vals})
        else:
            opts = ORDER.get(c)
            present = raw[c].value_counts().index.tolist()
            if opts is None:
                opts = present
            else:
                opts = [o for o in opts if o in present] + [o for o in present if o not in opts]
            schema.append({"name": c, "label": LABELS[c], "type": "cat", "options": opts})

    # 10) Sample batch of unseen claims for the demo.
    samp = raw.iloc[te_i].sample(400, random_state=SEED).sort_index()
    sample = samp[features + ["FraudFound"]].copy()
    sample.insert(0, "ClaimID", ["C-" + str(int(p)).zfill(5) for p in samp["PolicyNumber"]])
    sample.to_csv(OUT / "sample_batch.csv", index=False)
    tmpl = raw.iloc[[te_i[0]]][features].copy()
    tmpl.insert(0, "ClaimID", "C-00001")
    tmpl.to_csv(OUT / "template.csv", index=False)

    meta = {
        "features": features, "labels": LABELS, "schema": schema,
        "excluded": [{"column": k, "reason": v} for k, v in EXCLUDED.items()],
        "base_rate": float(y_all.mean()), "dataset": {"claims": int(len(raw)), "frauds": int(y_all.sum()),
                                                      "train": int(len(ytr)), "holdout": int(len(yte))},
        "quantiles": quantiles, "capacity_curve": curve, "calibration": calib, "cv": cv_summary,
        "holdout": holdout, "fairness": fair, "rules": rule_stats,
        "bands": {"high_share": 0.10, "medium_share": 0.30},
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))
    joblib.dump(pipe, OUT / "model.joblib")

    print("features", len(features), "| train", len(ytr), "holdout", len(yte))
    print("CV model   ", {k: round(v["mean"], 3) for k, v in cv_summary["model"].items()})
    print("CV dummy   ", {k: round(v["mean"], 3) for k, v in cv_summary["dummy"].items()})
    print("CV shuffled", {k: round(v["mean"], 3) for k, v in cv_summary["shuffled"].items()})
    print("Holdout", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in holdout.items() if "ci" not in k})
    print("Holdout CI recall10", [round(x, 3) for x in holdout["recall10_ci"]], "pr", [round(x, 3) for x in holdout["pr_auc_ci"]])
    print("OOF mean score", round(float(oof.mean()), 4), "base", round(float(ytr.mean()), 4))
    print("Calibration", [(round(c["predicted"], 3), round(c["observed"], 3)) for c in calib])
    print("Rules", rule_stats)
    print("Fairness"); [print("  ", f) for f in fair]


if __name__ == "__main__":
    main()
