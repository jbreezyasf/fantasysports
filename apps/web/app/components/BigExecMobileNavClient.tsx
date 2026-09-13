'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { VisuallyHidden } from './accessibility';

export type BigExecMobileNavItem = {
  label: string;
  icon: string;
  href?: string;
  match?: 'exact' | 'prefix' | 'manual';
  activePrefixes?: string[];
  unavailableLabel?: string;
};

function NavIcon({name}:{name:string}) {
  const common={width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  if(name==='office')return <svg {...common}><path d="M4 21V7l8-4 8 4v14"/><path d="M8 21v-4h8v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/></svg>;
  if(name==='matchup')return <svg {...common}><path d="M7 5 3 9l4 4M17 19l4-4-4-4M4 9h7a4 4 0 0 1 4 4v2M20 15h-7a4 4 0 0 1-4-4V9"/></svg>;
  if(name==='locker')return <svg {...common}><path d="M5 3h14v18H5zM9 3v18M9 8h10M9 14h10"/><path d="M7 11h.01M12 11h.01M12 17h.01"/></svg>;
  if(name==='league')return <svg {...common}><path d="M4 5h16v14H4zM4 10h16M10 5v14"/><path d="M13 13h4M13 16h3M7 13h.01M7 16h.01"/></svg>;
  if(name==='stadium')return <svg {...common}><path d="M3 8c3-4 15-4 18 0v9c-3 4-15 4-18 0Z"/><ellipse cx="12" cy="12.5" rx="5" ry="2.5"/><path d="M3 8c3 3 15 3 18 0M7 6v3M12 5v4M17 6v3"/></svg>;
  return <span aria-hidden="true">{name}</span>;
}

export default function BigExecMobileNavClient({ items }: { items: BigExecMobileNavItem[] }) {
  const pathname = usePathname();
  const isActive = (item: BigExecMobileNavItem) => {
    if (!item.href) return false;
    if (item.activePrefixes?.some(prefix => pathname.startsWith(prefix))) return true;
    if(item.match==='manual')return false;
    return item.match === 'prefix' ? pathname.startsWith(item.href) : pathname === item.href;
  };
  const current = items.find(isActive);

  return <nav className="mobileGameNav" aria-label="Big Exec primary navigation">
    {current && <VisuallyHidden>Current section: {current.label}</VisuallyHidden>}
    {items.map(item => {
      const active = isActive(item);
      if (!item.href) {
        return <span aria-disabled="true" aria-label={item.unavailableLabel ?? `${item.label} unavailable`} key={item.label}>
          <b aria-hidden="true"><NavIcon name={item.icon}/></b><small>{item.label}</small>
        </span>;
      }
      return <a data-nav-item={item.label} href={item.href} aria-current={active ? 'page' : undefined} aria-label={`${item.label}${active ? ', current section' : ''}`} key={item.label}>
        <b aria-hidden="true"><NavIcon name={item.icon}/></b><small>{item.label}</small>
      </a>;
    })}
  </nav>;
}
