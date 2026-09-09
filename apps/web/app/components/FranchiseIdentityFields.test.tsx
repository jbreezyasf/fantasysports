import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FranchiseCrest, franchiseAvatarOptions } from './FranchiseCrest';
import { FranchiseIdentityFields } from './FranchiseIdentityFields';

describe('FranchiseIdentityFields', () => {
  it('renders selectable original avatar options with a persisted field name', () => {
    const html = renderToStaticMarkup(<FranchiseIdentityFields />);

    expect(franchiseAvatarOptions.map(option => option.key)).toEqual(['classic', 'crown', 'tower', 'orbit']);
    expect(html).toContain('name="avatar_key"');
    expect(html).toContain('value="classic"');
    expect(html).toContain('value="crown"');
    expect(html).toContain('value="tower"');
    expect(html).toContain('value="orbit"');
    expect(html).toContain('Choose your franchise mark');
  });

  it('renders distinct deterministic crest motifs for different avatar choices', () => {
    const classic = renderToStaticMarkup(<FranchiseCrest name="Atlanta Phantoms" abbreviation="ATL" avatarKey="classic" />);
    const tower = renderToStaticMarkup(<FranchiseCrest name="Atlanta Phantoms" abbreviation="ATL" avatarKey="tower" />);

    expect(classic).toContain('crest-classic-');
    expect(tower).toContain('crest-tower-');
    expect(tower).toContain('M45 22h30l7 35H38Z');
    expect(classic).not.toEqual(tower);
  });
});
