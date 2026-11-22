import React from 'react';

export default function GlassCard({
  children,
  className = '',
  hoverEffect = false,
  ...props
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 p-6 shadow-glass-panel ${
        hoverEffect ? 'hover:-translate-y-0.5 hover:shadow-clay-card-hover transition-all duration-200' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
