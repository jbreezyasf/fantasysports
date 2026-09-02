import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconButton, LiveRegion, MainContent, SkipLink, StatusBadge, StatusMessage, VisuallyHidden } from './accessibility';

describe('accessibility primitives', () => {
  it('renders a visible-on-focus skip link to the shared main target', () => {
    const html = renderToStaticMarkup(<SkipLink />);

    expect(html).toContain('class="skipLink"');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to main content');
  });

  it('renders a focusable main-content target wrapper', () => {
    const html = renderToStaticMarkup(<MainContent>Page</MainContent>);

    expect(html).toContain('id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('Page');
  });

  it('keeps visually hidden content in the accessibility tree', () => {
    const html = renderToStaticMarkup(<VisuallyHidden>Search available players</VisuallyHidden>);

    expect(html).toContain('class="srOnly"');
    expect(html).toContain('Search available players');
  });

  it('maps status and error messages to the correct live roles', () => {
    const success = renderToStaticMarkup(<StatusMessage tone="success">Saved</StatusMessage>);
    const error = renderToStaticMarkup(<StatusMessage tone="error" focusTarget>Failed</StatusMessage>);

    expect(success).toContain('class="successNotice"');
    expect(success).toContain('role="status"');
    expect(success).toContain('aria-live="polite"');
    expect(error).toContain('class="errorNotice"');
    expect(error).toContain('role="alert"');
    expect(error).toContain('aria-live="assertive"');
    expect(error).toContain('tabindex="-1"');
  });

  it('renders a configurable live region', () => {
    const html = renderToStaticMarkup(<LiveRegion politeness="assertive">Draft pick changed</LiveRegion>);

    expect(html).toContain('class="srOnly"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
  });

  it('requires icon buttons to expose an explicit accessible label and state', () => {
    const html = renderToStaticMarkup(
      <IconButton label="Remove player from queue" disabled pressed={false} expanded={false}>
        <span aria-hidden="true">X</span>
      </IconButton>,
    );

    expect(html).toContain('aria-label="Remove player from queue"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders status badges with visible text and programmatic state', () => {
    const html = renderToStaticMarkup(
      <StatusBadge state="pending" label="Waiver claim pending">
        CLAIM PENDING
      </StatusBadge>,
    );

    expect(html).toContain('class="statusBadge is-pending"');
    expect(html).toContain('aria-label="Waiver claim pending"');
    expect(html).toContain('data-state="pending"');
    expect(html).toContain('CLAIM PENDING');
  });
});
