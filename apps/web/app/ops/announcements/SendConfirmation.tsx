'use client';

import React, { useEffect, useRef, useState } from 'react';
import { announceToScreenReader } from '../../components/ScreenReaderAnnouncer';
import styles from '../../settings/notifications/notifications.module.css';

type Counts = { members: number; email: number; push: number; pushDevices: number };

// The confirmation step for a live send, built into the page (the product does not use browser
// confirm dialogs). Step 1 opens the review. Step 2 needs the word SEND typed before the form
// can be submitted; the server checks the word and the member count again.
export default function SendConfirmation({ notificationId, leagueName, title, counts, resume, action }: {
  notificationId: string;
  leagueName: string;
  title: string;
  counts: Counts;
  // True when an earlier send stopped part-way and this press retries what is left.
  resume: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const ready = typed.trim() === 'SEND';

  const wasOpen = useRef(false);

  // Focus follows the step: into the confirmation when it opens, back to the opener when it closes.
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) openerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    headingRef.current?.focus();
    announceToScreenReader({ message: `Confirm sending to ${counts.members} members of ${leagueName}. Type SEND to enable the send button.`, priority: 'polite', key: 'announcement-confirm' });
  }, [open, counts.members, leagueName]);

  const close = () => {
    setOpen(false);
    setTyped('');
    announceToScreenReader({ message: 'Send cancelled. Nothing was sent.', priority: 'polite', key: 'announcement-cancel' });
  };

  if (!open) {
    return <button ref={openerRef} className={styles.dangerButton} type="button" onClick={() => setOpen(true)}>{resume ? 'Review and retry the send' : `Review and send to ${counts.members} members`}</button>;
  }

  return (
    <form action={action} className={styles.confirm} aria-labelledby="send-confirm-title">
      <h3 id="send-confirm-title" ref={headingRef} tabIndex={-1}>Confirm: send this announcement now</h3>
      <p>This sends <strong>{title}</strong> to the members of <strong>{leagueName}</strong>. It cannot be recalled.</p>
      <ul>
        <li>{counts.members} members in the league</li>
        <li>{counts.email} will get the email</li>
        <li>{counts.push} will get a push notification, on {counts.pushDevices} devices</li>
        {resume && <li>Members who already received it are not sent it again.</li>}
      </ul>
      <input type="hidden" name="notification_id" value={notificationId} />
      <input type="hidden" name="expected_members" value={counts.members} />
      <div className={styles.field}>
        <label htmlFor="send-confirm-word">Type SEND in capital letters to confirm</label>
        <input id="send-confirm-word" name="confirm" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed} onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') close(); }} aria-describedby="send-confirm-hint" />
        <p id="send-confirm-hint" className={styles.hint}>{ready ? 'Confirmed. The send button is enabled.' : 'The send button stays disabled until you type SEND.'}</p>
      </div>
      <div className={styles.actions}>
        <button className={styles.dangerButton} type="submit" aria-disabled={!ready} onClick={event => { if (!ready) event.preventDefault(); }}>Send now</button>
        <button className={styles.secondaryButton} type="button" onClick={close}>Go back without sending</button>
      </div>
    </form>
  );
}
