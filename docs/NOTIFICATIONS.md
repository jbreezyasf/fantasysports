# Notifications: league announcements by email and web push

**Status 2026-10-04:** built on branch `feat/notifications-email-and-push`. **Nothing has been sent to anyone.** The migration is written and **not applied**. No environment variable has been set. In production today this code does nothing: the settings page says notifications are unavailable, the push routes answer 503, and the operator page can neither draft nor send.

Evidence labels follow `AGENTS.md`. **PROVEN (test)** means executed in the unit tests, in `supabase/tests/notifications.sql` on a local Postgres 16 with synthetic data, or in the local visual harness. **UNVERIFIED** means it has not been run against a real provider, a real browser push service, or production.

## 1. What exists

| Piece | What it does |
|---|---|
| Preferences and consent | One row per user: league email on/off, push on/off, six category switches, language. No row means the defaults: league email **on**, push **off**, every category on, English. |
| Unsubscribe | Every email has a signed link (no login) and `List-Unsubscribe` / `List-Unsubscribe-Post` headers. It switches league email off. Password-reset and other security email is sent by Supabase Auth and never consults these preferences. |
| Settings page | `/settings/notifications`, reached from **More → Notifications** in the product navigation. English and Spanish. |
| Email | The existing Resend integration (`apps/web/lib/email/resend.ts`) extended with message headers and made non-throwing; an accessible HTML + plain-text template. |
| Web push | Standard Web Push with VAPID, through the `web-push` library (added; nothing equivalent was installed). Subscribe/unsubscribe routes, service-worker handlers, pruning of dead subscriptions. |
| Announcements | A `league_announcement` notification for one league season's members, with English and optional Spanish text, and a sender that fans out per member and per channel. |
| Operator page | `/ops/announcements`: draft, preview, recipient counts, dry run, test to self, confirm and send. `super_admin` only. |
| First announcement | Drafted, not sent: `docs/product/ANNOUNCEMENT_CHAOS_WEEK_2026.md`. |

Only **league announcements** are sent by anything. The other five categories (lineup-lock reminder, final scores, trade offers, waiver results, weekly recap) are stored preferences with no sender yet; the settings page says so beside each one.

## 2. Turning it on, in order

Do these in order. Each step is safe to stop after.

1. **Apply the migration** `supabase/migrations/20261004030000_notifications.sql` to production. It only creates new tables and functions; it changes nothing that exists. Recommended first: `supabase/migrations_proposed/20261004000000_rate_limit_counters.sql`, because without it the rate limits on the new routes are not enforced (see section 7).
2. **Set the environment variables** in Vercel (Production), section 3. Leave `NOTIFICATIONS_SEND_ENABLED` unset for now.
3. **Make yourself an operator** if you are not: `OPS_SUPER_ADMIN_EMAILS` or `OPS_SUPER_ADMIN_USER_IDS` must contain your account (`ops_staff_roles` had 0 rows in production on 2026-10-04, PROVEN).
4. **Deploy.**
5. **Look at `/ops/announcements`.** The Readiness list must say the migration is applied, email is configured and web push is configured. It will say live sending is switched off.
6. **Open `/settings/notifications`** on your own account. Save once. On your phone, turn push on (on iPhone or iPad: add Big Exec to the Home Screen first, open it from there, then turn push on).
7. **Create the draft**: on `/ops/announcements`, "Create the Chaos Week draft". Read the preview in both languages.
8. **Dry run.** It sends nothing and records, per member, what would be sent. Check the counts.
9. **Set `NOTIFICATIONS_SEND_ENABLED=true`** and redeploy.
10. **Send a test to me only.** You receive the email (subject starts with `[TEST]`) and, if your device has push on, the push. Check the email in your real inbox, press the unsubscribe link, confirm it worked, then turn league email back on in settings.
11. **Send.** "Review and send to N members" opens the confirmation in the page; type `SEND`; press "Send now".
12. Read the result line. If it reports failures, the announcement stays in "sending": press send again and only the failed recipients are retried.

To switch everything off again: unset `NOTIFICATIONS_SEND_ENABLED` and redeploy.

## 3. Environment variables

Set in Vercel. Names are also in `.env.example` with empty values. Never commit values.

| Variable | Needed for | Notes |
|---|---|---|
| `RESEND_BIGEXEC_API_KEY` | email | Already used by the invite email. UNVERIFIED whether it is set in Vercel. |
| `EMAIL_LEAGUE_FROM` | email | Already exists. Default `Big Exec Fantasy Sports <league@bigexecfs.com>`. The sending domain must be verified in Resend (UNVERIFIED). |
| `NEXT_PUBLIC_APP_URL` | email | Already exists. Used for links in the email. Must be the real origin, e.g. `https://bigexecfs.com`. |
| `NOTIFICATIONS_UNSUBSCRIBE_SECRET` | email | **New.** 32 or more random characters, e.g. `openssl rand -base64 48`. Signs unsubscribe links. If it changes, links in already-sent emails stop working. Email is refused while it is missing, because every email must carry a working unsubscribe link. |
| `VAPID_PUBLIC_KEY` | push | **New.** See below. Sent to browsers; not a secret. |
| `VAPID_PRIVATE_KEY` | push | **New.** Secret. |
| `VAPID_SUBJECT` | push | **New.** A contact for the push services: `mailto:you@yourdomain` or an `https://` URL. |
| `NOTIFICATIONS_SEND_ENABLED` | test and live sends | **New.** Must be exactly `true`. Anything else: only dry runs work. |
| `EMAIL_POSTAL_ADDRESS` | email footer | **New, optional.** A postal address printed in the footer. See section 8. |
| `SUPABASE_SERVICE_ROLE_KEY` | operator page, sender, unsubscribe | Already exists. |
| `OPS_SUPER_ADMIN_EMAILS` / `OPS_SUPER_ADMIN_USER_IDS` | operator access | Already exist. |

### Generating VAPID keys

Run once, on your own machine, in the repository:

```bash
npx web-push generate-vapid-keys
```

It prints a public key and a private key. Put them in `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Keep the pair for the life of the product: if the keys change, every stored subscription stops working and each manager must turn push on again.

## 4. Architecture

```
/ops/announcements (super_admin)            /settings/notifications (any signed-in user)
        |                                              |
  server actions  -- requireAnnouncementOperator       |-- set_notification_preferences (RPC, own row)
        |                                              |-- POST /api/push/subscribe, /unsubscribe
  lib/notifications/service.ts  sendAnnouncement(mode)         -> save_push_subscription / revoke_push_subscription
        |
  lib/notifications/fanout.ts   for each member, for each channel:
        |     claim (notification + user + channel + purpose)  -> notification_claim_delivery
        |     preference check                                 -> lib/notifications/preferences.ts
        |     email: render, sign unsubscribe token, send      -> lib/email/resend.ts (Resend)
        |     push: encrypt and send to each device            -> web-push (VAPID)
        |     record outcome                                   -> notification_deliveries
        v
  notification_finish_send  ("sent" only when no failure is left)

Email link -> /unsubscribe (one button) -> POST /api/notifications/unsubscribe -> notification_unsubscribe_email
Mail client "unsubscribe" button        -> POST /api/notifications/unsubscribe (RFC 8058 one-click)
Push service -> public/sw.js  push -> showNotification;  notificationclick -> focus or open the link
```

Code:

| Path | Role |
|---|---|
| `apps/web/lib/notifications/preferences.ts` | Categories, defaults, `resolveChannel` (the one preference rule) |
| `.../unsubscribeToken.ts` | HMAC-SHA256 signed token `v1.<user>.<signature>`; no email address in it; no expiry |
| `.../format.ts` | The limited body formatting: paragraphs, `## ` headings, `- ` lists, `**bold**`. Everything else is escaped |
| `.../emailTemplate.ts` | HTML and plain-text league notice, English and Spanish |
| `.../announcements.ts` | Announcement shape, validation (lengths, internal link only, no gambling words), push payload |
| `.../channels.ts` | Email and push senders, and "is it configured" checks |
| `.../fanout.ts` | The sender job |
| `.../store.ts`, `.../service.ts` | Database access (service role) and the three send modes |
| `.../seeds/chaosWeek2026.ts` | The first announcement, as a draft |
| `apps/web/app/settings/notifications/` | Settings page, client component, strings (EN/ES), CSS |
| `apps/web/app/unsubscribe/`, `apps/web/app/api/notifications/unsubscribe/` | Unsubscribe page and endpoint |
| `apps/web/app/api/push/subscribe`, `.../unsubscribe` | Push subscription routes |
| `apps/web/app/ops/announcements/` | Operator pages and actions |
| `apps/web/public/sw.js` | `push` and `notificationclick` handlers added below the unchanged caching code |

## 5. Tables and functions

Migration `20261004030000_notifications.sql`. RLS is enabled on all four tables. PROVEN (test) for everything in this section.

| Table | Who can do what |
|---|---|
| `notification_preferences` | A signed-in user can **read their own row**. No direct writes. |
| `push_subscriptions` | A signed-in user can read `id, user_id, user_agent, created_at, last_success_at, revoked_at` of **their own rows**. The endpoint and keys are not readable. No direct writes. Columns: endpoint, p256dh, auth, user, user agent, created, last success, revoked (+ reason). |
| `notifications` | No access for signed-in users. Title, body, link, push title and text, `variants` (other languages), audience (`league_season_id`), `created_by`, status `draft / scheduled / sending / sent / cancelled`, result. Content cannot be edited once sending has begun (trigger). |
| `notification_deliveries` | No access for signed-in users. Unique on `(notification_id, user_id, channel, purpose)`. Status `sending / sent / failed / skipped / would_send`. |

| Function | Caller | Purpose |
|---|---|---|
| `set_notification_preferences` | signed-in user | Upsert own preferences. Validates category names and language. |
| `save_push_subscription` | signed-in user | Store own browser subscription (max 10 active); switches push on. |
| `revoke_push_subscription` | signed-in user | Revoke own subscription. |
| `notification_unsubscribe_email` | service role | Switch league email off after the server verified the signed token. |
| `notification_audience` | service role | Members of a league season with email and effective preferences. |
| `notification_claim_delivery` | service role | The idempotency gate. |
| `notification_begin_send` / `notification_finish_send` | service role | Status transitions. |

Every function is `SECURITY DEFINER` with `search_path = ''` (the trigger function is not definer and also pins `search_path`). User functions raise without `auth.uid()`. Service functions are granted to `service_role` only and also raise if `auth.uid()` is set.

### Idempotency and retries

- A delivery is claimed before it is attempted. `sent` can never be claimed again, so **a retried send cannot double-send**.
- `failed` is retried on the next run, up to 5 attempts. After that it stays `failed` and is visible on the operator page.
- `skipped` (preference off, no email address, no device) and `would_send` (dry run) do not block a later send.
- `sending` left behind by a crash is **not** retried automatically: the provider may or may not have accepted the message. For email, Resend also receives the idempotency key `notification/<id>/<user>/email`, so a repeat inside Resend's idempotency window is dropped by the provider. For push there is no such protection, so it is left for a person to look at.
- One member's failure never stops the others (PROVEN, test: provider error, thrown exception, and a failing database write for one recipient).
- A push subscription that returns 404 or 410 is revoked and not used again. A member with several devices is marked `sent` if at least one device accepted it; a device that failed for another reason is not retried once another device succeeded.
- A test send uses `purpose = 'test'`, so it never blocks or counts as the real send.

`scheduled` exists as a status and `scheduled_for` as a column, but **nothing sends on a schedule**. There is no cron job. Sending happens only when an operator presses the button.

## 6. Web push in the browser

- The permission prompt is opened only by the "Turn on push on this device" button (PROVEN: unit test on the source, and in Chromium the request count is 0 before the click and 1 after).
- **iPhone and iPad:** push works only after the app is added to the Home Screen and opened from there. The settings page says so in every state and has a "Show install steps" button that re-opens the existing install card.
- If a browser has no push support, permission is blocked, or the server has no VAPID keys, the page says which, and offers no button.
- The service worker shows `{ title, body, url, tag, lang }` from the encrypted payload and opens only same-origin URLs.

UNVERIFIED: delivery through real push services (Apple, Google, Mozilla), and behaviour on a real iPhone. The harness replaces the browser push APIs.

## 7. Limits and known gaps

- **Rate limiting fails open.** `/api/push/*` (20 per 10 minutes per user) and the unsubscribe endpoint (30 per 10 minutes per address) use the existing limiter, which allows everything until `rate_limit_counters` exists. That table was absent in production on 2026-10-04 (PROVEN).
- **The unsubscribe link opens a page with one button** rather than unsubscribing on the click itself. Mail scanners fetch links, and a GET that unsubscribes would unsubscribe people who never clicked. The `List-Unsubscribe` header is true one-click (the mail client POSTs).
- **Category switches apply to both channels.** There is no "email for trades, push for scores" matrix.
- **Language** for email and push is its own setting, separate from the on-screen language toggle.
- **`notifications` has no update trail** beyond `ops_audit_events` (draft created, updated, dry run, test, live, cancelled).
- The new routes are browser routes and are not in `apps/web/public/openapi.json`.
- The Vercel function time limit bounds a send. Ten members is far inside it; a league of hundreds would need batching. UNVERIFIED at any size against real providers.

## 8. Email compliance notes

- A league announcement is a transactional / league-operations message. It still carries: the reason the member received it, the sender name ("Sent by Big Exec Fantasy Sports."), an unsubscribe link and header, and a link to notification settings.
- **A physical postal address is required by CAN-SPAM in every commercial email. No postal address exists anywhere in this repository**, and no legal entity name beyond "Big Exec Fantasy Sports". If any message is promotional (the weekly recap could be argued to be), set `EMAIL_POSTAL_ADDRESS` first; the footer prints it when set.
- No gambling, odds or wagering language: the draft validator rejects it (`docs/EMAIL_SYSTEM.md`, template rule 7).
- No team or league logos. The only image is the Big Exec wordmark, with alt text.

## 9. Verification

| What | Result |
|---|---|
| Unit tests | 10 new files, see `docs/CURRENT_WORK.md` for counts |
| SQL test | `supabase/tests/notifications.sql`, 110 checks, local Postgres 16 |
| Visual harness | `node scripts/qa-notifications.cjs`: 58 page states at 1440 and 390 (email at 640 and 390), no horizontal overflow, no axe WCAG A/AA violations, no console errors. Images and `checks.json` in `qa-artifacts/2026-10-04-notifications/` |
| Real email, real push, production | **Not run. Nothing was sent.** |

Run the SQL test against an empty throwaway database, never production:

```bash
createdb big_exec_notifications_test
psql -v ON_ERROR_STOP=1 -d big_exec_notifications_test -f supabase/tests/notifications.sql
```
