type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  idempotencyKey?: string;
};

export function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_LEAGUE_FROM);
}

export async function sendTransactionalEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = input.from ?? process.env.EMAIL_LEAGUE_FROM;
  if (!apiKey || !from) return { sent: false as const, reason: 'not_configured' as const };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {})
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html })
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('Resend delivery failed', response.status, detail);
    return { sent: false as const, reason: 'provider_error' as const };
  }

  const data = await response.json() as { id?: string };
  return { sent: true as const, id: data.id ?? null };
}
