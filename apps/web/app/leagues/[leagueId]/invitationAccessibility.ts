export function parseInviteEmails(value: string) {
  return [...new Set(value.split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(Boolean))];
}

export function invalidInviteEmails(emails: string[]) {
  return emails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function duplicateInviteEmails(value: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const email of value.split(/[\s,;]+/).map(item => item.trim().toLowerCase()).filter(Boolean)) {
    if (seen.has(email)) duplicates.add(email);
    seen.add(email);
  }
  return [...duplicates];
}

export function verbalizeEmail(email: string) {
  const names: Record<string, string> = {
    '@': 'at sign',
    '.': 'dot',
    '_': 'underscore',
    '-': 'dash',
    '+': 'plus'
  };
  return [...email].map(char => names[char] ?? char).join(' ');
}

export function inviteConfirmation(count: number, emails: string, emailStatus?: string) {
  const delivery = emailStatus === 'sent'
    ? 'Emails sent'
    : emailStatus === 'manual'
      ? 'Manual invite links created'
      : emailStatus === 'mixed'
        ? 'Some emails sent and some manual invite links created'
        : 'Invitations created';
  return `${delivery} for ${count} manager${count === 1 ? '' : 's'}: ${emails}.`;
}
