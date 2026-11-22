import React, { useState, useEffect } from 'react';
import GlassCard from '../components/ui/GlassCard';
import ClayButton from '../components/ui/ClayButton';
import { fetchDecisions, deleteDecision, DOWNLOAD_URLS } from '../api/client';
import { 
  History, 
  Download, 
  Trash2, 
  FileCheck, 
  AlertTriangle, 
  Clock, 
  Search,
  CheckCircle2,
  AlertOctagon
} from 'lucide-react';

export default function DecisionsLogView() {
  const [decisions, setDecisions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const loadDecisions = () => {
    setIsLoading(true);
    fetchDecisions()
      .then(data => setDecisions(data || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadDecisions();
  }, []);

  const handleDelete = async (claimId) => {
    if (!window.confirm(`Delete decision audit entry for Claim ${claimId}?`)) return;
    try {
      await deleteDecision(claimId);
      loadDecisions();
    } catch {
      // ignore
    }
  };

  // Metrics
  const total = decisions.length;
  const underReview = decisions.filter(d => d.decision === 'Under review').length;
  const cleared = decisions.filter(d => d.decision === 'Cleared').length;
  const escalated = decisions.filter(d => d.decision === 'Escalated').length;

  // Filtered rows
  const filtered = decisions.filter(d => {
    const matchesFilter = filterType === 'ALL' || d.decision === filterType;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesFilter;
    return matchesFilter && (
      String(d.claim_id).toLowerCase().includes(q) ||
      (d.note && d.note.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold tracking-wider uppercase">
              Chain of Custody
            </span>
            <span className="text-slate-400 text-xs">• SQLite Audit Persistence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Investigator Decisions Log</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Immutable audit record of all human investigator adjudications, notes, and case escalations.
          </p>
        </div>

        <a
          href={DOWNLOAD_URLS.decisionsCsv}
          download="investigator_decisions.csv"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-semibold text-xs shadow-md hover:shadow-lg transition-all shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit CSV</span>
        </a>
      </div>

      {/* Summary KPI Pods */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-white/80 border border-white shadow-clay-card flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Decisions</span>
          <span className="font-mono text-3xl font-extrabold text-slate-900 my-2">{total}</span>
          <span className="text-[11px] text-slate-400 font-medium">Logged actions</span>
        </div>

        <div className="p-4 rounded-3xl bg-amber-50/60 border border-amber-200/60 shadow-clay-card flex flex-col justify-between">
          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Under Review</span>
          <span className="font-mono text-3xl font-extrabold text-amber-700 my-2">{underReview}</span>
          <span className="text-[11px] text-amber-600 font-medium">Investigation ongoing</span>
        </div>

        <div className="p-4 rounded-3xl bg-emerald-50/60 border border-emerald-200/60 shadow-clay-card flex flex-col justify-between">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Cleared</span>
          <span className="font-mono text-3xl font-extrabold text-emerald-700 my-2">{cleared}</span>
          <span className="text-[11px] text-emerald-600 font-medium">Fraud ruled out</span>
        </div>

        <div className="p-4 rounded-3xl bg-red-50/60 border border-red-200/60 shadow-clay-card flex flex-col justify-between">
          <span className="text-xs font-bold text-red-800 uppercase tracking-wider">Escalated</span>
          <span className="font-mono text-3xl font-extrabold text-red-700 my-2">{escalated}</span>
          <span className="text-[11px] text-red-600 font-medium">SIU Formal Referral</span>
        </div>
      </div>

      {/* Audit Trail Table */}
      <GlassCard className="p-5 flex flex-col gap-4">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Claim ID or investigator notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-100/80 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 shadow-inner focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
            {['ALL', 'Under review', 'Cleared', 'Escalated'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  filterType === t
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {t === 'ALL' ? 'All' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/70">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Claim ID</th>
                <th className="py-3 px-4">Disposition Status</th>
                <th className="py-3 px-4">Risk Score</th>
                <th className="py-3 px-4">Investigator Case Notes</th>
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-4 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-slate-400 font-normal">
                    {total === 0 
                      ? "No investigator decisions recorded yet. Open a claim from the Claims Queue to log an adjudication." 
                      : "No decisions matching your search criteria."}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.claim_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                      {d.claim_id}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full font-mono text-[10px] font-bold ${
                        d.decision === 'Escalated' ? 'bg-red-100 text-red-800 border border-red-200' :
                        d.decision === 'Cleared' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {d.decision}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {d.score != null ? `${(d.score * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-600">
                      {d.note || <span className="text-slate-400 italic">No notes</span>}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {d.updated ? new Date(d.updated).toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDelete(d.claim_id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete decision"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
