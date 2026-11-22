import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ClayButton from '../components/ui/ClayButton';
import { Shield, Lock, CheckCircle2, UserCheck, ShieldAlert, Cpu } from 'lucide-react';

export default function LoginView() {
  const { login, allProfiles } = useAuth();
  const [selectedProfileId, setSelectedProfileId] = useState(allProfiles[0].id);
  const [email, setEmail] = useState(allProfiles[0].email);
  const [password, setPassword] = useState('••••••••••••');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSelectProfile = (p) => {
    setSelectedProfileId(p.id);
    setEmail(p.email);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setTimeout(() => {
      login(selectedProfileId);
      setIsAuthenticating(false);
    }, 600);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-obsidian-950">
      {/* Dynamic Ambient Background Refractions */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-slate-900/60 rounded-full blur-2xl pointer-events-none" />

      {/* Main Glassmorphic Login Portal */}
      <div className="relative z-10 w-full max-w-xl">
        <div className="rounded-3xl bg-slate-900/85 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.15)] text-slate-100 flex flex-col gap-6">
          
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-[0_8px_20px_rgba(79,70,229,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)] border border-indigo-400/40">
              <Shield className="w-9 h-9 text-white stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Claim Triage</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center justify-center gap-2">
                <span>AI-Driven Fraud Risk Stratification</span>
                <span className="w-1 h-1 rounded-full bg-slate-500" />
                <span className="text-indigo-400 font-mono font-medium">SIU Portal v4.8</span>
              </p>
            </div>
          </div>

          {/* Quick Investigator Profile Selection */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Select Active Investigator Persona</span>
              <span className="text-[11px] font-mono text-indigo-400">One-Click Session</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {allProfiles.map((p) => {
                const isSelected = p.id === selectedProfileId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProfile(p)}
                    className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/80 shadow-[0_4px_16px_rgba(79,70,229,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                        : 'bg-slate-800/50 border-white/5 hover:bg-slate-800/80 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2 w-full">
                      <img
                        src={p.avatar}
                        alt={p.name}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-white/20"
                      />
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${p.badgeColor}`}>
                        {p.badge}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-white leading-tight">{p.name}</span>
                    <span className="text-[10px] text-slate-400 leading-tight mt-0.5">{p.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Authentication Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Investigator ID / Email</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 rounded-xl border border-white/10 text-white text-sm shadow-[inset_2px_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 font-mono transition-all"
                  required
                />
                <UserCheck className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Security Credential / Token</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 rounded-xl border border-white/10 text-white text-sm shadow-[inset_2px_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 font-mono transition-all"
                  required
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <ClayButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={isAuthenticating}
              className="mt-2 w-full py-3 text-base shadow-[0_10px_25px_-5px_rgba(79,70,229,0.5)]"
            >
              {isAuthenticating ? 'Verifying Credentials...' : 'Authenticate & Enter Triage Console'}
            </ClayButton>
          </form>

          {/* Protocol Badges Footer */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Model Governance Fair-Insure 2024</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>SHAP TreeExplainer Active</span>
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
