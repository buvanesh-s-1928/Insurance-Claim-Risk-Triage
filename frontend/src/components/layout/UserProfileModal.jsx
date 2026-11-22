import React from 'react';
import { useAuth } from '../../context/AuthContext';
import ClayButton from '../ui/ClayButton';
import { X, ShieldCheck, UserCheck, LogOut, CheckCircle2 } from 'lucide-react';

export default function UserProfileModal({ isOpen, onClose }) {
  const { currentUser, switchProfile, logout, allProfiles } = useAuth();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-white/10 p-6 sm:p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] text-slate-100 flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Investigator Credentials</h2>
              <span className="text-xs text-slate-400 font-mono">Session Clearance Active</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Persona Card */}
        <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex items-center gap-4 shadow-inner">
          <img
            src={currentUser?.avatar}
            alt={currentUser?.name}
            className="w-14 h-14 rounded-full object-cover ring-2 ring-indigo-500 shadow-md"
          />
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white">{currentUser?.name}</span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${currentUser?.badgeColor}`}>
                {currentUser?.badge}
              </span>
            </div>
            <span className="text-xs text-indigo-300 font-medium mt-0.5">{currentUser?.title}</span>
            <span className="text-[11px] text-slate-400 mt-1 truncate">{currentUser?.email}</span>
            <span className="text-[10px] font-mono text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {currentUser?.clearance}
            </span>
          </div>
        </div>

        {/* Switch Profile Selection */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Switch Investigator Persona
          </span>
          <div className="flex flex-col gap-2">
            {allProfiles.map((p) => {
              const isActive = p.id === currentUser?.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    switchProfile(p.id);
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                    isActive
                      ? 'bg-indigo-600/20 border-indigo-500/80'
                      : 'bg-slate-800/40 border-white/5 hover:bg-slate-800/80 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">{p.name}</span>
                      <span className="text-[11px] text-slate-400">{p.title}</span>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="text-[10px] font-mono text-indigo-400 font-bold px-2 py-1 bg-indigo-500/10 rounded border border-indigo-400/30">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 hover:text-white">Switch</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Footer / Logout */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
          <ClayButton
            variant="danger"
            size="sm"
            onClick={() => {
              onClose();
              logout();
            }}
            icon={LogOut}
          >
            End Investigator Session
          </ClayButton>
          <ClayButton variant="glass" size="sm" onClick={onClose}>
            Close
          </ClayButton>
        </div>

      </div>
    </div>
  );
}
