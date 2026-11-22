import React, { useState } from 'react';
import GlassCard from '../components/ui/GlassCard';
import ClayButton from '../components/ui/ClayButton';
import RiskPill from '../components/ui/RiskPill';
import { saveDecision } from '../api/client';
import { X, AlertTriangle, ShieldCheck, CheckCircle2, ArrowUpRight, ArrowDownRight, FileText } from 'lucide-react';

export default function ClaimDossierModal({ claim, isOpen, onClose, onDecisionSaved, initialDecision }) {
  if (!isOpen || !claim) return null;

  const [decision, setDecision] = useState(initialDecision?.decision || 'Under review');
  const [note, setNote] = useState(initialDecision?.note || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError('');
    try {
      await saveDecision({
        claim_id: claim.id,
        decision,
        note,
        score: claim.score,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        if (onDecisionSaved) onDecisionSaved({ claim_id: claim.id, decision, note });
      }, 800);
    } catch (err) {
      setSaveError(err.message || 'Failed to save decision');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 border border-white shadow-[0_25px_60px_-15px_rgba(15,23,42,0.35)] p-6 sm:p-8 flex flex-col gap-6 text-slate-800">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                Rank #{claim.rank} in Active Queue
              </span>
              <RiskPill band={claim.band} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Claim {claim.id}</span>
            </h2>
            <span className="text-xs text-slate-500 mt-0.5">
              Stratified Fraud Risk Assessment • Baseline Cohort Comparison
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Score & Anomaly Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Model Fraud Score</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="font-mono text-3xl font-extrabold text-slate-900">
                {(claim.score * 100).toFixed(1)}%
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Top <strong className="text-slate-800">{Math.max(1, Math.round(claim.top_share * 100))}%</strong> of risk distribution
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Baseline Lift</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="font-mono text-3xl font-extrabold text-indigo-700">
                {(claim.score / 0.06).toFixed(1)}x
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Versus 6.0% historical base rate
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rule Checks</span>
            <div className="my-2">
              {claim.flags && claim.flags.length > 0 ? (
                <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {claim.flags.length} Red-Flags
                </span>
              ) : (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Clear Heuristics
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500">
              Deterministic Inception & Address rules
            </span>
          </div>
        </div>

        {/* Heuristic Rule Flags Alert (if any) */}
        {claim.flags && claim.flags.length > 0 && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex flex-col gap-2">
            <span className="text-xs font-bold text-red-900 flex items-center gap-1.5 uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Heuristic Red-Flags Triggered</span>
            </span>
            <div className="flex flex-col gap-1.5">
              {claim.flags.map((flg, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-red-800 bg-white/70 px-3 py-1.5 rounded-xl border border-red-200/60">
                  <span className="font-medium">{flg.title}</span>
                  <span className="font-mono font-bold text-red-900">
                    Cohort Fraud Rate: {(flg.fraud_rate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SHAP Feature Contribution Waterfall */}
        {claim.reasons && claim.reasons.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Primary Model Drivers (SHAP Explainability)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Marginal Log-Odds Contribution</span>
            </div>
            
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-2.5">
              {claim.reasons.map((r, i) => {
                const isPositive = r.effect > 0;
                const absEffect = Math.abs(r.effect);
                const widthPct = Math.min(100, Math.max(12, absEffect * 300));

                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        {isPositive ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-red-600 stroke-[2.5]" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                        )}
                        <span>{r.label}:</span>
                        <span className="font-mono font-normal text-slate-600">"{String(r.value)}"</span>
                      </div>
                      <span className={`font-mono text-xs font-bold ${isPositive ? 'text-red-700' : 'text-emerald-700'}`}>
                        {isPositive ? '+' : ''}{r.effect.toFixed(4)}
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isPositive
                            ? 'bg-gradient-to-r from-red-500 to-red-600'
                            : 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Investigator Decision Record Form */}
        <form onSubmit={handleSave} className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200/70 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Record Investigator Disposition</span>
            </span>
            <span className="text-[11px] font-mono text-indigo-600">Persists to SQLite Audit Trail</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {['Under review', 'Cleared', 'Escalated'].map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  decision === opt
                    ? 'bg-indigo-600 text-white font-bold border-indigo-700 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="decision"
                  value={opt}
                  checked={decision === opt}
                  onChange={(e) => setDecision(e.target.value)}
                  className="sr-only"
                />
                <span className="text-xs tracking-tight">{opt}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">Investigator Rationale & Case Notes</label>
            <textarea
              rows="3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Record investigative steps taken, witness checks, or escalation reason..."
              className="w-full px-3.5 py-2 text-xs sm:text-sm bg-white rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {saveError && <span className="text-xs text-red-600 font-medium">{saveError}</span>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <ClayButton variant="glass" size="sm" type="button" onClick={onClose}>
              Dismiss
            </ClayButton>
            <ClayButton variant="primary" size="sm" type="submit" disabled={isSaving}>
              {isSaving ? 'Logging...' : saveSuccess ? 'Saved ✓' : 'Save Decision to Audit Trail'}
            </ClayButton>
          </div>
        </form>

      </div>
    </div>
  );
}
