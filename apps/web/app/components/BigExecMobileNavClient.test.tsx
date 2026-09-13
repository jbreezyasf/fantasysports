import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BigExecMobileNavClient from './BigExecMobileNavClient';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/leagues/league-1/players')
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

  it('binds active styling to the matched route instead of child position', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<BigExecMobileNavClient items={[
      { label: 'Home', icon: '⌂', href: '/dashboard', match: 'exact' },
      { label: 'Team', icon: 'J', href: '/franchises/franchise-1/team', match: 'prefix', activePrefixes: ['/franchises/franchise-1'] },
      { label: 'Players', icon: '⌕', href: '/leagues/league-1/players', match: 'prefix' }
    ]} />);

    expect(html).toMatch(/data-nav-item="Players"[^>]+aria-current="page"/);
    expect(html).not.toMatch(/data-nav-item="Team"[^>]+aria-current="page"/);
  });

  it('can link to a fallback route without incorrectly marking it current', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<BigExecMobileNavClient items={[
      { label: 'Matchup', icon: 'matchup', href: '/leagues/league-1/players', match: 'manual', activePrefixes: ['/matchups/'] },
      { label: 'League', icon: 'league', href: '/leagues/league-1/players', match: 'prefix' }
    ]} />);
    expect(html).toMatch(/data-nav-item="League"[^>]+aria-current="page"/);
    expect(html).not.toMatch(/data-nav-item="Matchup"[^>]+aria-current="page"/);
  });
});
