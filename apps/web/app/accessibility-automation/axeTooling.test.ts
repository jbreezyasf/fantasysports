import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, runAxeOnHtml } from './axeTestUtils';

describe('automated accessibility tooling', () => {
  it('passes a labelled, structured form fixture', async () => {
    await expectNoAxeViolations(`
      <main>
        <h1>Invite Managers</h1>
        <form aria-labelledby="invite-heading">
          <h2 id="invite-heading">Send invitations</h2>
          <label for="manager-email">Email address</label>
          <input id="manager-email" name="email" type="email" autocomplete="email">
          <button type="submit">Send invitation</button>
        </form>
      </main>
    `);
  });

  it('fails on known injected defects for labels, names, roles, states, and dialogs', async () => {
    const violations = await runAxeOnHtml(`
      <main>
        <h1>Known accessibility defects</h1>
        <button></button>
        <input type="text" name="manager">
        <div role="totally-made-up">Bad role</div>
        <div role="checkbox" aria-checked="maybe">Bad state</div>
        <div role="dialog">
          <p>Untitled confirmation dialog</p>
        </div>
      </main>
    `);
    const ids = violations.map((violation) => violation.id);

    expect(ids).toContain('button-name');
    expect(ids).toContain('label');
    expect(ids).toContain('aria-roles');
    expect(ids).toContain('aria-valid-attr-value');
    expect(ids).toContain('aria-dialog-name');
  });
});
