import React from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type WithChildren = {
  children: ReactNode;
  className?: string;
};

export function VisuallyHidden({ children, className = '' }: WithChildren) {
  return <span className={`srOnly ${className}`.trim()}>{children}</span>;
}

export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
}: {
  href?: string;
  children?: ReactNode;
}) {
  return (
    <a className="skipLink" href={href}>
      {children}
    </a>
  );
}

export function MainContent({ children, className = '' }: WithChildren) {
  return (
    <div id="main-content" className={className || undefined} tabIndex={-1}>
      {children}
    </div>
  );
}

export function StatusMessage({
  tone,
  children,
  className = '',
  id,
  focusTarget = false,
}: WithChildren & {
  tone: 'success' | 'error' | 'info';
  id?: string;
  focusTarget?: boolean;
}) {
  const role = tone === 'error' ? 'alert' : 'status';
  const toneClass = tone === 'error' ? 'errorNotice' : 'successNotice';
  return (
    <p
      id={id}
      className={`${toneClass} ${className}`.trim()}
      role={role}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      tabIndex={focusTarget ? -1 : undefined}
    >
      {children}
    </p>
  );
}

export function LiveRegion({
  children,
  politeness = 'polite',
  atomic = true,
  className = 'srOnly',
}: WithChildren & {
  politeness?: 'polite' | 'assertive';
  atomic?: boolean;
}) {
  return (
    <div className={className} aria-live={politeness} aria-atomic={atomic}>
      {children}
    </div>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  pressed,
  expanded,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed' | 'aria-expanded'> & {
  label: string;
  children: ReactNode;
  pressed?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      {...props}
      className={className || undefined}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
    >
      {children}
    </button>
  );
}

export function A11yNote({ children, className = '' }: WithChildren & HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`srOnly ${className}`.trim()}>{children}</p>;
}

export function StatusBadge({
  children,
  label,
  state,
  className = '',
}: WithChildren & {
  label?: string;
  state?: 'selected' | 'pending' | 'active' | 'inactive' | 'locked' | 'available' | 'rostered' | 'live' | 'final';
}) {
  const stateLabel = state ? state.replaceAll('_', ' ') : undefined;
  const accessibleLabel = label ?? (typeof children === 'string' && stateLabel ? `${children}, ${stateLabel}` : undefined);
  return (
    <span
      className={`statusBadge ${state ? `is-${state}` : ''} ${className}`.trim()}
      aria-label={accessibleLabel}
      data-state={state}
    >
      {children}
    </span>
  );
}
