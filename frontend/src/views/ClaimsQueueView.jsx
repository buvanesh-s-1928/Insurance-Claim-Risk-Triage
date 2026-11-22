import React, { useState, useEffect, useMemo } from 'react';
import GlassCard from '../components/ui/GlassCard';
import ClayButton from '../components/ui/ClayButton';
import RiskPill from '../components/ui/RiskPill';
import ClaimDossierModal from './ClaimDossierModal';
import { fetchSampleClaims, uploadBatchFile, fetchDecisions, DOWNLOAD_URLS } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { 
  UploadCloud, 
  Database, 
  Download, 
  Search, 
  Filter, 
  ExternalLink, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';

export default function ClaimsQueueView() {
  const { reviewCapacity } = useAuth();
  const [claims, setClaims] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [bandFilter, setBandFilter] = useState('ALL'); // 'ALL' | 'High' | 'Medium' | 'Low'
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [decisionsMap, setDecisionsMap] = useState({});

  // Helper to re-calculate bands based on review capacity
  const capVal = reviewCapacity / 100.0;
  const getBandForShare = (share) => {
    if (share <= capVal) return 'High';
    if (share <= 3 * capVal) return 'Medium';
    return 'Low';
  };

  // Load sample claims on mount if empty
  const loadSample = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchSampleClaims();
      setClaims(data.claims || []);
      const decs = await fetchDecisions().catch(() => []);
      const map = {};
      decs.forEach(d => { map[d.claim_id] = d; });
      setDecisionsMap(map);
    } catch (err) {
      setError(err.message || 'Failed to load sample claims');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSample();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await uploadBatchFile(file);
      setClaims(data.claims || []);
    } catch (err) {
      setError(err.message || 'CSV upload failed');
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  // Re-band claims dynamically based on review capacity
  const processedClaims = useMemo(() => {
    return claims.map((c) => {
      const dynamicBand = getBandForShare(c.top_share);
      return {
        ...c,
        band: dynamicBand,
      };
    });
  }, [claims, reviewCapacity]);

  // Metric counts
  const totalCount = processedClaims.length;
  const highClaims = processedClaims.filter(c => c.band === 'High');
  const medClaims = processedClaims.filter(c => c.band === 'Medium');
  const lowClaims = processedClaims.filter(c => c.band === 'Low');

  // Filtered claims for table
  const filteredClaims = useMemo(() => {
    return processedClaims.filter((c) => {
      const matchesBand = bandFilter === 'ALL' || c.band.toLowerCase() === bandFilter.toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesBand;
      const matchesId = String(c.id).toLowerCase().includes(q);
      const matchesDriver = c.top_reason ? c.top_reason.toLowerCase().includes(q) : false;
      const matchesRule = c.flags ? c.flags.some(f => f.title.toLowerCase().includes(q)) : false;
      return matchesBand && (matchesId || matchesDriver || matchesRule);
    });
  }, [processedClaims, bandFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-6 w-full">
      
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold tracking-wider uppercase">
              Batch Telemetry Active
            </span>
            <span className="text-slate-400 text-xs">• 400 Scored Claims</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Claims Queue</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Ranked incoming accident claims sorted by predicted fraud risk. Higher rank indicates investigator review priority.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={DOWNLOAD_URLS.templateCsv}
            download="claims_template.csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV Template</span>
          </a>
          <a
            href={DOWNLOAD_URLS.sampleCsv}
            download="sample_claims.csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sample CSV</span>
          </a>
        </div>
      </div>

      {/* Batch Intake Bar */}
      <GlassCard className="p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Drag & Drop File Zone */}
        <label className="flex-1 flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50/80 hover:bg-slate-100/90 border-2 border-dashed border-indigo-200 hover:border-indigo-400 transition-all cursor-pointer group shadow-inner">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className="sr-only"
          />
          <div className="w-11 h-11 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-sm">
            <UploadCloud className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              Ingest Claim Manifest (.CSV)
            </span>
            <span className="text-[11px] text-slate-500 truncate">
              Drop batch file here or click to browse (up to 20,000 claims)
            </span>
          </div>
        </label>

        {/* Quick Demo Reload Action */}
        <div className="flex items-center gap-2 shrink-0">
          <ClayButton
            variant="primary"
            onClick={loadSample}
            disabled={isLoading}
            icon={Database}
          >
            {isLoading ? 'Processing...' : 'Reload 400 Historical Claims'}
          </ClayButton>
        </div>
      </GlassCard>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Claymorphic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total In Queue */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-white/80 backdrop-blur-xl border border-white shadow-clay-card hover:shadow-clay-card-hover transition-all flex flex-col justify-between border-t-4 border-t-indigo-600">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Total In Queue</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-mono text-[10px]">Active Batch</span>
          </div>
          <div className="my-3">
            <span className="font-mono text-3xl sm:text-4xl font-extrabold text-slate-900">{totalCount}</span>
          </div>
          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span>Inference complete</span>
            <span className="font-semibold text-slate-700">100% Stratified</span>
          </div>
        </div>

        {/* High Risk Priority */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-red-50/60 to-white/90 backdrop-blur-xl border border-red-100 shadow-clay-card hover:shadow-clay-card-hover transition-all flex flex-col justify-between border-t-4 border-t-red-600">
          <div className="flex items-center justify-between text-xs font-bold text-red-900 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              High Risk Priority
            </span>
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-mono text-[10px] font-bold">
              {reviewCapacity}% Cap
            </span>
          </div>
          <div className="my-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl sm:text-4xl font-extrabold text-red-700">{highClaims.length}</span>
            <span className="text-xs font-semibold text-red-600">
              ({totalCount > 0 ? ((highClaims.length / totalCount) * 100).toFixed(0) : 0}% of batch)
            </span>
          </div>
          <div className="text-[11px] text-red-700 pt-2 border-t border-red-100 flex items-center justify-between font-medium">
            <span>Immediate SIU Referral</span>
            <span className="font-mono font-bold">Priority Target</span>
          </div>
        </div>

        {/* Medium Risk Watch */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-amber-50/60 to-white/90 backdrop-blur-xl border border-amber-100 shadow-clay-card hover:shadow-clay-card-hover transition-all flex flex-col justify-between border-t-4 border-t-amber-500">
          <div className="flex items-center justify-between text-xs font-bold text-amber-900 uppercase tracking-wider">
            <span>Medium Risk Watch</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono text-[10px] font-bold">
              Secondary Tier
            </span>
          </div>
          <div className="my-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl sm:text-4xl font-extrabold text-amber-700">{medClaims.length}</span>
            <span className="text-xs font-semibold text-amber-600">
              ({totalCount > 0 ? ((medClaims.length / totalCount) * 100).toFixed(0) : 0}% of batch)
            </span>
          </div>
          <div className="text-[11px] text-amber-700 pt-2 border-t border-amber-100 flex items-center justify-between font-medium">
            <span>Desk Anomaly Verification</span>
            <span className="font-mono font-semibold">Doc Check</span>
          </div>
        </div>

        {/* Low Risk Routine */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-emerald-50/60 to-white/90 backdrop-blur-xl border border-emerald-100 shadow-clay-card hover:shadow-clay-card-hover transition-all flex flex-col justify-between border-t-4 border-t-emerald-600">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-900 uppercase tracking-wider">
            <span>Low Risk Routine</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
              Standard
            </span>
          </div>
          <div className="my-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl sm:text-4xl font-extrabold text-emerald-700">{lowClaims.length}</span>
            <span className="text-xs font-semibold text-emerald-600">
              ({totalCount > 0 ? ((lowClaims.length / totalCount) * 100).toFixed(0) : 0}% of batch)
            </span>
          </div>
          <div className="text-[11px] text-emerald-700 pt-2 border-t border-emerald-100 flex items-center justify-between font-medium">
            <span>Fast-track Auto Settlement</span>
            <span className="font-mono font-semibold text-emerald-800">Eligible</span>
          </div>
        </div>
      </div>

      {/* Operational Efficiency Banner */}
      <div className="rounded-2xl bg-indigo-50/70 border border-indigo-200/80 p-4 shadow-sm flex items-start sm:items-center justify-between gap-3 text-xs text-indigo-950">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
          <span>
            <strong>🎯 Triage Efficiency Benchmark:</strong> Reviewing the top <strong>{reviewCapacity}%</strong> designated claims captures an estimated <strong>53%</strong> of total frauds (Expected range: 48%–59%), outperforming random review by <strong>{(53 / Math.max(reviewCapacity, 1)).toFixed(1)}x</strong>.
          </span>
        </div>
      </div>

      {/* Risk Distribution Spectrum Visualizer */}
      <GlassCard className="p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Risk Distribution Spectrum & Threshold Banding</h2>
            <span className="text-xs text-slate-500">
              Continuous fraud probability score gradient (0.0 to 1.0) with review capacity threshold
            </span>
          </div>

          {/* Band Filter Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl shadow-inner text-xs">
            {['ALL', 'High', 'Medium', 'Low'].map((b) => (
              <button
                key={b}
                onClick={() => setBandFilter(b)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  bandFilter === b
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {b === 'ALL' ? 'All Bands' : b}
              </button>
            ))}
          </div>
        </div>

        {/* Visual Scatter Strip Plot (SVG) */}
        <div className="relative w-full h-36 rounded-2xl bg-slate-50 border border-slate-200/80 p-3 overflow-hidden shadow-inner flex items-center">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 120" preserveAspectRatio="none">
            {/* Background gradient zones */}
            <rect x="0" y="0" width="400" height="120" fill="#10B981" fillOpacity="0.06" />
            <rect x="400" y="0" width="350" height="120" fill="#F59E0B" fillOpacity="0.06" />
            <rect x="750" y="0" width="250" height="120" fill="#EF4444" fillOpacity="0.1" />

            {/* Threshold Line */}
            <line x1="750" y1="5" x2="750" y2="115" stroke="#dc2626" strokeWidth="2" strokeDasharray="4 4" />

            {/* Render dots representing claims */}
            {processedClaims.slice(0, 180).map((c, i) => {
              // Map score 0..1 to x 20..980
              const x = 20 + Math.min(0.96, Math.max(0.02, c.score)) * 960;
              // Pseudorandom Y jitter based on index
              const y = 25 + ((i * 37) % 70);
              const isHigh = c.band === 'High';
              const isMed = c.band === 'Medium';
              const color = isHigh ? '#dc2626' : isMed ? '#d97706' : '#059669';
              const r = isHigh ? 5.5 : isMed ? 4.5 : 3.5;

              return (
                <circle
                  key={c.id}
                  cx={x}
                  cy={y}
                  r={r}
                  fill={color}
                  fillOpacity={isHigh ? 0.9 : 0.65}
                  className="cursor-pointer hover:r-7 transition-all"
                  onClick={() => setSelectedClaim(c)}
                >
                  <title>{`Claim ${c.id} • Score: ${(c.score * 100).toFixed(1)}% • ${c.band} Risk`}</title>
                </circle>
              );
            })}
          </svg>

          {/* Threshold Label Tag */}
          <div className="absolute top-2 left-[75%] -translate-x-1/2 px-2 py-0.5 rounded-full bg-red-600 text-white font-mono text-[9px] font-bold shadow-sm pointer-events-none">
            SIU Threshold ({reviewCapacity}% Review Target)
          </div>

          {/* Axis Labels */}
          <div className="absolute bottom-1 left-4 right-4 flex justify-between text-[10px] font-mono text-slate-400 pointer-events-none">
            <span>0.00 (Minimal Risk)</span>
            <span className="text-emerald-700 font-semibold">Low Zone</span>
            <span className="text-amber-700 font-semibold">Medium Zone</span>
            <span className="text-red-700 font-bold">High Investigation Zone</span>
            <span>1.00 (Severe Anomaly)</span>
          </div>
        </div>
      </GlassCard>

      {/* Ranked Triage Table Section */}
      <GlassCard className="p-5 flex flex-col gap-4">
        {/* Table Search & Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Claim ID, SHAP anomaly, or rule..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-100/80 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 shadow-inner focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-800">{filteredClaims.length}</strong> of {processedClaims.length} claims
          </div>
        </div>

        {/* Data Grid Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-3 px-4"># Rank</th>
                <th className="py-3 px-4">Claim ID</th>
                <th className="py-3 px-4">Fraud Probability</th>
                <th className="py-3 px-4">Risk Band</th>
                <th className="py-3 px-4">Primary SHAP Driver</th>
                <th className="py-3 px-4">Rule Checks</th>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400 font-normal">
                    No claims match your search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredClaims.slice(0, 100).map((c) => {
                  const dec = decisionsMap[c.id];
                  return (
                    <tr key={c.id} className="hover:bg-indigo-50/40 transition-colors group">
                      <td className="py-3 px-4 font-mono font-bold text-slate-500">
                        #{c.rank}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                        <button
                          onClick={() => setSelectedClaim(c)}
                          className="hover:underline flex items-center gap-1 text-left"
                        >
                          {c.id}
                          <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                c.band === 'High' ? 'bg-red-600' : c.band === 'Medium' ? 'bg-amber-500' : 'bg-emerald-600'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(8, c.score * 100))}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-900">
                            {(c.score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <RiskPill band={c.band} />
                      </td>
                      <td className="py-3 px-4">
                        {c.top_reason ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200 inline-block truncate max-w-xs">
                            {c.top_reason}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Balanced</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {c.flags && c.flags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.flags.map((f, fi) => (
                              <span key={fi} className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">
                                {f.id === 'early_accident' ? 'Policy < 15d' : 'Address Change'}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">Clear</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {dec ? (
                          <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                            dec.decision === 'Escalated' ? 'bg-red-100 text-red-800' :
                            dec.decision === 'Cleared' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {dec.decision}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <ClayButton
                          variant="glass"
                          size="sm"
                          onClick={() => setSelectedClaim(c)}
                        >
                          Inspect
                        </ClayButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredClaims.length > 100 && (
          <div className="text-center text-xs text-slate-400 py-2">
            Showing first 100 claims for optimal responsiveness. Use search to find specific records.
          </div>
        )}
      </GlassCard>

      {/* Slide-out Dossier Modal */}
      {selectedClaim && (
        <ClaimDossierModal
          claim={selectedClaim}
          isOpen={Boolean(selectedClaim)}
          onClose={() => setSelectedClaim(null)}
          initialDecision={decisionsMap[selectedClaim.id]}
          onDecisionSaved={(saved) => {
            setDecisionsMap(prev => ({ ...prev, [saved.claim_id]: saved }));
          }}
        />
      )}

    </div>
  );
}
