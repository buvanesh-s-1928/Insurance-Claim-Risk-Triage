import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

export default function RegulatoryBanner() {
  return (
    <footer className="mt-8 rounded-2xl bg-amber-500/10 backdrop-blur-md border border-amber-300/40 p-4 shadow-[0_4px_14px_rgba(245,158,11,0.08),inset_0_1px_2px_rgba(255,255,255,0.8)] text-amber-950 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 border border-amber-400/30">
        <ShieldAlert className="w-5 h-5" />
      </div>
      <div className="flex flex-col text-xs leading-relaxed">
        <span className="font-bold text-amber-900 tracking-tight flex items-center gap-1.5">
          <span>ETHICAL GOVERNANCE NOTICE: Review Priority, Not Proof of Fraud</span>
          <span className="font-mono text-[10px] bg-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded">Human Review Mandatory</span>
        </span>
        <span className="text-amber-800/90 mt-0.5">
          Algorithmic fraud probability scores and SHAP attribution metrics are decision-support triage recommendations. The system never denies or rejects claims automatically. An adverse determination requires complete independent investigation by a qualified human claims investigator.
        </span>
      </div>
    </footer>
  );
}
