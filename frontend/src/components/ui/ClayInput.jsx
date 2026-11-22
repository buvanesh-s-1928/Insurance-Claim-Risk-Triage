import React from 'react';

export function ClayInput({ label, sublabel, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
          <span>{label}</span>
          {sublabel && <span className="text-[11px] font-normal text-slate-400">{sublabel}</span>}
        </label>
      )}
      <input
        className={`w-full px-3.5 py-2 text-sm bg-slate-100/80 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 shadow-clay-inset focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all ${
          error ? 'border-red-400 ring-2 ring-red-400/20' : ''
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
    </div>
  );
}

export function ClaySelect({ label, sublabel, options = [], className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
          <span>{label}</span>
          {sublabel && <span className="text-[11px] font-normal text-slate-400">{sublabel}</span>}
        </label>
      )}
      <select
        className={`w-full px-3.5 py-2 text-sm bg-slate-100/80 rounded-xl border border-slate-200 text-slate-900 shadow-clay-inset focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer ${className}`}
        {...props}
      >
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const text = typeof opt === 'object' ? opt.label : opt;
          return (
            <option key={val} value={val}>
              {text}
            </option>
          );
        })}
      </select>
    </div>
  );
}
