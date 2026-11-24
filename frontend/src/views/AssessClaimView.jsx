import React, { useState, useEffect, useRef } from 'react';
import GlassCard from '../components/ui/GlassCard';
import ClayButton from '../components/ui/ClayButton';
import RiskPill from '../components/ui/RiskPill';
import { ClayInput, ClaySelect } from '../components/ui/ClayInput';
import { fetchSchema, scoreSingleClaim, saveDecision } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { 
  Sparkles, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileText, 
  ShieldCheck,
  Check
} from 'lucide-react';

export default function AssessClaimView() {
  const { reviewCapacity } = useAuth();
  const [schemaMeta, setSchemaMeta] = useState(null);
  const [formData, setFormData] = useState({});
  const [scoreResult, setScoreResult] = useState(null);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringError, setScoringError] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionType, setDecisionType] = useState('Under review');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const debounceTimer = useRef(null);

  // Load schema and initial defaults
  useEffect(() => {
    fetchSchema()
      .then((data) => {
        setSchemaMeta(data);
        if (data.defaults) {
          setFormData(data.defaults);
          // Initial score
          scoreSingleClaim(data.defaults)
            .then(res => setScoreResult(res.claim))
            .catch(() => {});
        }
      })
      .catch((err) => {
        setScoringError('Could not connect to model schema: ' + err.message);
      });
  }, []);

  // Real-time debounced scoring on form changes
  const handleFieldChange = (fieldName, value) => {
    const isNum = ['Deductible', 'WeekOfMonth', 'WeekOfMonthClaimed'].includes(fieldName);
    const parsedVal = isNum && value !== '' ? Number(value) : value;
    const updated = { ...formData, [fieldName]: parsedVal };
    setFormData(updated);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setIsScoring(true);
      scoreSingleClaim(updated)
        .then((res) => {
          setScoreResult(res.claim);
          setScoringError('');
        })
        .catch((err) => {
          setScoringError(err.message || 'Scoring error');
        })
        .finally(() => {
          setIsScoring(false);
        });
    }, 220);
  };

  // High-scoring preset (known severe risk profile with early accident & address change)
  const handleFillHighRisk = () => {
    const baseDefaults = schemaMeta?.defaults || {};
    const highRiskProfile = {
      ...baseDefaults,
      "PolicyType": "Sedan - Liability",
      "VehicleCategory": "Sedan",
      "Make": "Honda",
      "VehiclePrice": "more than 69,000",
      "Deductible": 400,
      "Days:Policy-Accident": "1 to 7",
      "Days:Policy-Claim": "8 to 15",
      "PastNumberOfClaims": "none",
      "AgeOfVehicle": "3 years",
      "PoliceReportFiled": "No",
      "WitnessPresent": "No",
      "AgentType": "External",
      "AddressChange-Claim": "under 6 months",
      "NumberOfCars": "1 vehicle",
      "BasePolicy": "Liability",
      "AccidentArea": "Urban",
      "Month": "Jan",
      "WeekOfMonth": 1,
      "DayOfWeek": "Monday",
      "MonthClaimed": "Jan",
      "WeekOfMonthClaimed": 2,
      "DayOfWeekClaimed": "Tuesday",
    };
    setFormData(highRiskProfile);
    setIsScoring(true);
    scoreSingleClaim(highRiskProfile)
      .then(res => {
        setScoreResult(res.claim);
        setScoringError('');
      })
      .catch(err => setScoringError(err.message))
      .finally(() => setIsScoring(false));
  };

  const handleResetDefaults = () => {
    if (schemaMeta?.defaults) {
      setFormData(schemaMeta.defaults);
      setIsScoring(true);
      scoreSingleClaim(schemaMeta.defaults)
        .then(res => {
          setScoreResult(res.claim);
          setScoringError('');
        })
        .catch(err => setScoringError(err.message))
        .finally(() => setIsScoring(false));
    }
  };

  const handleLogDecision = async () => {
    if (!scoreResult) return;
    try {
      await saveDecision({
        claim_id: 'SINGLE-INTAKE-' + Date.now().toString().slice(-4),
        decision: decisionType,
        note: decisionNotes,
        score: scoreResult.score,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch {
      // ignore
    }
  };

  // Safe field getter helper
  const getFieldOptions = (name) => {
    if (!schemaMeta?.schema) return [];
    const item = schemaMeta.schema.find(f => f.name === name);
    return item?.options || item?.categories || [];
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold tracking-wider uppercase">
              First Notice of Loss Intake
            </span>
            <span className="text-slate-400 text-xs">• Real-Time Scoring</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Assess a Single Claim</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Simulate or evaluate intake attributes known at claim arrival. The score and SHAP explainability update automatically with each selection.
          </p>
        </div>

        {/* Quick Action Presets */}
        <div className="flex items-center gap-2.5 shrink-0">
          <ClayButton
            variant="glass"
            size="sm"
            onClick={handleResetDefaults}
            icon={RotateCcw}
          >
            Reset Defaults
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={handleFillHighRisk}
            icon={Sparkles}
          >
            Fill High-Risk Sample
          </ClayButton>
        </div>
      </div>

      {scoringError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{scoringError}</span>
        </div>
      )}

      {/* Main 2-Column Evaluation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: 4-Quadrant Intake Form (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          {/* Quadrant 1: Policy Profile */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                1. Policy Profile
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Contract Parameters</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <ClaySelect
                label="Policy Type"
                value={formData['PolicyType'] || ''}
                options={getFieldOptions('PolicyType')}
                onChange={(e) => handleFieldChange('PolicyType', e.target.value)}
              />
              <ClaySelect
                label="Base Policy Line"
                value={formData['BasePolicy'] || ''}
                options={getFieldOptions('BasePolicy')}
                onChange={(e) => handleFieldChange('BasePolicy', e.target.value)}
              />
              <ClaySelect
                label="Deductible ($)"
                value={formData['Deductible'] ?? 400}
                options={getFieldOptions('Deductible').length ? getFieldOptions('Deductible') : [300, 400, 500, 700]}
                onChange={(e) => handleFieldChange('Deductible', Number(e.target.value))}
              />
              <ClaySelect
                label="Past Claims Count"
                value={formData['PastNumberOfClaims'] || ''}
                options={getFieldOptions('PastNumberOfClaims')}
                onChange={(e) => handleFieldChange('PastNumberOfClaims', e.target.value)}
              />
              <ClaySelect
                label="Cars on Policy"
                value={formData['NumberOfCars'] || ''}
                options={getFieldOptions('NumberOfCars')}
                onChange={(e) => handleFieldChange('NumberOfCars', e.target.value)}
              />
              <ClaySelect
                label="Agent Type"
                value={formData['AgentType'] || ''}
                options={getFieldOptions('AgentType')}
                onChange={(e) => handleFieldChange('AgentType', e.target.value)}
              />
            </div>
          </GlassCard>

          {/* Quadrant 2: Vehicle Context */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                2. Vehicle Context
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Insured Asset Profile</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <ClaySelect
                label="Vehicle Make"
                value={formData['Make'] || ''}
                options={getFieldOptions('Make')}
                onChange={(e) => handleFieldChange('Make', e.target.value)}
              />
              <ClaySelect
                label="Vehicle Category"
                value={formData['VehicleCategory'] || ''}
                options={getFieldOptions('VehicleCategory')}
                onChange={(e) => handleFieldChange('VehicleCategory', e.target.value)}
              />
              <ClaySelect
                label="Estimated Value"
                value={formData['VehiclePrice'] || ''}
                options={getFieldOptions('VehiclePrice')}
                onChange={(e) => handleFieldChange('VehiclePrice', e.target.value)}
              />
              <ClaySelect
                label="Vehicle Age"
                value={formData['AgeOfVehicle'] || ''}
                options={getFieldOptions('AgeOfVehicle')}
                onChange={(e) => handleFieldChange('AgeOfVehicle', e.target.value)}
              />
            </div>
          </GlassCard>

          {/* Quadrant 3: Incident Details */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                3. Incident Details & Timing
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Accident Mechanics</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <ClaySelect
                label="Accident Locale"
                value={formData['AccidentArea'] || ''}
                options={getFieldOptions('AccidentArea')}
                onChange={(e) => handleFieldChange('AccidentArea', e.target.value)}
              />
              <ClaySelect
                label="Accident Month"
                value={formData['Month'] || ''}
                options={getFieldOptions('Month')}
                onChange={(e) => handleFieldChange('Month', e.target.value)}
              />
              <ClaySelect
                label="Accident Week"
                value={formData['WeekOfMonth'] ?? ''}
                options={getFieldOptions('WeekOfMonth')}
                onChange={(e) => handleFieldChange('WeekOfMonth', Number(e.target.value))}
              />
              <ClaySelect
                label="Accident Day"
                value={formData['DayOfWeek'] || ''}
                options={getFieldOptions('DayOfWeek')}
                onChange={(e) => handleFieldChange('DayOfWeek', e.target.value)}
              />
              <ClaySelect
                label="Policy to Accident"
                value={formData['Days:Policy-Accident'] || ''}
                options={getFieldOptions('Days:Policy-Accident')}
                onChange={(e) => handleFieldChange('Days:Policy-Accident', e.target.value)}
              />
              <ClaySelect
                label="Policy to Claim"
                value={formData['Days:Policy-Claim'] || ''}
                options={getFieldOptions('Days:Policy-Claim')}
                onChange={(e) => handleFieldChange('Days:Policy-Claim', e.target.value)}
              />
            </div>
          </GlassCard>

          {/* Quadrant 4: Police & Reporting Context */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                4. Police & Evidentiary Reporting
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Verification Flags</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <ClaySelect
                label="Police Report Filed"
                value={formData['PoliceReportFiled'] || ''}
                options={getFieldOptions('PoliceReportFiled')}
                onChange={(e) => handleFieldChange('PoliceReportFiled', e.target.value)}
              />
              <ClaySelect
                label="Witness Present"
                value={formData['WitnessPresent'] || ''}
                options={getFieldOptions('WitnessPresent')}
                onChange={(e) => handleFieldChange('WitnessPresent', e.target.value)}
              />
              <ClaySelect
                label="Address Change"
                value={formData['AddressChange-Claim'] || ''}
                options={getFieldOptions('AddressChange-Claim')}
                onChange={(e) => handleFieldChange('AddressChange-Claim', e.target.value)}
              />
              <ClaySelect
                label="Reported Month"
                value={formData['MonthClaimed'] || ''}
                options={getFieldOptions('MonthClaimed')}
                onChange={(e) => handleFieldChange('MonthClaimed', e.target.value)}
              />
              <ClaySelect
                label="Reported Week"
                value={formData['WeekOfMonthClaimed'] ?? ''}
                options={getFieldOptions('WeekOfMonthClaimed')}
                onChange={(e) => handleFieldChange('WeekOfMonthClaimed', Number(e.target.value))}
              />
              <ClaySelect
                label="Reported Day"
                value={formData['DayOfWeekClaimed'] || ''}
                options={getFieldOptions('DayOfWeekClaimed')}
                onChange={(e) => handleFieldChange('DayOfWeekClaimed', e.target.value)}
              />
            </div>
          </GlassCard>

        </div>

        {/* Right Column: Live Sticky Explainability Triage Card (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5 sticky top-20">
          <GlassCard className="p-6 flex flex-col gap-5 shadow-clay-card">
            
            {/* Header / Loading state */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Live Stratification Output
              </span>
              <span className="font-mono text-xs text-indigo-600 flex items-center gap-1.5 font-semibold">
                {isScoring ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                    Inferring...
                  </>
                ) : (
                  'Synced (38ms)'
                )}
              </span>
            </div>

            {/* Score & Risk Band */}
            {scoreResult && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Predicted Fraud Probability
                    </span>
                    <span className="font-mono text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                      {(scoreResult.score * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <RiskPill band={scoreResult.band} />
                    <span className="text-[11px] font-mono text-slate-500">
                      Top {Math.max(1, Math.round(scoreResult.top_share * 100))}% Rank
                    </span>
                  </div>
                </div>

                {/* Score vs Baseline Bar */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-1 text-xs">
                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>Base rate: 6.0%</span>
                    <span className="font-bold text-indigo-700">
                      {(scoreResult.score / 0.06).toFixed(1)}x Baseline Lift
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        scoreResult.band === 'High' ? 'bg-red-600' : scoreResult.band === 'Medium' ? 'bg-amber-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(8, scoreResult.score * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Heuristic Rule Checks Triggered */}
            {scoreResult?.flags && scoreResult.flags.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex flex-col gap-2">
                <span className="text-xs font-bold text-red-900 flex items-center gap-1.5 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>Rule Checks Triggered</span>
                </span>
                <div className="flex flex-col gap-1">
                  {scoreResult.flags.map((f, i) => (
                    <div key={i} className="text-xs text-red-800 bg-white/80 p-2 rounded-xl border border-red-100 flex items-center justify-between">
                      <span className="font-semibold">{f.title}</span>
                      <span className="font-mono text-[11px] font-bold text-red-900">
                        Past Fraud: {(f.fraud_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SHAP Feature Contribution Waterfall */}
            {scoreResult?.reasons && scoreResult.reasons.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>SHAP Feature Attribution</span>
                  <span className="text-[11px] font-mono text-slate-400 font-normal">Impact on Score</span>
                </span>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
                  {scoreResult.reasons.map((r, i) => {
                    const isPositive = r.effect > 0;
                    const absEffect = Math.abs(r.effect);
                    const widthPct = Math.min(100, Math.max(12, absEffect * 300));

                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-800 truncate max-w-[200px]">
                            {r.label}: <strong className="text-slate-900 font-mono font-normal">"{r.value}"</strong>
                          </span>
                          <span className={`font-mono text-xs font-bold ${isPositive ? 'text-red-700' : 'text-emerald-700'}`}>
                            {isPositive ? '+' : ''}{r.effect.toFixed(4)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden flex">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isPositive ? 'bg-red-500' : 'bg-emerald-500'
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

            {/* Log Quick Intake Decision Form */}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Log Intake Triage Disposition
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {['Under review', 'Cleared', 'Escalated'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDecisionType(opt)}
                    className={`py-1.5 px-2 rounded-xl font-semibold border transition-all text-center ${
                      decisionType === opt
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Intake notes..."
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-100/90 rounded-xl border border-slate-200 shadow-inner focus:outline-none focus:border-indigo-500"
              />

              <ClayButton
                variant="primary"
                size="sm"
                onClick={handleLogDecision}
                icon={Check}
                className="w-full mt-1"
              >
                {savedSuccess ? 'Logged Successfully ✓' : 'Save Intake Decision'}
              </ClayButton>
            </div>

          </GlassCard>
        </div>

      </div>
    </div>
  );
}
