type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  idempotencyKey?: string;
  // Extra message headers, e.g. List-Unsubscribe.
  headers?: Record<string, string>;
};

export type SendEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: 'not_configured' }
  | { sent: false; reason: 'provider_error'; status: number | null; detail: string };

const DEFAULT_LEAGUE_FROM = 'Big Exec Fantasy Sports <league@bigexecfs.com>';

export function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_BIGEXEC_API_KEY);
}

// Never throws: a missing key, a network failure and a provider rejection all come back as a
// result, so a request path can report the problem instead of crashing.
export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_BIGEXEC_API_KEY;
  const from = input.from ?? process.env.EMAIL_LEAGUE_FROM ?? DEFAULT_LEAGUE_FROM;
  if (!apiKey) return { sent: false, reason: 'not_configured' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {})
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.headers && Object.keys(input.headers).length ? { headers: input.headers } : {})
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Resend delivery failed', response.status, detail);
      return { sent: false, reason: 'provider_error', status: response.status, detail: detail.slice(0, 300) };
    }

    const data = await response.json().catch(() => ({})) as { id?: string };
    return { sent: true, id: data.id ?? null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Resend delivery failed', detail);
    return { sent: false, reason: 'provider_error', status: null, detail: detail.slice(0, 300) };
  }
}
