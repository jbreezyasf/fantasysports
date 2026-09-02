import { describe, expect, it } from 'vitest';
import { duplicateInviteEmails, invalidInviteEmails, inviteConfirmation, parseInviteEmails, verbalizeEmail } from './invitationAccessibility';

describe('invitation accessibility helpers', () => {
  it('parses, normalizes, and deduplicates email addresses', () => {
    expect(parseInviteEmails('A@Example.com, b@example.com\na@example.com')).toEqual(['a@example.com', 'b@example.com']);
  });

  it('identifies invalid addresses', () => {
    expect(invalidInviteEmails(['valid@example.com', 'missing-at', 'bad@example'])).toEqual(['missing-at', 'bad@example']);
  });

  it('identifies duplicates in the current entry list', () => {
    expect(duplicateInviteEmails('a@example.com b@example.com A@example.com')).toEqual(['a@example.com']);
  });

  it('supports character-by-character email review', () => {
    expect(verbalizeEmail('a.b_c-d+1@example.com')).toBe('a dot b underscore c dash d plus 1 at sign e x a m p l e dot c o m');
  });

  it('summarizes invite delivery status', () => {
    expect(inviteConfirmation(2, 'a@example.com, b@example.com', 'mixed')).toBe('Some emails sent and some manual invite links created for 2 managers: a@example.com, b@example.com.');
  });
});
