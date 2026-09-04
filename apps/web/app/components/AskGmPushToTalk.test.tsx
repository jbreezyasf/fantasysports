import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AskGmPushToTalk from './AskGmPushToTalk';
import BigExecAppHeader from './BigExecAppHeader';
import type { AssistantGmPolicyDecision } from '../../lib/assistant-gm/capabilityPolicy';

vi.mock('next/navigation', () => ({
  usePathname: () => '/leagues/league-1'
}));

describe('AskGmPushToTalk', () => {
  it.each([
    ['idle', 'Ask GM is ready.', 'Start push to talk with Assistant GM'],
    ['listening', 'Listening. Speak your question now.', 'Cancel Assistant GM listening'],
    ['processing', 'Processing your question.', 'Cancel Assistant GM processing'],
    ['speaking', 'Speaking Assistant GM response.', 'Stop Assistant GM speech'],
    ['error', 'Ask GM is unavailable.', 'Cancel and return from Assistant GM error']
  ] as const)('renders accessible %s state', (state, text, actionLabel) => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState={state} />);

    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain(text);
    expect(html).toContain('role="status"');
    expect(html).toContain(actionLabel);
    expect(html).toContain('No always-listening behavior is active');
    expect(html).toContain('Type your Assistant GM question');
  });

  it('offers explicit retry in the error state', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="error" />);

    expect(html).toContain('Retry push to talk with Assistant GM');
    expect(html).toContain('Type Assistant GM request instead');
    expect(html).toContain('Cancel and return from Assistant GM error');
    expect(html).toContain('I did not understand that');
  });

  it('keeps the text response available while speech controls are shown', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="speaking" initialResponse="You are winning by two." />);

    expect(html).toContain('Assistant GM response: You are winning by two.');
    expect(html).toContain('Replay last Assistant GM response');
    expect(html).toContain('Assistant GM spoken responses keep text visible');
  });

  it('keeps Ask GM out of the header when the flag is disabled', () => {
    const html = renderToStaticMarkup(<BigExecAppHeader leagueId="league-1" voiceGmEnabled={false} />);

    expect(html).not.toContain('Assistant GM push to talk');
  });

  it('mounts Ask GM in the header when the flag is enabled', () => {
    const html = renderToStaticMarkup(<BigExecAppHeader leagueId="league-1" voiceGmEnabled />);

    expect(html).toContain('Assistant GM push to talk');
    expect(html).toContain('Start push to talk with Assistant GM');
  });
});

const entitlementRequired: AssistantGmPolicyDecision = {
  allowed: false,
  intentId: 'pro_plus.lineup_review',
  capabilityId: 'pro_plus.lineup_review',
  intentClass: 'pro_plus',
  reason: 'entitlement_required',
  message: 'Assistant GM Pro+ requires an active Executive league-season entitlement.',
  upgradeRequired: true
};

const commissionerOnly: AssistantGmPolicyDecision = {
  allowed: false,
  intentId: 'commissioner.invitation_state',
  capabilityId: 'invitations.read',
  intentClass: 'commissioner_only',
  reason: 'audience_denied',
  message: 'Only the league commissioner can use that Assistant GM capability.',
  upgradeRequired: false
};

describe('AskGmPushToTalk BE-VOICE-100 additions', () => {
  it('renders a conversation transcript alongside the spoken response', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="speaking" initialResponse="You are winning by two." />);

    expect(html).toContain('aria-label="Assistant GM conversation transcript"');
    expect(html).toContain('askGmTurns');
    expect(html).toContain('Assistant GM');
  });

  it('exposes a focusable transcript region for programmatic focus restoration', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="speaking" initialResponse="You are winning by two." />);

    expect(html).toMatch(/class="askGmHistory"[^>]*tabindex="-1"/);
  });

  it('makes the error alert a focus target so failures are not silent', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="error" />);

    expect(html).toMatch(/class="askGmError"[^>]*tabindex="-1"/);
    expect(html).toContain('role="alert"');
  });

  it('offers a typed submit path in every state', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="idle" />);

    expect(html).toContain('Send typed Assistant GM question');
    expect(html).toContain('id="ask-gm-typed-fallback"');
  });

  it('stays non-modal while a time-critical gameplay control is live', () => {
    const calm = renderToStaticMarkup(<AskGmPushToTalk initialState="idle" />);
    const duringDraft = renderToStaticMarkup(
      <AskGmPushToTalk initialState="idle" capabilities={{ criticalControlsActive: true }} />
    );

    expect(calm).toContain('role="dialog"');
    expect(duringDraft).toContain('role="region"');
    expect(duringDraft).not.toContain('role="dialog"');
  });

  it('replaces the control with the shared upgrade prompt on an entitlement denial', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk policy={entitlementRequired} />);

    expect(html).toContain('Executive League Season Pass required');
    expect(html).not.toContain('Start push to talk with Assistant GM');
  });

  it('never shows an upgrade prompt for a role denial', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk policy={commissionerOnly} />);

    expect(html).toContain('Only the league commissioner can use that Assistant GM capability.');
    expect(html).not.toContain('Executive League Season Pass required');
  });
});
