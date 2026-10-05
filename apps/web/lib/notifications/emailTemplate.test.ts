import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runAxeOnHtml } from '../../app/accessibility-automation/axeTestUtils';
import { buildPushPayload, findGamblingLanguage, LIMITS, validateAnnouncementInput, type Announcement } from './announcements';
import { EMAIL_COLORS, renderAnnouncementEmail } from './emailTemplate';
import { bodyToHtml, bodyToText, parseBody } from './format';
import { chaosWeek2026Announcement } from './seeds/chaosWeek2026';

const base = {
  leagueName: 'Stress Test 2026',
  appUrl: 'https://bigexecfs.com',
  linkUrl: 'https://bigexecfs.com/dashboard',
  unsubscribeUrl: 'https://bigexecfs.com/unsubscribe?token=v1.test.test'
};

function luminance(hex: string) {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe('announcement body formatting', () => {
  it('turns the limited formatting into headings, paragraphs, lists and bold', () => {
    const body = 'Intro line\ncontinues here.\n\n## A heading\n- **One**: first\n- Two\n\nClosing.';
    expect(parseBody(body)).toEqual([
      { type: 'paragraph', text: 'Intro line continues here.' },
      { type: 'heading', text: 'A heading' },
      { type: 'list', items: ['**One**: first', 'Two'] },
      { type: 'paragraph', text: 'Closing.' }
    ]);
    const styles = { heading: 'h', paragraph: 'p', list: 'l', item: 'i', strong: 's' };
    expect(bodyToHtml(body, styles)).toBe('<p style="p">Intro line continues here.</p><h2 style="h">A heading</h2><ul style="l"><li style="i"><strong style="s">One</strong>: first</li><li style="i">Two</li></ul><p style="p">Closing.</p>');
    expect(bodyToText(body)).toBe('Intro line continues here.\n\nA HEADING\n\n- One: first\n- Two\n\nClosing.');
  });

  it('escapes HTML instead of rendering it', () => {
    const html = bodyToHtml('<script>alert(1)</script> **<b>x</b>** <a href="https://evil.example">link</a>', { heading: '', paragraph: '', list: '', item: '', strong: '' });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<a ');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong style="">&lt;b&gt;x&lt;/b&gt;</strong>');
  });
});

describe('announcement email template', () => {
  const content = { title: 'A & B <notice>', body: 'First paragraph.\n\n## Section\n- **Item**: detail', pushTitle: 'x', pushBody: 'y' };

  it('renders accessible HTML: language, one h1, real headings and lists, descriptive links', async () => {
    const { html, subject } = renderAnnouncementEmail({ ...base, content, locale: 'en' });
    expect(subject).toBe('A & B <notice>');
    expect(html).toMatch(/^<!doctype html><html lang="en">/);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('A &amp; B &lt;notice&gt;</h1>');
    expect(html).toMatch(/<h2 [^>]*>Section<\/h2>/);
    expect(html).toMatch(/<ul [^>]*><li [^>]*><strong [^>]*>Item<\/strong>: detail<\/li><\/ul>/);
    // Layout tables only, and the single image has alt text so the message works without images.
    expect(html.match(/<table/g)?.length).toBe(html.match(/<table role="presentation"/g)?.length);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('alt="Big Exec Fantasy Sports"');
    // No league or team logo, no remote asset other than the Big Exec wordmark.
    expect(html.match(/src="[^"]+"/g)).toEqual(['src="https://bigexecfs.com/brand/big-exec-approved-wordmark-v1.png"']);
    const linkTexts = [...html.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map(match => match[1]);
    expect(linkTexts).toEqual(['Open your league in Big Exec', 'Unsubscribe from league emails', 'Choose which notifications you get']);
    expect(html).toContain('href="https://bigexecfs.com/unsubscribe?token=v1.test.test"');
    expect(html).toContain('You are receiving this league notice because you are a member of Stress Test 2026');
    expect(html).toContain('Sent by Big Exec Fantasy Sports.');
    const violations = await runAxeOnHtml(html.replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, ''), { rules: { region: { enabled: false } } });
    expect(violations).toEqual([]);
  });

  it('renders a plain-text part with the same content, link and unsubscribe address', () => {
    const { text } = renderAnnouncementEmail({ ...base, content, locale: 'en', postalAddress: '1 Example Way, Crosslake, MN' });
    expect(text).toContain('A & B <NOTICE>');
    expect(text).toContain('First paragraph.\n\nSECTION\n\n- Item: detail');
    expect(text).toContain('Open your league in Big Exec: https://bigexecfs.com/dashboard');
    expect(text).toContain('Unsubscribe from league emails: https://bigexecfs.com/unsubscribe?token=v1.test.test');
    expect(text).toContain('Sent by Big Exec Fantasy Sports.\n1 Example Way, Crosslake, MN');
    expect(text).not.toMatch(/<\/?(p|h1|h2|ul|li|a|strong|table|td)[ >]/i);
  });

  it('renders Spanish with the Spanish language attribute and footer', () => {
    const { html, text } = renderAnnouncementEmail({ ...base, content, locale: 'es-419' });
    expect(html).toMatch(/<html lang="es-419">/);
    expect(html).toContain('Cancelar la suscripción a los correos de la liga');
    expect(html).toContain('AVISO DE LA LIGA');
    expect(text).toContain('Recibes este aviso porque eres integrante de Stress Test 2026');
  });

  it('omits the button when there is no link and marks a test send', () => {
    const { html, subject, text } = renderAnnouncementEmail({ ...base, linkUrl: null, content, locale: 'en', test: true });
    expect(subject).toBe('[TEST] A & B <notice>');
    expect(html).not.toContain('Open your league in Big Exec');
    expect(text).toContain('TEST - LEAGUE NOTICE');
  });

  it('uses colour pairs with at least 4.5:1 contrast', () => {
    const C = EMAIL_COLORS;
    for (const [foreground, background] of [[C.heading, C.card], [C.body, C.card], [C.gold, C.card], [C.muted, C.footer], [C.gold, C.footer], [C.buttonText, C.buttonBackground]]) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the Chaos Week 2026 announcement draft', () => {
  const announcement: Announcement = { ...chaosWeek2026Announcement, id: '5b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10', kind: 'league_announcement', status: 'draft', createdBy: null, createdAt: null, sentAt: null, result: null };

  it('passes validation in both languages, within the push limits', () => {
    expect(validateAnnouncementInput(chaosWeek2026Announcement)).toEqual({ ok: true });
    for (const content of [chaosWeek2026Announcement.en, chaosWeek2026Announcement.es!]) {
      expect(content.pushTitle.length).toBeLessThan(40);
      expect(content.pushBody.length).toBeLessThan(120);
      expect(content.pushTitle.length).toBeLessThanOrEqual(LIMITS.pushTitle);
      expect(content.pushBody.length).toBeLessThanOrEqual(LIMITS.pushBody);
    }
  });

  it('names every card, both tiebreak steps and the raid deadline with its time zone, in both languages', () => {
    const { en, es } = chaosWeek2026Announcement;
    for (const card of ['Captain', 'Wild Slot', 'Raid', 'Bounty', 'Tight End Takeover', 'Golden Boot', 'Iron Curtain', 'Ground Control', 'Air Show', 'Slippery Hands']) expect(en.body).toContain(`- **${card}**:`);
    for (const card of ['Capitán', 'Puesto Comodín', 'Asalto', 'Recompensa', 'Dominio del Ala Cerrada', 'Bota de Oro', 'Cortina de Hierro', 'Control Terrestre', 'Espectáculo Aéreo', 'Manos Resbalosas']) expect(es!.body).toContain(`- **${card}**:`);
    expect(en.body).toContain('Thursday, December 3, 2026 at 8:15 PM Eastern Time (7:15 PM Central)');
    expect(en.body).toContain('Higher Week 13 Chaos Week lineup total');
    expect(en.body).toContain('Then the higher seed.');
    expect(es!.body).toContain('jueves 3 de diciembre de 2026 a las 8:15 p. m., hora del Este de EE. UU.');
    expect(en.body).toContain('Week 10 Rivalry Week total');
    expect(en.body).toContain('before any rule card is applied');
    expect(en.body).toContain('it goes into the standings');
    // Third-round decisions: automatic picks for all three, the penalty, void picks, Week 14 only.
    expect(en.body).toContain('The system picks for you under Captain, Wild Slot and Raid');
    expect(en.body).toContain("the raid takes the higher seed's best-ranked starter");
    expect(en.body).toContain('the pick is void');
    expect(en.body).toContain('Week 14 waiver order');
    expect(en.body).not.toMatch(/no extra points|no raid\.|still scores/i);
    // Words, not counting the "##" and "-" formatting marks.
    expect(en.body.split(/\s+/).filter(token => /[A-Za-z0-9]/.test(token)).length).toBeLessThan(350);
    // The kickoff quoted in the text is the one recorded in the seed (01:15 UTC on 4 December).
    expect(new Date('2026-12-04T01:15:00Z').toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })).toBe('Thursday, December 3 at 8:15 PM');
  });

  it('contains no gambling language', () => {
    for (const content of [chaosWeek2026Announcement.en, chaosWeek2026Announcement.es!]) expect(findGamblingLanguage(Object.values(content).join('\n'))).toBeNull();
    expect(findGamblingLanguage('Place your bets')).toBe('bets');
    expect(findGamblingLanguage('A better week, between friends')).toBeNull();
  });

  it('is the same text as the review document docs/product/ANNOUNCEMENT_CHAOS_WEEK_2026.md', () => {
    const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../docs/product/ANNOUNCEMENT_CHAOS_WEEK_2026.md'), 'utf8');
    for (const content of [chaosWeek2026Announcement.en, chaosWeek2026Announcement.es!]) {
      expect(doc).toContain(`~~~text\n${content.body}\n~~~`);
      expect(doc).toContain(`**Email subject and heading:** ${content.title}`);
      expect(doc).toContain(`:** ${content.pushTitle}\n`);
      expect(doc).toContain(`:** ${content.pushBody}\n`);
    }
    expect(doc).toContain(chaosWeek2026Announcement.leagueSeasonId);
    expect(doc).toContain('DRAFT. NOT SENT.');
  });

  it('builds the push payload per language', () => {
    expect(buildPushPayload(announcement, 'en')).toEqual({ title: 'Chaos Week: new rules', body: chaosWeek2026Announcement.en.pushBody, url: '/dashboard', tag: `announcement-${announcement.id}`, lang: 'en' });
    expect(buildPushPayload(announcement, 'es-419').title).toBe('Semana del Caos: nuevas reglas');
    expect(buildPushPayload({ ...announcement, es: null }, 'es-419').lang).toBe('en');
    expect(buildPushPayload({ ...announcement, link: '//evil.example' }, 'en').url).toBe('/dashboard');
  });

  it('matches the reviewed email, in English and Spanish (snapshot)', () => {
    for (const locale of ['en', 'es-419'] as const) {
      const content = locale === 'en' ? chaosWeek2026Announcement.en : chaosWeek2026Announcement.es!;
      const rendered = renderAnnouncementEmail({ ...base, content, locale });
      expect(rendered.subject).toMatchSnapshot(`${locale} subject`);
      expect(rendered.text).toMatchSnapshot(`${locale} text`);
      expect(rendered.html).toMatchSnapshot(`${locale} html`);
    }
  });
});

describe('announcement validation', () => {
  const valid = chaosWeek2026Announcement;
  it('rejects over-length push text, unsafe links, gambling language and a missing audience', () => {
    const result = validateAnnouncementInput({
      ...valid, leagueSeasonId: 'nope', link: 'https://evil.example',
      en: { ...valid.en, pushTitle: 'x'.repeat(40), pushBody: 'y'.repeat(120), body: 'Check the odds' },
      es: { ...valid.es!, title: '' }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/league season/);
    expect(result.errors.join('\n')).toMatch(/link must be a path/);
    expect(result.errors.join('\n')).toMatch(/English push title is 40 characters; the limit is 39/);
    expect(result.errors.join('\n')).toMatch(/English push text is 120 characters; the limit is 119/);
    expect(result.errors.join('\n')).toMatch(/contains "odds"/);
    expect(result.errors.join('\n')).toMatch(/Spanish title is required/);
  });
});
