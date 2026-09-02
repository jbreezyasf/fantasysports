'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { VisuallyHidden } from './accessibility';

export type BigExecMobileNavItem = {
  label: string;
  icon: string;
  href?: string;
  match?: 'exact' | 'prefix';
  unavailableLabel?: string;
};

export default function BigExecMobileNavClient({ items }: { items: BigExecMobileNavItem[] }) {
  const pathname = usePathname();
  const isActive = (item: BigExecMobileNavItem) => {
    if (!item.href) return false;
    return item.match === 'prefix' ? pathname.startsWith(item.href) : pathname === item.href;
  };
  const current = items.find(isActive);

  return <nav className="mobileGameNav" aria-label="Big Exec primary navigation">
    {current && <VisuallyHidden>Current section: {current.label}</VisuallyHidden>}
    {items.map(item => {
      const active = isActive(item);
      if (!item.href) {
        return <span aria-disabled="true" aria-label={item.unavailableLabel ?? `${item.label} unavailable`} key={item.label}>
          <b aria-hidden="true">{item.icon}</b><small>{item.label}</small>
        </span>;
      }
      return <a href={item.href} aria-current={active ? 'page' : undefined} aria-label={`${item.label}${active ? ', current section' : ''}`} key={item.label}>
        <b aria-hidden="true">{item.icon}</b><small>{item.label}</small>
      </a>;
    })}
  </nav>;
}
