import React from 'react';

interface DarkButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

export function DarkButton({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: DarkButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary)] text-white rounded-xl px-5 py-2.5'
      : 'bg-transparent hover:bg-[var(--color-surface-high)] text-[var(--color-on-surface-variant)] rounded-lg px-4 py-2';

  return (
    <button
      className={`font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
