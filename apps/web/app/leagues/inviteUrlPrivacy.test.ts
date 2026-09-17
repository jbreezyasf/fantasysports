import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('league invitation URL privacy',()=>{
  it('does not place invite tokens or invitee emails in post-action redirects',()=>{
    const actions=readFileSync(new URL('./actions.ts',import.meta.url),'utf8');
    const page=readFileSync(new URL('./[leagueId]/page.tsx',import.meta.url),'utf8');
    expect(actions).not.toContain('invite_created=1&invite_token=');
    expect(actions).not.toContain('invite_resent=1&invite_email=');
    expect(page).not.toContain('invite_token?: string; invite_email?: string');
  });
});
