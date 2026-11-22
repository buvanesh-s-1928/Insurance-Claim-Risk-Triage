import React from 'react';

export default function RiskPill({ band, className = '', showPulse = true }) {
  const normBand = (band || 'Low').toLowerCase();

  if (normBand === 'high') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-red-500 text-white font-mono text-xs font-bold shadow-clay-badge-high tracking-wider uppercase ${className}`}>
        {showPulse && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
        High
      </span>
    );
  }

  if (normBand === 'medium' || normBand === 'med') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-mono text-xs font-bold shadow-clay-badge-med tracking-wider uppercase ${className}`}>
        {showPulse && <span className="w-1.5 h-1.5 rounded-full bg-amber-100" />}
        Medium
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-mono text-xs font-bold shadow-clay-badge-low tracking-wider uppercase ${className}`}>
      {showPulse && <span className="w-1.5 h-1.5 rounded-full bg-emerald-100" />}
      Low
    </span>
  );
}
