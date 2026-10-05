import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../accessibility-automation/axeTestUtils';
import { translateMessage } from '../../components/LocaleProvider';
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_CATEGORIES } from '../../../lib/notifications/preferences';
import NotificationSettings, { describeUserAgent, urlBase64ToUint8Array } from './NotificationSettings';
import { N, NOTIFICATION_STRING_PAIRS } from './strings';

const here = dirname(fileURLToPath(import.meta.url));
const save = async () => ({ status: 'idle' as const, message: '', stamp: 0 });

function render(overrides: Partial<React.ComponentProps<typeof NotificationSettings>> = {}) {
  return renderToStaticMarkup(
    <NotificationSettings preferences={DEFAULT_NOTIFICATION_PREFERENCES} devices={[]} vapidPublicKey="BPublicKey" saveAction={save} {...overrides} />
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('notification settings section', () => {
  it('renders every switch with a real label and a description, with the defaults: email on, push off', () => {
    const html = render();
    expect(html).toMatch(/<input id="pref-email"[^>]* name="email_enabled" checked=""/);
    expect(html).toMatch(/<input id="pref-push"[^>]* name="push_enabled"\/>/);
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(html).toContain(`<label for="pref-${category}">`);
      expect(html).toContain(`aria-describedby="pref-${category}-hint"`);
      expect(html).toContain(`name="category_${category}"`);
    }
    expect(html).toContain('<label for="pref-locale">');
    expect(html).toContain('<option value="es-419">');
    expect(html.match(/<legend>/g)).toHaveLength(2);
    // Only league announcements are sent today; the page says so for the other five.
    expect(html.match(new RegExp(N.notSendingYet.replace(/[.]/g, '\\.'), 'g'))).toHaveLength(5);
    expect(html).toContain(N.emailHint);
  });

  it('explains the iPhone and iPad Home Screen requirement and links to the install steps', () => {
    const html = render();
    expect(html).toContain('On iPhone and iPad, push works only after you add Big Exec to your Home Screen and open it from there.');
    expect(html).toContain(`>${N.showInstall}</button>`);
  });

  it('has no automated accessibility violations, with and without devices', async () => {
    await expectNoAxeViolations(`<main><h1>Notifications</h1>${render()}</main>`);
    await expectNoAxeViolations(`<main><h1>Notifications</h1>${render({ devices: [{ id: 'd1', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1', createdAt: '2026-10-01T00:00:00Z', lastSuccessAt: null }], preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: true, locale: 'es-419' } })}</main>`);
  });

  it('never asks for notification permission or subscribes while rendering', () => {
    const requestPermission = vi.fn();
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const html = render();
    expect(requestPermission).not.toHaveBeenCalled();
    // Until the browser state is known, no "turn on" button is offered.
    expect(html).toContain(N.deviceChecking);
    expect(html).not.toContain(N.turnOn);
  });

  it('only calls requestPermission and pushManager.subscribe inside the button click handler', () => {
    const source = readFileSync(join(here, 'NotificationSettings.tsx'), 'utf8');
    expect(source.match(/requestPermission\(/g)).toHaveLength(1);
    expect(source.match(/pushManager\.subscribe\(/g)).toHaveLength(1);
    const handler = source.slice(source.indexOf('const turnOn = async'), source.indexOf('const turnOff = async'));
    expect(handler).toContain('Notification.requestPermission()');
    expect(handler).toContain('pushManager.subscribe(');
    expect(source).toContain('onClick={turnOn}');
    for (const effect of source.split('useEffect(').slice(1)) expect(effect.slice(0, effect.indexOf('\n  }, ['))).not.toMatch(/requestPermission|pushManager\.subscribe/);
    // No other file in the app asks for the permission.
    for (const file of ['../../components/PwaInstallPrompt.tsx', '../../layout.tsx']) expect(readFileSync(join(here, file), 'utf8')).not.toMatch(/requestPermission|pushManager/);
  });

  it('announces results through the shared live-region announcer', () => {
    const source = readFileSync(join(here, 'NotificationSettings.tsx'), 'utf8');
    expect(source).toContain("import { announceToScreenReader } from '../../components/ScreenReaderAnnouncer'");
    expect(source.match(/announceToScreenReader\(/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('has a Spanish translation for every string, wired into the locale catalog', () => {
    for (const [english, spanish] of NOTIFICATION_STRING_PAIRS) {
      expect(spanish.trim().length, english).toBeGreaterThan(0);
      expect(translateMessage(english), english).toBe(spanish);
    }
    expect(translateMessage(N.turnOn)).toBe('Activar push en este dispositivo');
  });

  it('decodes a VAPID key and names devices from the user agent', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID-_8'))).toEqual([1, 2, 3, 251, 255]);
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'Browser')).toBe('Safari · iPhone');
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0', 'Browser')).toBe('Edge · Windows');
    expect(describeUserAgent(null, 'Browser')).toBe('Browser');
  });
});
