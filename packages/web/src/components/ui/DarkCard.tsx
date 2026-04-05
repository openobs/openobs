import React from 'react';

interface DarkCardProps {
  className?: string;
  children: React.ReactNode;
}

export function DarkCard({ className = '', children }: DarkCardProps) {
  return (
    <div className={`bg-[var(--color-surface-highest)] rounded-2xl border border-[var(--color-outline-variant)] p-4 ${className}`}>
      {children}
    </div>
  );
}
