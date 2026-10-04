/* Local-only visual harness for the notification settings section, the unsubscribe page and
   the operator announcement pages. It renders the real page components with synthetic data.
   No authentication bypass is added to the app; the database, the ops gate, the server actions
   and the browser push APIs are replaced inside this script only. Nothing is sent and nothing
   is written anywhere except qa-artifacts/.

   Run:  QA_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/qa-notifications.cjs */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), Module = require('node:module');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'apps/web'), app = path.join(web, 'app');
const out = path.join(root, 'qa-artifacts/2026-10-04-notifications');
fs.mkdirSync(out, { recursive: true });

const LEAGUE = '11111111-1111-4111-8111-111111111111', SEASON = '257699ec-ef0d-466f-95cb-ec10a5b34d69', NOTE = '5b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10';
const PORT = 4319;

// ---- module replacements shared by the server-side and browser bundles ---------------------
const stubs = {
  'next/navigation': `export const redirect=(to)=>{throw new Error('REDIRECT '+to)};export const notFound=()=>{throw new Error('NOT_FOUND')};export const unstable_rethrow=()=>{};export const usePathname=()=>globalThis.__QA_PATH||'/settings/notifications';export const useRouter=()=>({refresh(){},push(){}});`,
  'next/cache': `export const revalidatePath=()=>{};`,
  'next/image': `import React from 'react';export default function Image({priority,...props}){return React.createElement('img',props)}`,
  'server-only': `export {};`,
  'web-push': `export default {sendNotification(){throw new Error('web-push is disabled in the visual harness')}};`,
  db: `
    const state=()=>globalThis.__QA_STATE||{tables:{},rpcs:{}};
    const missing=(name)=>({data:null,error:{code:'PGRST205',message:"Could not find the table 'public."+name+"' in the schema cache"}});
    function client(){return {auth:{getUser:async()=>({data:{user:state().user??null}})},
      from(table){const result=table in state().tables?{data:state().tables[table],error:null}:missing(table);let single=false;
        const q=new Proxy({}, {get(_,key){if(key==='then')return (resolve)=>resolve(single?{...result,data:Array.isArray(result.data)?result.data[0]??null:result.data}:result);if(key==='maybeSingle'||key==='single')return()=>{single=true;return q};return()=>q}});return q},
      async rpc(name){return name in state().rpcs?{data:state().rpcs[name],error:null}:{data:null,error:{code:'PGRST202',message:'Could not find the function public.'+name+' in the schema cache'}}}}}
    export const createClient=async()=>client();export const createAdminClient=()=>{if(state().noServiceRole)throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');return client()};`,
  opsGate: `export const requireAnnouncementOperator=async()=>({user:{id:'qa-operator',email:'operator@visual-fixture.test'},role:'super_admin',permissions:[]});`,
  actions: `const noop=name=>async()=>{throw new Error('Server action "'+name+'" is disabled in the visual harness')};
    export const signOut=noop('signOut'),askHeaderAssistantGm=noop('ask'),saveNotificationPreferences=noop('save'),createAnnouncementDraft=noop('create'),saveAnnouncementDraft=noop('saveDraft'),cancelAnnouncement=noop('cancel'),dryRunAnnouncement=noop('dryRun'),sendTestAnnouncement=noop('test'),sendLiveAnnouncement=noop('live');`,
  mobileNav: `import React from 'react';import Nav from '${path.join(app, 'components/BigExecMobileNavClient.tsx')}';
    export default function BigExecMobileNav({leagueId}){return React.createElement(Nav,{items:[{label:'Front Office',icon:'office',href:'/leagues/'+leagueId,match:'exact'},{label:'Matchup',icon:'matchup',href:'/matchups/fixture',match:'prefix'},{label:'Lineup',icon:'league',href:'/franchises/fixture/team',match:'prefix'},{label:'Locker Room',icon:'locker',href:'/leagues/'+leagueId+'/locker-room',match:'prefix'},{label:'More',icon:'more',href:'/leagues/'+leagueId+'/schedule',match:'manual',menu:true}]})}`
};
const plugin = {
  name: 'visual-fixture',
  setup(build) {
    const to = key => () => ({ path: key, namespace: 'fixture' });
    for (const name of ['next/navigation', 'next/cache', 'next/image', 'server-only', 'web-push']) build.onResolve({ filter: new RegExp('^' + name.replace('/', '\\/') + '$') }, to(name));
    build.onResolve({ filter: /supabase\/(server|admin|client)$/ }, to('db'));
    build.onResolve({ filter: /ops\/permissions$/ }, to('opsGate'));
    build.onResolve({ filter: /\/(actions|assistantGmActions)$/ }, to('actions'));
    build.onResolve({ filter: /\/BigExecMobileNav$/ }, to('mobileNav'));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  }
};
const common = { bundle: true, write: false, jsx: 'automatic', plugins: [plugin], outdir: path.join(root, '.qa-out'), loader: { '.css': 'css', '.module.css': 'local-css' }, logLevel: 'silent' };

const serverEntry = `
  import React from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import SettingsPage from '${path.join(app, 'settings/notifications/page.tsx')}';
  import UnsubscribePage from '${path.join(app, 'unsubscribe/page.tsx')}';
  import OpsLayout from '${path.join(app, 'ops/layout.tsx')}';
  import OpsList from '${path.join(app, 'ops/announcements/page.tsx')}';
  import OpsDetail from '${path.join(app, 'ops/announcements/[notificationId]/page.tsx')}';
  const islands = [];
  // Client components become "islands": the browser bundle renders them with the same props.
  function island(node) {
    if (Array.isArray(node)) return node.map(island);
    if (!React.isValidElement(node)) return node;
    const name = typeof node.type === 'function' ? node.type.name : '';
    if (name === 'NotificationSettings' || name === 'SendConfirmation') {
      const id = 'island-' + islands.length;
      const { saveAction, action, ...props } = node.props;
      islands.push({ id, name, props });
      return React.createElement('div', { id, key: node.key ?? id, 'data-island': name });
    }
    return node.props && node.props.children ? React.cloneElement(node, {}, React.Children.map(node.props.children, island)) : node;
  }
  export async function render(route, query) {
    islands.length = 0;
    let tree;
    if (route === '/settings/notifications') tree = await SettingsPage();
    else if (route === '/unsubscribe') tree = await UnsubscribePage({ searchParams: Promise.resolve(query) });
    else if (route === '/ops/announcements') tree = React.createElement(OpsLayout, null, island(await OpsList({ searchParams: Promise.resolve(query) })));
    else tree = React.createElement(OpsLayout, null, island(await OpsDetail({ params: Promise.resolve({ notificationId: '${NOTE}' }), searchParams: Promise.resolve(query) })));
    return { html: renderToStaticMarkup(island(tree)), islands: islands.slice() };
  }`;

const clientEntry = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { LocaleProvider } from '${path.join(app, 'components/LocaleProvider.tsx')}';
  import ScreenReaderAnnouncer from '${path.join(app, 'components/ScreenReaderAnnouncer.tsx')}';
  import PwaInstallPrompt from '${path.join(app, 'components/PwaInstallPrompt.tsx')}';
  import NotificationSettings from '${path.join(app, 'settings/notifications/NotificationSettings.tsx')}';
  import SendConfirmation from '${path.join(app, 'ops/announcements/SendConfirmation.tsx')}';
  const components = { NotificationSettings, SendConfirmation };
  // Stand-ins for the server actions: they record the submitted form and write nothing.
  const record = name => async (a, b) => {
    const data = b ?? a;
    window.qaActions = [...(window.qaActions || []), { name, data: Object.fromEntries(data) }];
    if (name === 'save') return window.qaSaveFails ? { status: 'error', message: 'Your preferences were not saved. Please try again.', stamp: Date.now() } : { status: 'saved', message: 'Notification preferences saved.', stamp: Date.now() };
  };
  // The same order as app/layout.tsx: provider > announcer, page, install prompt.
  createRoot(document.getElementById('qa-announcer')).render(React.createElement(LocaleProvider, null, React.createElement(ScreenReaderAnnouncer)));
  createRoot(document.getElementById('qa-install')).render(React.createElement(LocaleProvider, null, React.createElement(PwaInstallPrompt)));
  for (const item of JSON.parse(document.getElementById('islands-data').textContent)) {
    const extra = item.name === 'NotificationSettings' ? { saveAction: record('save') } : { action: record('live') };
    createRoot(document.getElementById(item.id)).render(React.createElement(LocaleProvider, null, React.createElement(components[item.name], { ...item.props, ...extra })));
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.qaReady = true; }));`;

// ---- synthetic data --------------------------------------------------------------------------
const user = { id: 'qa-user', email: 'manager@visual-fixture.test' };
const prefRow = { email_enabled: true, push_enabled: false, league_announcements: true, lineup_lock_reminder: true, score_final: true, trade_offer: true, waiver_result: true, weekly_recap: true, locale: 'en' };
const devices = [{ id: 'd1', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36', created_at: '2026-10-01T15:00:00Z', last_success_at: null }];
const settingsState = (extra = {}) => ({ user, tables: { league_members: [{ league_id: LEAGUE, role: 'manager' }], notification_preferences: [prefRow], push_subscriptions: [], ...extra }, rpcs: {} });

function opsState(status, seed, deliveries = []) {
  const audience = Array.from({ length: 10 }, (_, i) => ({ user_id: `00000000-0000-4000-8000-0000000000${String(i + 10)}`, email: `manager${i + 1}@visual-fixture.test`, email_enabled: i !== 7, push_enabled: i < 3, league_announcements: i !== 8, lineup_lock_reminder: true, score_final: true, trade_offer: true, waiver_result: true, weekly_recap: true, locale: i === 1 ? 'es-419' : 'en' }));
  const row = { id: NOTE, kind: 'league_announcement', category: 'league_announcements', league_season_id: SEASON, title: seed.en.title, body: seed.en.body, push_title: seed.en.pushTitle, push_body: seed.en.pushBody, link: seed.link, variants: { 'es-419': { title: seed.es.title, body: seed.es.body, push_title: seed.es.pushTitle, push_body: seed.es.pushBody } }, status, created_by: 'qa-operator', created_at: '2026-10-04T12:00:00Z', sent_at: status === 'sent' ? '2026-10-04T13:00:00Z' : null, result: null };
  return {
    user: { id: 'qa-operator', email: 'operator@visual-fixture.test' },
    tables: {
      notifications: [row],
      league_seasons: [{ id: SEASON, fantasy_leagues: { name: 'Stress Test 2026' } }],
      push_subscriptions: [0, 0, 1, 2].map((n, i) => ({ id: 'sub' + i, user_id: audience[n].user_id, endpoint: 'https://push.visual-fixture.test/' + i, p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) })),
      notification_deliveries: deliveries, ops_audit_events: []
    },
    rpcs: { notification_audience: audience }
  };
}

const READY_ENV = { RESEND_BIGEXEC_API_KEY: 'visual-fixture-not-a-key', NOTIFICATIONS_UNSUBSCRIBE_SECRET: 'visual-fixture-secret-visual-fixture-secret', VAPID_PUBLIC_KEY: 'BFixturePublicKeyFixturePublicKeyFixturePublicKeyFixturePublicKeyFixturePublicKeyFixtur', VAPID_PRIVATE_KEY: 'fixture', VAPID_SUBJECT: 'mailto:owner@visual-fixture.test', NOTIFICATIONS_SEND_ENABLED: 'true', NEXT_PUBLIC_APP_URL: 'https://bigexecfs.com' };
const ENV_KEYS = [...Object.keys(READY_ENV), 'EMAIL_POSTAL_ADDRESS'];
function setEnv(values) { for (const key of ENV_KEYS) delete process.env[key]; Object.assign(process.env, values); }

// Browser-side stand-ins for the push APIs, installed before any page script runs.
function fakePush({ permission = 'default', subscribed = false, grant = 'granted', supported = true }) {
  window.qaPermissionRequests = 0;
  if (!supported) { delete window.PushManager; delete window.Notification; return; }
  let current = permission;
  let subscription = subscribed ? { endpoint: 'https://push.visual-fixture.test/this-device', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }; }, async unsubscribe() { subscription = null; return true; } } : null;
  const make = () => ({ endpoint: 'https://push.visual-fixture.test/this-device', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }; }, async unsubscribe() { subscription = null; return true; } });
  window.Notification = { get permission() { return current; }, async requestPermission() { window.qaPermissionRequests += 1; current = grant; return grant; } };
  window.PushManager = function PushManager() {};
  const registration = { pushManager: { async getSubscription() { return subscription; }, async subscribe() { window.qaSubscribeCalls = (window.qaSubscribeCalls || 0) + 1; subscription = make(); return subscription; } } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { async getRegistration() { return registration; }, async register() { return registration; }, ready: Promise.resolve(registration) } });
}

(async () => {
  const server = await esbuild.build({ ...common, stdin: { contents: serverEntry, resolveDir: root, loader: 'jsx', sourcefile: 'qa-server.jsx' }, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-dom/*', '@supabase/*'], define: { 'process.env.NODE_ENV': '"production"' } });
  const client = await esbuild.build({ ...common, stdin: { contents: clientEntry, resolveDir: root, loader: 'jsx', sourcefile: 'qa-client.jsx' }, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const file = (result, ext) => result.outputFiles.find(item => item.path.endsWith(ext)).text;
  const serverModule = new Module(path.join(root, 'scripts/qa-server.cjs'), module);
  serverModule.filename = path.join(root, 'scripts/qa-server.cjs');
  serverModule.paths = Module._nodeModulePaths(web);
  serverModule._compile(file(server, '.js'), serverModule.filename);
  const { render } = serverModule.exports;
  const { chaosWeek2026Announcement: seed } = (() => { const ts = require('typescript'); const m = new Module('seed'); m._compile(ts.transpileModule(fs.readFileSync(path.join(web, 'lib/notifications/seeds/chaosWeek2026.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, 'seed.js'); return m.exports; })();

  const globalCss = ['globals', 'brand', 'brand-polish', 'dashboard', 'gate5', 'mobile-nav', 'forms-gate5', 'stadium-gate5', 'ops', 'product-shell'].map(name => fs.readFileSync(path.join(app, name + '.css'), 'utf8')).join('\n');
  const css = globalCss + '\n' + file(client, '.css');

  // One entry per page state. `state` feeds the stand-in database; `env` the process env.
  const routes = {};
  const page = (key, route, query, state, env) => { routes['/' + key] = { route, query, state, env: route.startsWith('/ops') && env.NEXT_PUBLIC_APP_URL ? { ...env, NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:' + PORT } : env }; };
  page('settings', '/settings/notifications', {}, settingsState(), READY_ENV);
  page('settings-devices', '/settings/notifications', {}, settingsState({ notification_preferences: [{ ...prefRow, push_enabled: true }], push_subscriptions: devices }), READY_ENV);
  page('settings-no-vapid', '/settings/notifications', {}, settingsState(), {});
  page('settings-unavailable', '/settings/notifications', {}, { user, tables: { league_members: [{ league_id: LEAGUE, role: 'manager' }] }, rpcs: {} }, READY_ENV);
  page('settings-no-league', '/settings/notifications', {}, { user, tables: { league_members: [], notification_preferences: [], push_subscriptions: [] }, rpcs: {} }, READY_ENV);
  page('unsubscribe-invalid', '/unsubscribe', { token: 'junk' }, { tables: {}, rpcs: {} }, READY_ENV);
  page('unsubscribe-done', '/unsubscribe', { state: 'done' }, { tables: {}, rpcs: {} }, READY_ENV);
  page('unsubscribe-done-es', '/unsubscribe', { state: 'done', lang: 'es' }, { tables: {}, rpcs: {} }, READY_ENV);
  page('ops-list', '/ops/announcements', {}, opsState('draft', seed), READY_ENV);
  page('ops-list-not-installed', '/ops/announcements', {}, { tables: {}, rpcs: {} }, {});
  page('ops-detail-draft', '/ops/announcements/x', { notice: 'Dry run complete. Nothing was sent. Would send: 8 email, 3 push. Skipped by preference or missing address or device: 2 email, 7 push.' }, opsState('draft', seed, [...Array(8).fill({ channel: 'email', status: 'would_send' }), ...Array(2).fill({ channel: 'email', status: 'skipped' }), ...Array(3).fill({ channel: 'push', status: 'would_send' }), ...Array(7).fill({ channel: 'push', status: 'skipped' })]), READY_ENV);
  page('ops-detail-not-ready', '/ops/announcements/x', {}, opsState('draft', seed), { NEXT_PUBLIC_APP_URL: 'https://bigexecfs.com' });
  page('ops-detail-failed', '/ops/announcements/x', { error: 'Send finished. Sent: 7 email, 3 push. Skipped: 2 email, 7 push. Already handled: 0. Expired devices removed: 0. FAILED: 1. First failure: email - Email provider error 429: rate limited The announcement stays in "sending"; press Send again to retry only the failed recipients.' }, opsState('sending', seed, [...Array(7).fill({ channel: 'email', status: 'sent' }), { channel: 'email', status: 'failed' }, ...Array(2).fill({ channel: 'email', status: 'skipped' }), ...Array(3).fill({ channel: 'push', status: 'sent' }), ...Array(7).fill({ channel: 'push', status: 'skipped' })]), READY_ENV);
  page('ops-detail-sent', '/ops/announcements/x', {}, opsState('sent', seed, [...Array(8).fill({ channel: 'email', status: 'sent' }), ...Array(2).fill({ channel: 'email', status: 'skipped' }), ...Array(3).fill({ channel: 'push', status: 'sent' }), ...Array(7).fill({ channel: 'push', status: 'skipped' })]), READY_ENV);

  // The unsubscribe confirmation needs a token signed with the fixture secret.
  const { createHmac } = require('node:crypto');
  const payload = Buffer.from('0b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10').toString('base64url');
  const token = `v1.${payload}.${createHmac('sha256', READY_ENV.NOTIFICATIONS_UNSUBSCRIBE_SECRET).update('v1.' + payload).digest('base64url')}`;
  page('unsubscribe-confirm', '/unsubscribe', { token }, { tables: {}, rpcs: {} }, READY_ENV);
  page('unsubscribe-confirm-es', '/unsubscribe', { token, lang: 'es' }, { tables: {}, rpcs: {} }, READY_ENV);

  // The announcement email itself, rendered by the real template, as its own page.
  const emailModule = await esbuild.build({ ...common, stdin: { contents: `export { renderAnnouncementEmail } from '${path.join(web, 'lib/notifications/emailTemplate.ts')}';`, resolveDir: root, loader: 'ts' }, platform: 'node', format: 'cjs' });
  const em = new Module('email'); em._compile(file(emailModule, '.js'), 'email.js');
  const emails = {};
  for (const [key, locale, content] of [['/email-en', 'en', seed.en], ['/email-es', 'es-419', seed.es]]) emails[key] = em.exports.renderAnnouncementEmail({ content, locale, leagueName: 'Stress Test 2026', appUrl: 'http://127.0.0.1:' + PORT, linkUrl: 'http://127.0.0.1:' + PORT + '/dashboard', unsubscribeUrl: 'http://127.0.0.1:' + PORT + '/unsubscribe?token=preview' }).html;

  async function document(key) {
    const spec = routes[key];
    setEnv(spec.env);
    globalThis.__QA_STATE = spec.state;
    globalThis.__QA_PATH = spec.route;
    const { html, islands } = await render(spec.route, spec.query);
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Big Exec · visual fixture</title><style>' + css + '</style></head><body>'
      + '<div id="qa-announcer"></div>' + html + '<div id="qa-install"></div>'
      + '<footer style="padding:20px;color:#d5d9d2;font:12px Arial">VISUAL TEST FIXTURE · Synthetic data · Nothing is sent or saved</footer>'
      + '<script>window.__QA_PATH=' + JSON.stringify(spec.route) + '</script><script type="application/json" id="islands-data">' + JSON.stringify(islands).replaceAll('<', '\\u003c') + '</script><script src="/qa-client.js"></script></body></html>';
  }

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/qa-client.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(file(client, '.js')); }
      if (/^\/(brand|icons|environments)\//.test(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.webp') ? 'image/webp' : url.pathname.endsWith('.png') ? 'image/png' : 'image/jpeg'); return res.end(fs.readFileSync(path.join(web, 'public', url.pathname))); }
      if (url.pathname === '/sw.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(web, 'public/sw.js'))); }
      if (url.pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
      if (url.pathname.startsWith('/api/push/')) { res.setHeader('Content-Type', 'application/json'); return res.end('{"ok":true}'); }
      if (url.pathname.startsWith('/email-')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(emails[url.pathname]); }
      if (!routes[url.pathname]) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await document(url.pathname));
    } catch (error) { res.statusCode = 500; res.end(String(error.stack)); }
  });
  await new Promise(resolve => httpServer.listen(PORT, '127.0.0.1', resolve));

  const { chromium } = require('playwright');
  const options = {};
  if (process.env.QA_BROWSER_EXECUTABLE) { options.executablePath = process.env.QA_BROWSER_EXECUTABLE; options.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const browser = await chromium.launch(options);
  const checks = [], problems = [];
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  try {
    for (const width of [1440, 390]) {
      // name, path, { push, ua, locale, act }
      const shots = [
        ['settings-default', '/settings', { push: {} }],
        ['settings-push-on', '/settings', { push: {}, act: async p => {
          if (await p.evaluate(() => window.qaPermissionRequests) !== 0) throw Error('Permission was requested before any user action');
          await p.getByRole('button', { name: 'Turn on push on this device' }).click();
          await p.getByText('Push is now on for this device.').first().waitFor();
          const state = await p.evaluate(() => ({ requests: window.qaPermissionRequests, subscribes: window.qaSubscribeCalls, checked: document.getElementById('pref-push').checked }));
          if (state.requests !== 1 || state.subscribes !== 1 || !state.checked) throw Error('Turn on push did not behave: ' + JSON.stringify(state));
          return { permissionRequestsBeforeClick: 0, permissionRequestsAfterClick: state.requests, liveRegion: await p.locator('#qa-announcer [aria-live="polite"]').innerText() };
        } }],
        ['settings-push-denied', '/settings', { push: { grant: 'denied' }, act: async p => { await p.getByRole('button', { name: 'Turn on push on this device' }).click(); await p.getByText('Permission was not given').first().waitFor(); return { liveRegion: await p.locator('#qa-announcer [aria-live="assertive"]').innerText() }; } }],
        ['settings-saved-keyboard', '/settings', { push: {}, act: async p => {
          // Keyboard only: Tab to the first switch, toggle switches with Space, submit with Enter.
          await p.locator('#pref-email').focus();
          await p.keyboard.press('Space');
          await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
          const focused = await p.evaluate(() => document.activeElement.id);
          await p.keyboard.press('Space');
          for (let i = 0; i < 12 && await p.evaluate(() => document.activeElement.textContent) !== 'Save preferences'; i += 1) await p.keyboard.press('Tab');
          await p.keyboard.press('Enter');
          await p.getByText('Notification preferences saved.').first().waitFor();
          const saved = await p.evaluate(() => window.qaActions.at(-1).data);
          if (saved.email_enabled || saved.category_lineup_lock_reminder || saved.category_league_announcements !== 'on') throw Error('Keyboard toggles were not submitted: ' + JSON.stringify(saved) + ' focus ' + focused);
          return { submitted: saved, liveRegion: await p.locator('#qa-announcer [aria-live="polite"]').innerText() };
        } }],
        ['settings-save-error', '/settings', { push: {}, act: async p => { await p.evaluate(() => { window.qaSaveFails = true; }); await p.getByRole('button', { name: 'Save preferences' }).click(); await p.getByText('Your preferences were not saved').first().waitFor(); return { liveRegion: await p.locator('#qa-announcer [aria-live="assertive"]').innerText() }; } }],
        ['settings-devices-on', '/settings-devices', { push: { permission: 'granted', subscribed: true } }],
        ['settings-blocked', '/settings', { push: { permission: 'denied' } }],
        ['settings-spanish', '/settings', { push: {}, locale: 'es-419' }],
        ['settings-iphone-needs-install', '/settings', { push: { supported: false }, ua: IPHONE, act: async p => { await p.getByRole('button', { name: 'Show install steps' }).click(); await p.locator('#pwa-install-prompt').waitFor(); return { installPrompt: await p.locator('#pwa-install-prompt').innerText() }; } }],
        ['settings-push-not-configured', '/settings-no-vapid', { push: {} }],
        ['settings-unavailable', '/settings-unavailable', { push: {} }],
        ['settings-no-league', '/settings-no-league', { push: {} }],
        ['unsubscribe-confirm', '/unsubscribe-confirm', {}],
        ['unsubscribe-confirm-spanish', '/unsubscribe-confirm-es', {}],
        ['unsubscribe-done', '/unsubscribe-done', {}],
        ['unsubscribe-done-spanish', '/unsubscribe-done-es', {}],
        ['unsubscribe-invalid', '/unsubscribe-invalid', {}],
        ['ops-list', '/ops-list', {}],
        ['ops-list-not-installed', '/ops-list-not-installed', {}],
        ['ops-detail-draft', '/ops-detail-draft', { act: async (p, width) => { const frame = p.locator('iframe').first(); await frame.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await frame.screenshot({ path: path.join(out, `ops-detail-email-preview-${width}.png`) }); await p.evaluate(() => scrollTo(0, 0)); return { frames: await p.locator('iframe').count() }; } }],
        ['ops-detail-not-ready', '/ops-detail-not-ready', {}],
        ['ops-detail-confirm', '/ops-detail-draft', { act: async p => {
          await p.getByRole('button', { name: 'Review and send to 10 members' }).focus();
          await p.keyboard.press('Enter');
          await p.getByRole('heading', { name: 'Confirm: send this announcement now' }).waitFor();
          const focusOnHeading = await p.evaluate(() => document.activeElement.id === 'send-confirm-title');
          // Not confirmed yet: pressing the button must not submit.
          await p.getByRole('button', { name: 'Send now' }).click({ force: true });
          await p.getByRole('button', { name: 'Send now' }).focus();
          await p.keyboard.press('Enter');
          if ((await p.evaluate(() => (window.qaActions || []).length)) !== 0) throw Error('Send was submitted without the typed confirmation');
          await p.getByLabel('Type SEND in capital letters to confirm').fill('SEND');
          return { focusOnHeading, liveRegion: await p.locator('#qa-announcer [aria-live="polite"]').innerText() };
        } }],
        ['ops-detail-confirmed-submit', '/ops-detail-draft', { act: async p => {
          await p.getByRole('button', { name: 'Review and send to 10 members' }).click();
          await p.getByLabel('Type SEND in capital letters to confirm').fill('SEND');
          await p.getByRole('button', { name: 'Send now' }).click();
          await p.waitForFunction(() => (window.qaActions || []).length === 1);
          const submitted = await p.evaluate(() => window.qaActions[0]);
          if (submitted.data.confirm !== 'SEND' || submitted.data.expected_members !== '10') throw Error('Unexpected submission ' + JSON.stringify(submitted));
          return { submitted };
        } }],
        ['ops-detail-confirm-cancelled', '/ops-detail-draft', { act: async p => {
          await p.getByRole('button', { name: 'Review and send to 10 members' }).click();
          await p.getByLabel('Type SEND in capital letters to confirm').press('Escape');
          await p.getByRole('button', { name: 'Review and send to 10 members' }).waitFor();
          return { focusReturned: await p.evaluate(() => document.activeElement.textContent), actions: await p.evaluate(() => (window.qaActions || []).length) };
        } }],
        ['ops-detail-failed-retry', '/ops-detail-failed', {}],
        ['ops-detail-sent', '/ops-detail-sent', {}]
      ];

      for (const [name, url, opts] of shots) {
        const context = await browser.newContext({ viewport: { width, height: width > 900 ? 1000 : 844 }, deviceScaleFactor: 1, ...(opts.ua ? { userAgent: opts.ua } : {}) });
        const p = await context.newPage();
        const consoleErrors = [];
        p.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        p.on('pageerror', error => consoleErrors.push(String(error)));
        // The email preview loads the wordmark from the production URL; serve the local file instead of the network.
        await context.route('https://bigexecfs.com/**', route => { const file = path.join(web, 'public', new URL(route.request().url()).pathname); return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort(); });
        if (opts.push) await p.addInitScript(fakePush, opts.push);
        if (opts.locale) await p.addInitScript(locale => localStorage.setItem('big-exec-locale', locale), opts.locale);
        await p.goto(`http://127.0.0.1:${PORT}${url}`);
        await p.waitForFunction(() => window.qaReady);
        if (!(await p.title()).includes('visual fixture')) throw Error(await p.locator('body').innerText());
        if (opts.push && !('supported' in opts.push)) await p.waitForFunction(() => document.querySelector('[data-state]')?.getAttribute('data-state') !== 'checking');
        const detail = opts.act ? await opts.act(p, width) : {};
        await p.waitForTimeout(150);
        await p.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        const offenders = overflow ? await p.evaluate(() => [{ tag: 'HTML', class: 'scrollWidth ' + document.documentElement.scrollWidth + ' body ' + document.body.scrollWidth, right: innerWidth }].concat(Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > innerWidth + 1)).slice(0, 8).map(e => e.tag ? e : ({ tag: e.tagName, class: String(e.className).slice(0, 60), right: Math.round(e.getBoundingClientRect().right), scrollWidth: e.scrollWidth }))) : [];
        await p.addScriptTag({ path: require.resolve('axe-core/axe.min.js', { paths: [web] }) });
        const axe = await p.evaluate(async () => await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
        const violations = axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
        const unlabelled = await p.evaluate(() => Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea')).filter(e => !e.labels || !e.labels.length).map(e => e.id || e.name));
        checks.push({ name, width, lang: await p.evaluate(() => document.documentElement.lang), overflow, offenders, axe: violations, unlabelled, consoleErrors, ...detail });
        if (overflow || violations.length || unlabelled.length || consoleErrors.length) problems.push(`${name}-${width}`);
        await context.close();
      }
    }
    // The email, with images and with images blocked (it must read the same).
    for (const width of [640, 390]) for (const [key, images] of [['email-en', true], ['email-es', true], ['email-en', false]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const p = await context.newPage();
      if (!images) await context.route('**/*.png', route => route.abort());
      await p.goto(`http://127.0.0.1:${PORT}/${key}`);
      const name = `${key}${images ? '' : '-images-off'}`;
      await p.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      await p.addScriptTag({ path: require.resolve('axe-core/axe.min.js', { paths: [web] }) });
      const axe = await p.evaluate(async () => await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
      const violations = axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
      checks.push({ name, width, lang: await p.evaluate(() => document.documentElement.lang), overflow, offenders: [], axe: violations, unlabelled: [], consoleErrors: [] });
      if (overflow || violations.length) problems.push(`${name}-${width}`);
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2));
    console.log(JSON.stringify(checks.map(c => ({ name: c.name, width: c.width, overflow: c.overflow, axe: c.axe.map(a => a.id), unlabelled: c.unlabelled, consoleErrors: c.consoleErrors.length }))));
    console.log(problems.length ? 'PROBLEMS: ' + problems.join(', ') : `OK: ${checks.length} page states, no overflow, no axe violations, no console errors`);
    if (problems.length) process.exitCode = 1;
  } finally {
    await browser.close();
    httpServer.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
