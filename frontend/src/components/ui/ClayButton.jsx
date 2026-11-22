import React from 'react';

export default function ClayButton({
  children,
  variant = 'primary', // 'primary' | 'danger' | 'success' | 'glass'
  size = 'md',
  className = '',
  icon: Icon,
  disabled = false,
  ...props
}) {
  const baseClasses = "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-2.5 text-base gap-2.5",
  }[size] || "px-4 py-2 text-sm gap-2";

  const variantClasses = {
    primary: "bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-[0_8px_18px_-4px_rgba(79,70,229,0.4),0_3px_6px_-1px_rgba(79,70,229,0.2),inset_0_2px_3px_rgba(255,255,255,0.45),inset_0_-3px_4px_rgba(15,23,42,0.25)] hover:shadow-[0_12px_24px_-4px_rgba(79,70,229,0.48),0_4px_8px_-1px_rgba(79,70,229,0.25),inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-3px_4px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_4px_8px_-2px_rgba(79,70,229,0.3),inset_0_2px_3px_rgba(0,0,0,0.25)]",
    danger: "bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_8px_18px_-4px_rgba(220,38,38,0.4),0_3px_6px_-1px_rgba(220,38,38,0.2),inset_0_2px_3px_rgba(255,255,255,0.45),inset_0_-3px_4px_rgba(15,23,42,0.25)] hover:shadow-[0_12px_24px_-4px_rgba(220,38,38,0.48),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_4px_8px_-2px_rgba(220,38,38,0.3),inset_0_2px_3px_rgba(0,0,0,0.25)]",
    success: "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_8px_18px_-4px_rgba(16,185,129,0.4),0_3px_6px_-1px_rgba(16,185,129,0.2),inset_0_2px_3px_rgba(255,255,255,0.45),inset_0_-3px_4px_rgba(15,23,42,0.25)] hover:shadow-[0_12px_24px_-4px_rgba(16,185,129,0.48),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_4px_8px_-2px_rgba(16,185,129,0.3),inset_0_2px_3px_rgba(0,0,0,0.25)]",
    glass: "bg-white/80 backdrop-blur-md border border-white text-slate-800 shadow-[0_4px_12px_rgba(15,23,42,0.06),inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-2px_3px_rgba(15,23,42,0.04)] hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.1),inset_0_1px_3px_#ffffff] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_2px_6px_rgba(15,23,42,0.08)]",
  }[variant] || "";

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      {children}
    </button>
  );
}
