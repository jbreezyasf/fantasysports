'use client';

import React, { useMemo, useState } from 'react';
import { createLeagueInvite } from '../actions';
import { duplicateInviteEmails, invalidInviteEmails, parseInviteEmails, verbalizeEmail } from './invitationAccessibility';

export default function InviteManagersForm({ leagueId, pendingEmails = [] }: { leagueId: string; pendingEmails?: string[] }) {
  const [draft, setDraft] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const invalid = useMemo(() => invalidInviteEmails(emails), [emails]);
  const duplicates = useMemo(() => duplicateInviteEmails(draft), [draft]);
  const pendingSet = useMemo(() => new Set(pendingEmails.map(email => email.toLowerCase())), [pendingEmails]);
  const alreadyPending = emails.filter(email => pendingSet.has(email));
  const canSend = emails.length > 0 && invalid.length === 0 && alreadyPending.length === 0;

  const addDraftEmails = () => {
    setEmails(previous => [...new Set([...previous, ...parseInviteEmails(draft)])]);
    setDraft('');
  };

  return <div className="inviteManagerComposer">
    <label htmlFor="manager-invites">Manager email addresses</label>
    <div className="inlineForm">
      <textarea id="manager-invites" value={draft} onChange={event => setDraft(event.target.value)} rows={2} placeholder="manager@example.com" aria-describedby="manager-invite-help manager-invite-errors" />
      <button className="secondary" type="button" onClick={addDraftEmails}>Review Addresses</button>
    </div>
    <p id="manager-invite-help" className="srOnly">Enter one or more email addresses separated by commas, spaces, semicolons, or new lines.</p>
    <div id="manager-invite-errors">
      {duplicates.map(email => <p className="errorNotice" role="alert" key={email}>{email} appears more than once in the current entry field.</p>)}
    </div>
    {!!emails.length && <div className="inviteReviewList" role="list" aria-label="Reviewed invite addresses">
      {emails.map(email => {
        const bad = invalid.includes(email);
        const pending = pendingSet.has(email);
        return <div role="listitem" className={bad || pending ? 'inviteReviewRow isInvalid' : 'inviteReviewRow'} key={email}>
          <span>{email}<small className="srOnly">Character review: {verbalizeEmail(email)}</small></span>
          {bad && <strong role="status">{email} is not a valid email address. Add a domain such as .com and try again.</strong>}
          {pending && <strong role="status">{email} already has a pending invite.</strong>}
          <button className="miniAction" type="button" onClick={() => setEmails(current => current.filter(item => item !== email))} aria-label={`Remove ${email}`}>Remove</button>
        </div>;
      })}
    </div>}
    <form action={createLeagueInvite}>
      <input type="hidden" name="league_id" value={leagueId} />
      <input type="hidden" name="emails" value={emails.join(',')} />
      <button className="primary" type="submit" disabled={!canSend}>Send Invitations</button>
    </form>
  </div>;
}
