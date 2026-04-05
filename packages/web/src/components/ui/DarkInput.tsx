import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  as?: 'input';
};

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  as: 'textarea';
};

type DarkInputProps = InputProps | TextareaProps;

const baseClass =
  'w-full bg-[var(--color-surface-high)] rounded-xl border border-[var(--color-outline-variant)] px-4 py-3 text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:border-[var(--color-primary)] focus:ring focus:ring-[var(--color-primary)]/20 outline-none transition-colors';

export function DarkInput(props: DarkInputProps) {
  if (props.as === 'textarea') {
    const { as, className = '', ...rest } = props;
    return <textarea className={`${baseClass} ${className} resize-none`} {...rest} />;
  }
  const { as, className = '', ...rest } = props as InputProps;
  return <input className={`${baseClass} ${className}`} {...rest} />;
}
