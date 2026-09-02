import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BigExecMobileNavClient from './BigExecMobileNavClient';

vi.mock('next/navigation', () => ({
  usePathname: () => '/leagues/league-1/players'
}));

describe('BigExecMobileNavClient', () => {
  it('marks the current mobile navigation item and labels unavailable destinations', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<BigExecMobileNavClient items={[
      { label: 'Home', icon: '⌂', href: '/dashboard', match: 'exact' },
      { label: 'Team', icon: 'J', unavailableLabel: 'Team unavailable until you own a franchise' },
      { label: 'Players', icon: '⌕', href: '/leagues/league-1/players', match: 'prefix' }
    ]} />);

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Players, current section');
    expect(html).toContain('Current section: Players');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Team unavailable until you own a franchise');
  });
});
