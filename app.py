"""Insurance Claim Risk Triage - Streamlit Application

A decision support tool for insurance claim investigators that ranks claims by fraud risk,
provides SHAP explainability, flags heuristic rules, and logs investigator decisions.

Run with:
    streamlit run app.py
or:
    python run.py
"""
import io
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import shap
import streamlit as st

# -----------------------------------------------------------------------------
# Configuration & Paths
# -----------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "decisions.db"

st.set_page_config(
    page_title="Insurance Claim Risk Triage",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# -----------------------------------------------------------------------------
# Custom Styling (Skeuomorphic depth + Swiss minimalism + Metallic touches)
# -----------------------------------------------------------------------------
st.markdown(
    """
    <style>
    /* Global Typography & Palette */
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    code, pre {
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* Tactile Cards */
    .triage-card {
        background: #ffffff;
        border: 1px solid #d4dce8;
        border-radius: 10px;
        padding: 20px 24px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05), inset 0 1px 0 #ffffff;
        margin-bottom: 20px;
    }

    .triage-metric {
        background: linear-gradient(180deg, #ffffff 0%, #f6f8fb 100%);
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 16px 20px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05), inset 0 1px 0 #ffffff;
    }

    /* Risk Badges */
    .badge-high {
        background-color: #fef2f2;
        color: #991b1b;
        border: 1px solid #f87171;
        padding: 3px 10px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 12.5px;
        display: inline-block;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    .badge-med {
        background-color: #fffbeb;
        color: #92400e;
        border: 1px solid #fbbf24;
        padding: 3px 10px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 12.5px;
        display: inline-block;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    .badge-low {
        background-color: #f0fdf4;
        color: #065f46;
        border: 1px solid #34d399;
        padding: 3px 10px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 12.5px;
        display: inline-block;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }

    /* Notice callout */
    .v1-notice {
        background-color: #fcf9ee;
        border-left: 4px solid #b38b3f;
        padding: 14px 18px;
        border-radius: 0 8px 8px 0;
        color: #715116;
        font-size: 13.5px;
        line-height: 1.55;
        margin-bottom: 22px;
        box-shadow: 0 1px 3px rgba(179, 139, 63, 0.08), inset 0 1px 0 #fff;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# -----------------------------------------------------------------------------
# Model & Metadata Loading (Cached)
# -----------------------------------------------------------------------------
@st.cache_resource
def load_triage_pipeline():
    pipe = joblib.load(MODELS_DIR / "model.joblib")
    meta = json.loads((MODELS_DIR / "meta.json").read_text())
    pre = pipe.named_steps["pre"]
    model = pipe.named_steps["model"]
    explainer = shap.TreeExplainer(model)

    features = meta["features"]
    schema = {f["name"]: f for f in meta["schema"]}
    numeric = [f["name"] for f in meta["schema"] if f["type"] == "num"]
    quantiles = np.array(meta["quantiles"])
    base_rate = meta["base_rate"]

    out_names = list(pre.get_feature_names_out())
    out_to_feature = []
    for name in out_names:
        stem = name.split("__", 1)[1]
        owner = next(
            (f for f in sorted(features, key=len, reverse=True) if stem == f or stem.startswith(f + "_")),
            None,
        )
        out_to_feature.append(owner)

    feature_index = {f: [i for i, o in enumerate(out_to_feature) if o == f] for f in features}

    raw_path = DATA_DIR / "claims_fraud_data.csv"
    if raw_path.exists():
        raw_df = pd.read_csv(raw_path)
        defaults = {
            f: (int(raw_df[f].mode().iloc[0]) if f in numeric else str(raw_df[f].mode().iloc[0]))
            for f in features
        }
    else:
        defaults = {f: schema[f]["options"][0] for f in features}

    rules = {
        "early_accident": lambda r: r["Days:Policy-Accident"] in ("none", "1 to 7", "8 to 15"),
        "recent_move": lambda r: r["AddressChange-Claim"] in ("under 6 months", "1 year", "2 to 3 years"),
    }
    rule_info = {r["id"]: r for r in meta["rules"]}

    return {
        "pipe": pipe,
        "pre": pre,
        "model": model,
        "explainer": explainer,
        "meta": meta,
        "features": features,
        "schema": schema,
        "numeric": numeric,
        "quantiles": quantiles,
        "base_rate": base_rate,
        "feature_index": feature_index,
        "defaults": defaults,
        "rules": rules,
        "rule_info": rule_info,
    }


ENGINE = load_triage_pipeline()


# -----------------------------------------------------------------------------
# Database Operations
# -----------------------------------------------------------------------------
def get_db_connection():
    DATA_DIR.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute(
        """CREATE TABLE IF NOT EXISTS decisions (
            claim_id TEXT PRIMARY KEY,
            decision TEXT NOT NULL,
            note TEXT,
            score REAL,
            updated TEXT NOT NULL
        )"""
    )
    return con


def load_decisions_map():
    with get_db_connection() as con:
        rows = con.execute("SELECT claim_id, decision, note, score, updated FROM decisions").fetchall()
    return {r[0]: {"decision": r[1], "note": r[2], "score": r[3], "updated": r[4]} for r in rows}


def save_claim_decision(claim_id: str, decision: str, note: str = "", score: float | None = None):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with get_db_connection() as con:
        con.execute(
            """INSERT INTO decisions(claim_id, decision, note, score, updated) VALUES (?,?,?,?,?)
               ON CONFLICT(claim_id) DO UPDATE SET decision=excluded.decision, note=excluded.note,
               score=excluded.score, updated=excluded.updated""",
            (claim_id, decision, note[:1000], score, now),
        )


def delete_claim_decision(claim_id: str):
    with get_db_connection() as con:
        con.execute("DELETE FROM decisions WHERE claim_id = ?", (claim_id,))


# -----------------------------------------------------------------------------
# Scoring & Triage Core
# -----------------------------------------------------------------------------
def top_share(scores):
    pct = np.interp(scores, ENGINE["quantiles"], np.linspace(0, 100, len(ENGINE["quantiles"])))
    return 1 - pct / 100


def clean_frame(df):
    problems = {"missing_columns": [], "skipped": [], "unseen_values": {}}
    features = ENGINE["features"]
    schema = ENGINE["schema"]
    numeric = ENGINE["numeric"]

    missing = [c for c in features if c not in df.columns]
    if missing:
        problems["missing_columns"] = missing
        return None, problems

    df = df.copy()
    if "ClaimID" not in df.columns:
        df.insert(0, "ClaimID", [f"C-{i + 1:04d}" for i in range(len(df))])
    df["ClaimID"] = df["ClaimID"].astype(str)

    keep = np.ones(len(df), dtype=bool)
    for c in features:
        s = df[c]
        if c in numeric:
            s = pd.to_numeric(s, errors="coerce")
            df[c] = s
        else:
            df[c] = s.astype("object").where(s.notna(), None)
            df[c] = df[c].map(lambda v: v.strip() if isinstance(v, str) else v)

        bad = s.isna().to_numpy() if c in numeric else df[c].isna().to_numpy()
        for i in np.where(bad & keep)[0]:
            problems["skipped"].append(
                {"claim_id": df["ClaimID"].iloc[i], "reason": f"{schema[c]['label']} is missing or invalid"}
            )
        keep &= ~bad

        known = set(map(str, schema[c]["options"]))
        col = df.loc[keep, c]
        unseen = (
            col.map(lambda v: str(int(v)) if float(v).is_integer() else str(v)) if c in numeric else col
        ).astype(str)
        unseen = unseen[~unseen.isin(known)]
        if len(unseen):
            problems["unseen_values"][schema[c]["label"]] = sorted(unseen.unique().tolist())[:5]

    return df[keep].reset_index(drop=True), problems


def score_and_explain(frame):
    X = frame[ENGINE["features"]]
    scores = ENGINE["pipe"].predict_proba(X)[:, 1]
    enc = ENGINE["pre"].transform(X)
    sv = ENGINE["explainer"].shap_values(enc)
    sv = sv[1] if isinstance(sv, list) else sv
    agg = np.column_stack([sv[:, ENGINE["feature_index"][f]].sum(axis=1) for f in ENGINE["features"]])
    return scores, agg


def build_triage_records(frame, scores, agg, outcomes=None):
    shares = top_share(scores)
    features = ENGINE["features"]
    schema = ENGINE["schema"]
    numeric = ENGINE["numeric"]
    rules = ENGINE["rules"]
    rule_info = ENGINE["rule_info"]

    rows = []
    for i in range(len(frame)):
        rec = frame.iloc[i]
        order = np.argsort(-np.abs(agg[i]))[:6]
        reasons = [
            {
                "field": features[j],
                "label": schema[features[j]]["label"],
                "value": str(rec[features[j]]),
                "effect": float(agg[i][j]),
                "direction": "raises" if agg[i][j] > 0 else "lowers",
            }
            for j in order
            if abs(agg[i][j]) > 1e-4
        ]
        flags = []
        for rid, test in rules.items():
            if test(rec):
                info = rule_info[rid]
                flags.append(
                    {
                        "id": rid,
                        "title": info["title"],
                        "claims": info["claims"],
                        "fraud_rate": info["fraud_rate"],
                    }
                )

        row = {
            "id": str(rec["ClaimID"]),
            "score": float(scores[i]),
            "top_share": float(shares[i]),
            "reasons": reasons,
            "flags": flags,
            "fields": {f: (int(rec[f]) if f in numeric else str(rec[f])) for f in features},
        }
        if outcomes is not None:
            row["outcome"] = outcomes[i]
        rows.append(row)

    rows.sort(key=lambda r: -r["score"])
    for k, r in enumerate(rows, 1):
        r["rank"] = k
    return rows


def expected_catch(c_share, capacity_curve):
    pts = [{"share": 0, "recall": 0, "lo": 0, "hi": 0}, *capacity_curve]
    for i in range(1, len(pts)):
        if c_share <= pts[i]["share"]:
            a, b = pts[i - 1], pts[i]
            t = (c_share - a["share"]) / (b["share"] - a["share"])
            return {
                "recall": a["recall"] + t * (b["recall"] - a["recall"]),
                "lo": a["lo"] + t * (b["lo"] - a["lo"]),
                "hi": a["hi"] + t * (b["hi"] - a["hi"]),
            }
    return pts[-1]


# -----------------------------------------------------------------------------
# Sidebar Navigation & Capacity Control
# -----------------------------------------------------------------------------
with st.sidebar:
    st.markdown(
        """
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="background:#0e1726;padding:10px;border-radius:50%;border:1px solid #d4b25a;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
                🛡️
            </div>
            <div>
                <h2 style="margin:0;font-size:18px;font-weight:700;color:#0e1726;">Claim Triage</h2>
                <span style="font-size:12px;color:#64748b;">Decision Support Platform</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    page = st.radio(
        "Navigation",
        ["Claims Queue", "Assess a Claim", "Model & Limitations", "Decisions Log"],
        label_visibility="collapsed",
    )

    st.markdown("---")
    st.markdown("### Triage Controls")
    capacity_pct = st.slider(
        "Review Capacity (% of claims)",
        min_value=5,
        max_value=25,
        value=10,
        step=1,
        help="Adjust the percentage of claims designated as High risk based on team review capacity.",
    )
    capacity_val = capacity_pct / 100.0

    st.markdown("---")
    st.markdown(
        """
        <div class="v1-notice">
            <strong>v1 Prototype (Public Data)</strong><br>
            Trained on public historical auto claims (1994–1996). Because publicly available datasets have known quality limitations, this model is a demonstration decision-support tool. It will be upgraded with proprietary data in future iterations.
        </div>
        """,
        unsafe_allow_html=True,
    )


# Helper function to classify bands
def get_band(top_s, cap=capacity_val):
    if top_s <= cap:
        return "High"
    elif top_s <= 3 * cap:
        return "Medium"
    return "Low"


# =============================================================================
# PAGE 1: CLAIMS QUEUE
# =============================================================================
if page == "Claims Queue":
    st.title("Claims Queue")
    st.markdown(
        "Ranked incoming claims sorted by predicted fraud risk. "
        "A high rank means **review this claim first**; it does not constitute a finding of fraud."
    )

    col_up, col_samp, col_temp = st.columns([2, 1, 1])
    with col_up:
        uploaded_file = st.file_uploader("Upload Claims CSV", type=["csv"], help="Upload a CSV with the 22 required claim fields.")
    with col_samp:
        st.write("")
        st.write("")
        load_sample_btn = st.button("📁 Load 400 Sample Claims", use_container_width=True)
    with col_temp:
        st.write("")
        st.write("")
        with open(MODELS_DIR / "template.csv", "rb") as f:
            st.download_button(
                "📥 CSV Template",
                data=f,
                file_name="claims_template.csv",
                mime="text/csv",
                use_container_width=True,
            )

    # Initialize batch state
    if "claims_data" not in st.session_state:
        st.session_state.claims_data = None

    if load_sample_btn:
        sample_path = MODELS_DIR / "sample_batch.csv"
        df_sample = pd.read_csv(sample_path)
        frame, problems = clean_frame(df_sample)
        outcomes = frame["FraudFound"].astype(str).tolist() if "FraudFound" in frame.columns else None
        scores, agg = score_and_explain(frame)
        st.session_state.claims_data = {
            "records": build_triage_records(frame, scores, agg, outcomes),
            "problems": problems,
            "has_outcomes": outcomes is not None,
        }
        st.success("Loaded 400 sample historical claims successfully!")

    if uploaded_file is not None:
        try:
            df_up = pd.read_csv(uploaded_file)
            frame, problems = clean_frame(df_up)
            if frame is None:
                st.error(f"Missing required columns: {', '.join(problems['missing_columns'])}")
            elif len(frame) == 0:
                st.error("No valid rows could be processed. Please check missing/corrupt values.")
            else:
                outcomes = frame["FraudFound"].astype(str).tolist() if "FraudFound" in frame.columns else None
                scores, agg = score_and_explain(frame)
                st.session_state.claims_data = {
                    "records": build_triage_records(frame, scores, agg, outcomes),
                    "problems": problems,
                    "has_outcomes": outcomes is not None,
                }
                st.success(f"Successfully processed {len(frame):,} claims!")
        except Exception as e:
            st.error(f"Error processing CSV: {e}")

    # Display Queue
    if st.session_state.claims_data is not None:
        batch = st.session_state.claims_data
        records = batch["records"]
        decisions_map = load_decisions_map()

        for r in records:
            r["band"] = get_band(r["top_share"], capacity_val)
            r["decision"] = decisions_map.get(r["id"], {}).get("decision", "")

        n_total = len(records)
        n_high = sum(1 for r in records if r["band"] == "High")
        n_med = sum(1 for r in records if r["band"] == "Medium")
        n_low = sum(1 for r in records if r["band"] == "Low")

        recall_est = expected_catch(capacity_val, ENGINE["meta"]["capacity_curve"])

        # Metric Cards
        st.markdown("---")
        m1, m2, m3, m4 = st.columns(4)
        with m1:
            st.metric("Total Claims in Batch", f"{n_total:,}")
        with m2:
            st.metric("High-Risk Queue", f"{n_high:,}", f"{n_high/n_total:.1%}")
        with m3:
            st.metric(
                "Estimated Fraud Catch",
                f"{recall_est['recall']:.0%}",
                f"Range: {recall_est['lo']:.0%}–{recall_est['hi']:.0%}",
            )
        with m4:
            st.metric("Random Review Baseline", f"{capacity_pct}%")

        # Spectrum Distribution Chart
        st.markdown("#### Batch Risk Spectrum (Highest Score First)")
        scores_list = [r["score"] for r in records]
        bands_list = [r["band"] for r in records]
        ranks_list = [r["rank"] for r in records]
        color_map = {"High": "#b91c1c", "Medium": "#d97706", "Low": "#94a3b8"}

        fig_spectrum = go.Figure()
        fig_spectrum.add_trace(
            go.Bar(
                x=ranks_list,
                y=scores_list,
                marker_color=[color_map[b] for b in bands_list],
                hovertemplate="<b>Rank %{x}</b><br>Score: %{y:.1%}<extra></extra>",
            )
        )
        fig_spectrum.add_vline(
            x=n_high,
            line_dash="dash",
            line_color="#b91c1c",
            annotation_text=f"High Threshold (Top {capacity_pct}%)",
            annotation_position="top right",
        )
        fig_spectrum.update_layout(
            height=200,
            margin=dict(l=20, r=20, t=20, b=20),
            xaxis=dict(title="Claims (Ranked)", showgrid=False),
            yaxis=dict(title="Score", tickformat=".0%", showgrid=True, gridcolor="#f1f5f9"),
            plot_bgcolor="#ffffff",
            paper_bgcolor="#ffffff",
        )
        st.plotly_chart(fig_spectrum, use_container_width=True)

        # Filters & Search
        st.markdown("---")
        f_col1, f_col2, f_col3 = st.columns([2, 2, 2])
        with f_col1:
            band_filter = st.selectbox("Filter by Risk Band", ["All", "High", "Medium", "Low"])
        with f_col2:
            query_id = st.text_input("Find Claim ID", placeholder="Search by ID (e.g. C-0123)")
        with f_col3:
            show_outcomes = False
            if batch["has_outcomes"]:
                show_outcomes = st.checkbox("Show Known Historical Outcomes (Demo)")

        # Filter records
        filtered = [
            r for r in records
            if (band_filter == "All" or r["band"] == band_filter)
            and (not query_id or query_id.lower() in r["id"].lower())
        ]

        st.caption(f"Showing {len(filtered):,} of {n_total:,} claims")

        # Table Display
        display_data = []
        for r in filtered:
            row_dict = {
                "Rank": r["rank"],
                "Claim ID": r["id"],
                "Risk Score": f"{r['score']:.1%}",
                "Band": r["band"],
                "Top Driver": f"{r['reasons'][0]['label']}: {r['reasons'][0]['value']}" if r["reasons"] else "None",
                "Rule Flags": ", ".join([f["title"] for f in r["flags"]]) or "None",
                "Decision": r["decision"] or "Pending",
            }
            if show_outcomes and "outcome" in r:
                row_dict["Known Fraud"] = "Yes" if r["outcome"] == "Yes" else "No"
            display_data.append(row_dict)

        df_display = pd.DataFrame(display_data)
        st.dataframe(df_display, use_container_width=True, hide_index=True)

        # Claim Detail Dossier
        st.markdown("### Inspect Claim Dossier")
        claim_ids = [r["id"] for r in filtered]
        if claim_ids:
            selected_claim_id = st.selectbox("Select Claim ID to Inspect", claim_ids)
            selected_claim = next(r for r in records if r["id"] == selected_claim_id)

            d_col1, d_col2 = st.columns([1, 1])
            with d_col1:
                st.markdown(f"#### Claim {selected_claim['id']} (Rank #{selected_claim['rank']})")
                band = selected_claim["band"]
                badge_class = "badge-high" if band == "High" else "badge-med" if band == "Medium" else "badge-low"
                st.markdown(
                    f"""
                    <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:12px;">
                        <span style="font-size:36px;font-weight:700;color:#0e1726;">{selected_claim['score']:.1%}</span>
                        <span class="{badge_class}">● {band} Risk</span>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                st.write(
                    f"This claim scores in **the top {max(1, round(selected_claim['top_share'] * 100))}%** of comparable historical claims. "
                    f"The baseline fraud rate is **{ENGINE['base_rate']:.1%}**."
                )

                # Heuristic Rule Checks
                if selected_claim["flags"]:
                    st.warning("⚠️ **Heuristic Checks Triggered:**")
                    for flg in selected_claim["flags"]:
                        st.markdown(
                            f"- **{flg['title']}**: Historical fraud rate on similar claims was **{flg['fraud_rate']:.0%}** (vs. {ENGINE['base_rate']:.0%} baseline)."
                        )
                else:
                    st.info("ℹ️ No simple heuristic flags triggered (accident occurred >15 days from start, address unchanged >3 yrs).")

            with d_col2:
                # SHAP Feature Attribution Chart
                st.markdown("#### Top Factors Influencing Score")
                if selected_claim["reasons"]:
                    feat_names = [f"{r['label']} ({r['value']})" for r in selected_claim["reasons"]]
                    effects = [r["effect"] for r in selected_claim["reasons"]]
                    colors = ["#b91c1c" if e > 0 else "#047857" for e in effects]

                    fig_shap = go.Figure(
                        go.Bar(
                            x=effects,
                            y=feat_names,
                            orientation="h",
                            marker_color=colors,
                            hovertemplate="%{y}<br>SHAP Effect: %{x:+.4f}<extra></extra>",
                        )
                    )
                    fig_shap.update_layout(
                        height=240,
                        margin=dict(l=10, r=10, t=10, b=10),
                        xaxis=dict(title="Contribution to Score (SHAP)", zeroline=True, zerolinecolor="#64748b"),
                        yaxis=dict(autorange="reversed"),
                        plot_bgcolor="#ffffff",
                        paper_bgcolor="#ffffff",
                    )
                    st.plotly_chart(fig_shap, use_container_width=True)
                else:
                    st.write("No strong dominant factor.")

            # Decision Form
            st.markdown("#### Record Investigator Decision")
            dec_entry = decisions_map.get(selected_claim["id"], {})
            current_choice = dec_entry.get("decision", "Under review")
            current_note = dec_entry.get("note", "")

            with st.form(key=f"dec_form_{selected_claim['id']}"):
                dec_col1, dec_col2 = st.columns([1, 2])
                with dec_col1:
                    dec_choice = st.radio(
                        "Decision",
                        ["Under review", "Cleared", "Escalated"],
                        index=["Under review", "Cleared", "Escalated"].index(current_choice)
                        if current_choice in ["Under review", "Cleared", "Escalated"]
                        else 0,
                    )
                with dec_col2:
                    dec_note = st.text_area("Investigator Notes", value=current_note, max_chars=1000)

                submitted = st.form_submit_button("💾 Save Decision", use_container_width=True)
                if submitted:
                    save_claim_decision(selected_claim["id"], dec_choice, dec_note, selected_claim["score"])
                    st.success(f"Saved decision for Claim {selected_claim['id']} as '{dec_choice}'!")
                    st.rerun()

            # Expandable Full Details
            with st.expander("📋 View Complete Claim Record (All 22 Fields)"):
                col_f1, col_f2 = st.columns(2)
                fields = selected_claim["fields"]
                items = list(fields.items())
                half = len(items) // 2
                with col_f1:
                    for k, v in items[:half]:
                        st.markdown(f"**{ENGINE['schema'][k]['label']}**: `{v}`")
                with col_f2:
                    for k, v in items[half:]:
                        st.markdown(f"**{ENGINE['schema'][k]['label']}**: `{v}`")

        # Export Ranked CSV
        st.markdown("---")
        csv_rows = []
        for r in records:
            csv_rows.append(
                {
                    "Rank": r["rank"],
                    "ClaimID": r["id"],
                    "Score": r["score"],
                    "Band": r["band"],
                    "MainReasons": "; ".join([f"{x['label']}: {x['value']}" for x in r["reasons"][:3]]),
                    "RuleFlags": "; ".join([f["title"] for f in r["flags"]]),
                    "Decision": r["decision"],
                }
            )
        csv_buffer = io.StringIO()
        pd.DataFrame(csv_rows).to_csv(csv_buffer, index=False)
        st.download_button(
            "📥 Download Full Ranked CSV",
            data=csv_buffer.getvalue(),
            file_name="ranked_claims_output.csv",
            mime="text/csv",
        )
    else:
        st.info("👆 Please upload a claims CSV or click 'Load 400 Sample Claims' above to inspect the triage queue.")


# =============================================================================
# PAGE 2: ASSESS A CLAIM
# =============================================================================
elif page == "Assess a Claim":
    st.title("Assess a Single Claim")
    st.markdown("Enter claim attributes known at intake to generate an immediate risk score and explanation.")

    c_b1, c_b2, _ = st.columns([1, 1, 2])
    with c_b1:
        if st.button("⚡ Fill with High-Scoring Sample Claim"):
            sample_df = pd.read_csv(MODELS_DIR / "sample_batch.csv")
            st.session_state.assess_inputs = sample_df.iloc[0].to_dict()
            st.rerun()
    with c_b2:
        if st.button("🔄 Reset to Default Values"):
            st.session_state.assess_inputs = dict(ENGINE["defaults"])
            st.rerun()

    if "assess_inputs" not in st.session_state:
        st.session_state.assess_inputs = dict(ENGINE["defaults"])

    curr_vals = st.session_state.assess_inputs

    # Form Groups
    groups = [
        ("Policy Details", ["PolicyType", "BasePolicy", "Deductible", "PastNumberOfClaims", "NumberOfCars", "AgentType", "Days:Policy-Accident", "Days:Policy-Claim", "AddressChange-Claim"]),
        ("Vehicle Details", ["Make", "VehicleCategory", "VehiclePrice", "AgeOfVehicle"]),
        ("Accident Details", ["Month", "WeekOfMonth", "DayOfWeek", "AccidentArea", "PoliceReportFiled", "WitnessPresent"]),
        ("Reporting Details", ["MonthClaimed", "WeekOfMonthClaimed", "DayOfWeekClaimed"]),
    ]

    form_cols = st.columns(2)
    new_inputs = {}

    for idx, (grp_name, grp_fields) in enumerate(groups):
        target_col = form_cols[idx % 2]
        with target_col:
            with st.expander(f"📑 {grp_name}", expanded=True):
                for f_name in grp_fields:
                    f_info = ENGINE["schema"][f_name]
                    opts = f_info["options"]
                    val = curr_vals.get(f_name, opts[0])
                    # Ensure value is valid in options
                    if val not in opts:
                        val = opts[0]
                    chosen = st.selectbox(
                        f_info["label"],
                        options=opts,
                        index=opts.index(val),
                        key=f"assess_{f_name}",
                    )
                    new_inputs[f_name] = chosen

    # Run Assessment
    claim_df = pd.DataFrame([new_inputs])
    frame, _ = clean_frame(claim_df)
    scores, agg = score_and_explain(frame)
    single_record = build_triage_records(frame, scores, agg)[0]

    st.markdown("---")
    st.markdown("### Risk Assessment Result")
    r_col1, r_col2 = st.columns([1, 1])

    with r_col1:
        s_score = single_record["score"]
        s_band = get_band(single_record["top_share"], capacity_val)
        badge_cls = "badge-high" if s_band == "High" else "badge-med" if s_band == "Medium" else "badge-low"

        st.markdown(
            f"""
            <div class="triage-card">
                <span style="font-size:14px;color:#64748b;font-weight:600;">ESTIMATED FRAUD PROBABILITY</span>
                <div style="display:flex;align-items:baseline;gap:16px;margin:10px 0;">
                    <span style="font-size:48px;font-weight:700;color:#0e1726;">{s_score:.1%}</span>
                    <span class="{badge_cls}">● {s_band} Risk</span>
                </div>
                <p style="color:#475569;font-size:14px;line-height:1.5;">
                    This claim is in <strong>the top {max(1, round(single_record['top_share']*100))}%</strong> of historical claims.
                    Standard claim population base rate is <strong>{ENGINE['base_rate']:.1%}</strong>.
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        if single_record["flags"]:
            st.warning("⚠️ **Heuristic Rule Flags:**")
            for flg in single_record["flags"]:
                st.markdown(f"- **{flg['title']}** (Past cohort fraud rate: **{flg['fraud_rate']:.0%}**)")

    with r_col2:
        st.markdown("#### Primary Drivers (SHAP)")
        if single_record["reasons"]:
            reasons = single_record["reasons"]
            feat_names = [f"{r['label']}: {r['value']}" for r in reasons]
            effects = [r["effect"] for r in reasons]
            colors = ["#b91c1c" if e > 0 else "#047857" for e in effects]

            fig_bar = go.Figure(
                go.Bar(
                    x=effects,
                    y=feat_names,
                    orientation="h",
                    marker_color=colors,
                    hovertemplate="%{y}<br>SHAP Effect: %{x:+.4f}<extra></extra>",
                )
            )
            fig_bar.update_layout(
                height=260,
                margin=dict(l=10, r=10, t=10, b=10),
                xaxis=dict(title="Score Impact", zeroline=True, zerolinecolor="#64748b"),
                yaxis=dict(autorange="reversed"),
                plot_bgcolor="#ffffff",
                paper_bgcolor="#ffffff",
            )
            st.plotly_chart(fig_bar, use_container_width=True)


# =============================================================================
# PAGE 3: MODEL & LIMITATIONS
# =============================================================================
elif page == "Model & Limitations":
    st.title("Model & Limitations")

    st.markdown(
        """
        <div class="v1-notice">
            <h4 style="margin:0 0 6px;color:#8a641d;">Important Note on Model Reliability (v1 Release)</h4>
            This model was trained on historical public auto insurance claims data from 1994 to 1996.
            Because public datasets in fraud detection have significant limitations (unverified source provenance, missing monetary amounts, and dated fraud techniques), the current ML model has modest predictive power.
            <strong>This tool is strictly designed for investigator prioritization and triage support, never automated claim rejection.</strong>
            Model reliability and features will be improved in later versions as modern industry datasets become available.
        </div>
        """,
        unsafe_allow_html=True,
    )

    m_info = ENGINE["meta"]
    ho = m_info["holdout"]
    cv = m_info["cv"]

    # Key Validation Metrics
    st.markdown("### Model Performance Metrics")
    k1, k2, k3, k4 = st.columns(4)
    with k1:
        st.metric(
            "Frauds in Top 10% (Holdout)",
            f"{ho['recall10']:.0%}",
            f"Likely {ho['recall10_ci'][0]:.0%}–{ho['recall10_ci'][1]:.0%}",
        )
    with k2:
        st.metric(
            "Cross-Validation PR-AUC",
            f"{cv['model']['pr_auc']['mean']:.2f}",
            f"± {cv['model']['pr_auc']['sd']:.2f}",
        )
    with k3:
        st.metric(
            "Cross-Validation ROC-AUC",
            f"{cv['model']['roc_auc']['mean']:.2f}",
            f"± {cv['model']['roc_auc']['sd']:.2f}",
        )
    with k4:
        st.metric(
            "Shuffled Labels PR-AUC",
            f"{cv['shuffled']['pr_auc']['mean']:.2f}",
            "Falls to random chance (No leakage)",
        )

    # Capacity Curve & Calibration Charts
    c_chart1, c_chart2 = st.columns(2)
    with c_chart1:
        st.markdown("#### Review Capacity Curve")
        curve_data = m_info["capacity_curve"]
        df_curve = pd.DataFrame(curve_data)
        fig_cap = go.Figure()
        fig_cap.add_trace(
            go.Scatter(
                x=df_curve["share"],
                y=df_curve["recall"],
                mode="lines+markers",
                name="Triage Model",
                line=dict(color="#1e3a8a", width=3),
            )
        )
        fig_cap.add_trace(
            go.Scatter(
                x=[0, 0.5],
                y=[0, 0.5],
                mode="lines",
                name="Random Review",
                line=dict(color="#94a3b8", dash="dash"),
            )
        )
        fig_cap.update_layout(
            xaxis=dict(title="Share of Claims Reviewed", tickformat=".0%"),
            yaxis=dict(title="Share of Frauds Caught", tickformat=".0%"),
            height=320,
            margin=dict(l=10, r=10, t=10, b=10),
            plot_bgcolor="#ffffff",
            paper_bgcolor="#ffffff",
        )
        st.plotly_chart(fig_cap, use_container_width=True)

    with c_chart2:
        st.markdown("#### Calibration Curve")
        cal_data = m_info["calibration"]
        df_cal = pd.DataFrame(cal_data)
        fig_cal = go.Figure()
        fig_cal.add_trace(
            go.Scatter(
                x=df_cal["predicted"],
                y=df_cal["observed"],
                mode="markers",
                marker=dict(size=8, color="#1e3a8a"),
                name="Observed Tenths",
            )
        )
        fig_cal.add_trace(
            go.Scatter(
                x=[0, 0.2],
                y=[0, 0.2],
                mode="lines",
                name="Perfect Calibration",
                line=dict(color="#94a3b8", dash="dash"),
            )
        )
        fig_cal.update_layout(
            xaxis=dict(title="Predicted Fraud Score", tickformat=".0%"),
            yaxis=dict(title="Observed Fraud Rate", tickformat=".0%"),
            height=320,
            margin=dict(l=10, r=10, t=10, b=10),
            plot_bgcolor="#ffffff",
            paper_bgcolor="#ffffff",
        )
        st.plotly_chart(fig_cal, use_container_width=True)

    # Fairness & Protected Attribute Disparity
    st.markdown("### Demographic & Fairness Audit")
    st.markdown(
        "Sex, age, and marital status are intentionally **omitted as model inputs**. "
        "This table audits whether non-input demographic groups are disproportionately flagged through proxy variables (e.g. vehicle category)."
    )
    df_fair = pd.DataFrame(m_info["fairness"])
    df_fair.columns = ["Protected Attribute", "Sub-Group", "Claims Evaluated", "Flag Rate", "Observed Fraud Rate", "False Flag Rate"]
    df_fair["Flag Rate"] = df_fair["Flag Rate"].map(lambda x: f"{x:.1%}")
    df_fair["Observed Fraud Rate"] = df_fair["Observed Fraud Rate"].map(lambda x: f"{x:.1%}")
    df_fair["False Flag Rate"] = df_fair["False Flag Rate"].map(lambda x: f"{x:.1%}")
    st.dataframe(df_fair, use_container_width=True, hide_index=True)

    # Intentionally Excluded Features
    st.markdown("### Intentionally Excluded Features")
    st.markdown("Certain columns are deliberately excluded from model training to protect integrity and avoid retrospective bias:")
    df_excl = pd.DataFrame(m_info["excluded"])
    df_excl.columns = ["Excluded Field", "Methodological Rationale"]
    st.dataframe(df_excl, use_container_width=True, hide_index=True)


# =============================================================================
# PAGE 4: DECISIONS LOG
# =============================================================================
elif page == "Decisions Log":
    st.title("Investigator Decisions Log")
    st.markdown("Audit record of all investigator decisions and triage actions.")

    with get_db_connection() as con:
        db_rows = con.execute("SELECT claim_id, decision, note, score, updated FROM decisions ORDER BY updated DESC").fetchall()

    if not db_rows:
        st.info("No decisions recorded yet. Open a claim in the Claims Queue to log an investigator decision.")
    else:
        df_dec = pd.DataFrame(db_rows, columns=["Claim ID", "Decision", "Notes", "Risk Score", "Timestamp"])
        df_dec["Risk Score"] = df_dec["Risk Score"].map(lambda s: f"{s:.1%}" if pd.notna(s) else "N/A")

        # Summary KPIs
        t1, t2, t3, t4 = st.columns(4)
        with t1:
            st.metric("Total Decisions Recorded", len(df_dec))
        with t2:
            st.metric("Under Review", sum(df_dec["Decision"] == "Under review"))
        with t3:
            st.metric("Cleared", sum(df_dec["Decision"] == "Cleared"))
        with t4:
            st.metric("Escalated", sum(df_dec["Decision"] == "Escalated"))

        st.dataframe(df_dec, use_container_width=True, hide_index=True)

        # CSV Download
        csv_exp = io.StringIO()
        df_dec.to_csv(csv_exp, index=False)
        st.download_button(
            "📥 Export Decisions to CSV",
            data=csv_exp.getvalue(),
            file_name="investigator_decisions.csv",
            mime="text/csv",
        )

        # Decision Management
        st.markdown("---")
        st.markdown("#### Delete a Decision Entry")
        del_claim_id = st.selectbox("Select Claim ID to Delete", df_dec["Claim ID"].tolist())
        if st.button("🗑️ Delete Decision Entry"):
            delete_claim_decision(del_claim_id)
            st.success(f"Deleted decision for Claim {del_claim_id}.")
            st.rerun()
