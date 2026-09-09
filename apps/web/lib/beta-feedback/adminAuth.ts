import 'server-only';

const CURRENT_OWNER_ADMIN = 'juanita.brazziel@gmail.com';

export function isBetaFeedbackAdmin(email?: string | null) {
  const configured = (process.env.BETA_FEEDBACK_ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set([CURRENT_OWNER_ADMIN, ...configured]);
  return Boolean(email && allowed.has(email.trim().toLowerCase()));
}

export function getConfiguredBetaFeedbackAdmins() {
  return [
    CURRENT_OWNER_ADMIN,
    ...(process.env.BETA_FEEDBACK_ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ];
}
