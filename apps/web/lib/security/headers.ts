// Baseline HTTP security headers, applied to every route from next.config.ts.
// Keep this file dependency-free: it is imported by the Next config at build time.

const DEFAULT_SUPABASE_URL = 'https://njjiqdqhmcbxblwhfade.supabase.co';

export type SecurityHeader = { key: string; value: string };

function supabaseOrigins(supabaseUrl: string | undefined) {
  try {
    const url = new URL(supabaseUrl?.trim() || DEFAULT_SUPABASE_URL);
    // Realtime (draft room, locker room) connects over a websocket to the same host.
    return { http: url.origin, ws: `${url.protocol === 'http:' ? 'ws' : 'wss'}://${url.host}` };
  } catch {
    const url = new URL(DEFAULT_SUPABASE_URL);
    return { http: url.origin, ws: `wss://${url.host}` };
  }
}

// Built from what the app loads on main today:
// - scripts/styles: same-origin Next bundles plus Next's inline bootstrap scripts and React
//   inline style attributes (no nonces yet, hence 'unsafe-inline');
// - images: same-origin /brand, /icons, /environments, next/image, data: and blob:;
// - fonts: none external (system font stacks);
// - connect: same-origin API/server actions and the Supabase project (REST, auth, realtime);
// - media: recap videos whose `storage_key` is an absolute URL on a host not fixed in code;
// - worker/manifest: the same-origin PWA service worker (/sw.js) and /manifest.webmanifest.
export function buildContentSecurityPolicy(options: { supabaseUrl?: string; isDevelopment?: boolean } = {}) {
  const supabase = supabaseOrigins(options.supabaseUrl);
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'unsafe-inline'", ...(options.isDevelopment ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', supabase.http]],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", supabase.http, supabase.ws]],
    ['media-src', ["'self'", 'blob:', 'https:']],
    ['worker-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['frame-src', ["'none'"]],
    ['frame-ancestors', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['object-src', ["'none'"]]
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

export function buildSecurityHeaders(options: { supabaseUrl?: string; isDevelopment?: boolean } = {}): SecurityHeader[] {
  return [
    // Two years, matching what Vercel already sends. includeSubDomains/preload are owner decisions.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    // microphone stays allowed for this origin: the voice advisor uses browser SpeechRecognition.
    // Features the app does not use are switched off.
    { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), browsing-topics=()' },
    // Report-only: violations are reported in the browser console and nothing is blocked.
    { key: 'Content-Security-Policy-Report-Only', value: buildContentSecurityPolicy(options) }
  ];
}
