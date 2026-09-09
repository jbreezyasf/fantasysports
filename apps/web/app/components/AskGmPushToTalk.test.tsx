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
    ['idle', 'Ask Advisor is ready.', 'Start push to talk with Front Office Advisor'],
    ['listening', 'Listening. Speak your question now.', 'Cancel Front Office Advisor listening'],
    ['processing', 'Processing your question.', 'Cancel Front Office Advisor processing'],
    ['speaking', 'Speaking Front Office Advisor response.', 'Stop Front Office Advisor speech'],
    ['error', 'Ask Advisor is unavailable.', 'Cancel and return from Front Office Advisor error']
  ] as const)('renders accessible %s state', (state, text, actionLabel) => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState={state} defaultOpen />);

    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain(text);
    expect(html).toContain('role="status"');
    expect(html).toContain(actionLabel);
    expect(html).toContain('No always-listening behavior is active');
    expect(html).toContain('Type your Front Office Advisor question');
  });

  it('offers explicit retry in the error state', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="error" defaultOpen />);

    expect(html).toContain('Retry push to talk with Front Office Advisor');
    expect(html).toContain('Type Front Office Advisor request instead');
    expect(html).toContain('Cancel and return from Front Office Advisor error');
    expect(html).toContain('I did not understand that');
  });

  it('keeps the text response available while speech controls are shown', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="speaking" initialResponse="You are winning by two." defaultOpen />);

    expect(html).toContain('Front Office Advisor response: You are winning by two.');
    expect(html).toContain('Replay last Front Office Advisor response');
    expect(html).toContain('Front Office Advisor spoken responses keep text visible');
  });

  it('keeps typed Ask Advisor in the header when voice input is disabled', () => {
    const html = renderToStaticMarkup(<BigExecAppHeader leagueId="league-1" voiceGmEnabled={false} />);

    expect(html).toContain('Open Front Office Advisor');
    expect(html).toContain('askGmBubble');
  });

  it('mounts Ask Advisor in the header when the flag is enabled', () => {
    const html = renderToStaticMarkup(<BigExecAppHeader leagueId="league-1" voiceGmEnabled />);

    expect(html).toContain('Open Front Office Advisor');
    expect(html).toContain('askGmBubble');
  });

  it('keeps header Ask Advisor non-modal when critical controls are active', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="idle" defaultOpen capabilities={{ criticalControlsActive: true }} />);

    expect(html).toContain('role="region"');
    expect(html).not.toContain('role="dialog"');
  });
});

const entitlementRequired: AssistantGmPolicyDecision = {
  allowed: false,
  intentId: 'pro_plus.lineup_review',
  capabilityId: 'pro_plus.lineup_review',
  intentClass: 'pro_plus',
  reason: 'entitlement_required',
  message: 'Front Office Advisor Pro+ requires an active Executive league-season entitlement.',
  upgradeRequired: true
};

const commissionerOnly: AssistantGmPolicyDecision = {
  allowed: false,
  intentId: 'commissioner.invitation_state',
  capabilityId: 'invitations.read',
  intentClass: 'commissioner_only',
  reason: 'audience_denied',
  message: 'Only the league commissioner can use that Front Office Advisor capability.',
  upgradeRequired: false
};

describe('AskGmPushToTalk BE-VOICE-100 additions', () => {
  it('renders a conversation transcript alongside the spoken response', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="speaking" initialResponse="You are winning by two." defaultOpen />);

    expect(html).toContain('aria-label="Front Office Advisor conversation transcript"');
    expect(html).toContain('askGmTurns');
    expect(html).toContain('Front Office Advisor');
  });

  it('exposes a focusable transcript region for programmatic focus restoration', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="speaking" initialResponse="You are winning by two." defaultOpen />);

    expect(html).toMatch(/class="askGmHistory"[^>]*tabindex="-1"/);
  });

  it('makes the error alert a focus target so failures are not silent', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="error" defaultOpen />);

    expect(html).toMatch(/class="askGmError"[^>]*tabindex="-1"/);
    expect(html).toContain('role="alert"');
  });

  it('offers a typed submit path in every state', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk initialState="idle" defaultOpen />);

    expect(html).toContain('Send typed Front Office Advisor question');
    expect(html).toContain('class="askGmTypedSubmit"');
    expect(html).toContain('id="ask-gm-typed-fallback"');
  });

  it('stays non-modal while a time-critical gameplay control is live', () => {
    const calm = renderToStaticMarkup(<AskGmPushToTalk initialState="idle" defaultOpen />);
    const duringDraft = renderToStaticMarkup(
      <AskGmPushToTalk initialState="idle" defaultOpen capabilities={{ criticalControlsActive: true }} />
    );

    expect(calm).toContain('role="dialog"');
    expect(duringDraft).toContain('role="region"');
    expect(duringDraft).not.toContain('role="dialog"');
  });

  it('replaces the control with the shared upgrade prompt on an entitlement denial', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk policy={entitlementRequired} />);

    expect(html).toContain('Executive League Season Pass required');
    expect(html).not.toContain('Open Front Office Advisor');
  });

  it('never shows an upgrade prompt for a role denial', () => {
    const html = renderToStaticMarkup(<AskGmPushToTalk policy={commissionerOnly} />);

    expect(html).toContain('Only the league commissioner can use that Front Office Advisor capability.');
    expect(html).not.toContain('Executive League Season Pass required');
  });
});
