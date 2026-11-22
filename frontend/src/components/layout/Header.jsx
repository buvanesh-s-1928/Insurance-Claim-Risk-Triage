import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Activity, ShieldCheck, HelpCircle } from 'lucide-react';

export default function Header({ onOpenProfileModal }) {
  const { currentUser } = useAuth();

  return (
    <header className="fixed top-0 left-72 right-0 h-16 bg-white/70 backdrop-blur-xl z-40 border-b border-white/80 shadow-[0_1px_8px_rgba(0,0,0,0.03)] px-8 flex items-center justify-between">
      {/* Left: Telemetry & Cluster Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/60 text-xs text-slate-600 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
          <span className="font-mono font-bold text-indigo-700">PROD-ACTIVE</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500 hidden sm:inline">Scikit-Learn GradientBoosting + SHAP</span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/50 text-xs">
          <Activity className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-mono font-medium">Inference Latency: ~38ms</span>
        </div>
      </div>

      {/* Right: User Context & Actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
          <span>v1 Demonstration Prototype</span>
        </div>

        <div className="h-5 w-px bg-slate-200 mx-1" />

        <button
          onClick={onOpenProfileModal}
          className="flex items-center gap-2 p-1 pl-2 rounded-full hover:bg-slate-100 transition-colors"
        >
          <span className="text-xs font-bold text-slate-700 hidden md:inline">{currentUser?.name}</span>
          <img
            src={currentUser?.avatar}
            alt={currentUser?.name}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-500/30"
          />
        </button>
      </div>
    </header>
  );
}
