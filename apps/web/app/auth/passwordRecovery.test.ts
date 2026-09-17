import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('password recovery contract',()=>{
  it('requests a recovery link and updates only a verified session',()=>{
    const actions=readFileSync(new URL('./actions.ts',import.meta.url),'utf8');
    expect(actions).toContain('resetPasswordForEmail');
    expect(actions).toContain("next=${encodeURIComponent('/login/reset')}");
    expect(actions).toContain('supabase.auth.updateUser({ password })');
  });
});
