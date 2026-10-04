import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { buildContentSecurityPolicy, buildSecurityHeaders } from './headers';

function directives(policy: string) {
  return Object.fromEntries(policy.split('; ').map(part => {
    const [name, ...values] = part.split(' ');
    return [name, values];
  }));
}

describe('baseline security headers', () => {
  it('are applied to every route by the Next config', async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe('/:path*');
    const headers = Object.fromEntries(rules[0].headers.map(header => [header.key, header.value]));
    expect(headers['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}$/);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(headers['Content-Security-Policy-Report-Only']).toBeTruthy();
  });

  it('never enforces the content security policy', () => {
    const keys = buildSecurityHeaders().map(header => header.key.toLowerCase());
    expect(keys).toContain('content-security-policy-report-only');
    expect(keys).not.toContain('content-security-policy');
  });

  it('keeps the microphone available to the voice advisor and disables unused features', () => {
    const policy = buildSecurityHeaders().find(header => header.key === 'Permissions-Policy')!.value;
    expect(policy).toContain('microphone=(self)');
    expect(policy).not.toContain('microphone=()');
    expect(policy).toContain('camera=()');
    expect(policy).toContain('geolocation=()');
  });

  it('allows what the app loads: Supabase REST and realtime, PWA worker and manifest, inline styles', () => {
    const csp = directives(buildContentSecurityPolicy({ supabaseUrl: 'https://example-project.supabase.co' }));
    expect(csp['connect-src']).toEqual(["'self'", 'https://example-project.supabase.co', 'wss://example-project.supabase.co']);
    expect(csp['worker-src']).toEqual(["'self'"]);
    expect(csp['manifest-src']).toEqual(["'self'"]);
    expect(csp['style-src']).toContain("'unsafe-inline'");
    expect(csp['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
    expect(csp['frame-ancestors']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['script-src']).not.toContain("'unsafe-eval'");
  });

  it('uses ws for a local http Supabase URL and falls back to the default project on a bad URL', () => {
    expect(directives(buildContentSecurityPolicy({ supabaseUrl: 'http://127.0.0.1:54321' }))['connect-src']).toContain('ws://127.0.0.1:54321');
    expect(directives(buildContentSecurityPolicy({ supabaseUrl: 'not a url' }))['connect-src']).toContain('https://njjiqdqhmcbxblwhfade.supabase.co');
  });

  it('only allows eval in development', () => {
    expect(directives(buildContentSecurityPolicy({ isDevelopment: true }))['script-src']).toContain("'unsafe-eval'");
  });
});
