import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AskGmPushToTalk from './AskGmPushToTalk';
import BigExecAppHeader from './BigExecAppHeader';

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
