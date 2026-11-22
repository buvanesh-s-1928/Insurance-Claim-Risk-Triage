import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Shield, 
  Layers, 
  FileSearch, 
  Cpu, 
  History, 
  Sliders, 
  LogOut, 
  User, 
  ChevronRight 
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, onOpenProfileModal }) {
  const { currentUser, logout, reviewCapacity, setReviewCapacity } = useAuth();

  const navItems = [
    { id: 'queue', label: 'Claims Queue', icon: Layers, desc: 'Ranked Risk Manifest' },
    { id: 'assess', label: 'Assess a Claim', icon: FileSearch, desc: 'Single Claim Intake' },
    { id: 'model', label: 'Model & Limitations', icon: Cpu, desc: 'Metrics & Transparency' },
    { id: 'decisions', label: 'Decisions Log', icon: History, desc: 'Investigator Audit Ledger' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-72 bg-obsidian-950/95 backdrop-blur-2xl text-slate-200 z-50 flex flex-col justify-between border-r border-white/10 shadow-[8px_0_32px_rgba(7,10,18,0.4)]">
      {/* Top Section: Logo & Nav */}
      <div className="flex flex-col flex-1 overflow-y-auto px-4 pt-6">
        
        {/* Brand Crest */}
        <div className="flex items-center gap-3 px-2 pb-6 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-[0_4px_12px_rgba(79,70,229,0.4),inset_0_1.5px_2px_rgba(255,255,255,0.4)] border border-indigo-400/30">
            <Shield className="w-5 h-5 stroke-[2.4]" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-white text-base tracking-tight leading-tight">Claim Triage</span>
            <span className="font-mono text-[10px] text-indigo-400 tracking-wider uppercase font-semibold">Fraud Decision Support</span>
          </div>
        </div>

        {/* Navigation Roster */}
        <div className="mt-6 flex flex-col gap-1">
          <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
            Investigation Hub
          </span>
          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl transition-all text-left ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold shadow-[0_6px_20px_rgba(79,70,229,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 font-medium'
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs sm:text-sm tracking-tight">{item.label}</span>
                    <span className={`text-[10px] truncate ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                      {item.desc}
                    </span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto text-white/80" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Capacity Controller Card */}
        <div className="mt-8 p-4 rounded-2xl bg-slate-900/80 border border-white/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.5),inset_-1px_-1px_2px_rgba(255,255,255,0.06)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Review Capacity</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white font-mono text-xs font-bold shadow-[0_2px_6px_rgba(79,70,229,0.4)]">
              {reviewCapacity}%
            </span>
          </div>

          <input
            type="range"
            min="5"
            max="25"
            step="1"
            value={reviewCapacity}
            onChange={(e) => setReviewCapacity(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer h-1.5 rounded-lg bg-slate-800"
          />

          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>5% (Strict)</span>
            <span className="text-amber-400 font-semibold">High Risk Target</span>
            <span>25% (Broad)</span>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-300">
            <span>Priority allocation:</span>
            <span className="font-mono font-bold text-emerald-400">Top {reviewCapacity}%</span>
          </div>
        </div>

      </div>

      {/* Bottom Pinned User Profile Capsule */}
      <div className="p-3.5 border-t border-white/10 bg-slate-950/60 flex items-center justify-between gap-2">
        <button
          onClick={onOpenProfileModal}
          className="flex items-center gap-2.5 p-1.5 -ml-1 rounded-xl hover:bg-white/5 transition-all text-left flex-1 min-w-0"
        >
          <div className="relative shrink-0">
            <img
              src={currentUser?.avatar}
              alt={currentUser?.name}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-indigo-500/50"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-obsidian-950" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold text-white truncate">{currentUser?.name}</span>
            <span className="text-[10px] text-slate-400 truncate">{currentUser?.title}</span>
            <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1 mt-0.5">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              {currentUser?.badge}
            </span>
          </div>
        </button>

        <button
          onClick={logout}
          title="Sign Out Session"
          className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
