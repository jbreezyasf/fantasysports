# Notifications: local visual verification, 2026-10-04

Produced by `node scripts/qa-notifications.cjs` with Chromium 1194 from `/opt/pw-browsers`.

**What this is.** The real page components (`/settings/notifications`, `/unsubscribe`, `/ops/announcements`, `/ops/announcements/[id]`) and the real email template, rendered with synthetic data. Inside the script only, the database client, the ops permission gate, the server actions and the browser push APIs are replaced with stand-ins. **Nothing was sent and nothing was saved.** This is not production proof, not authentication proof, and not proof of delivery.

**Result.** 58 page states. No horizontal overflow, no axe violations (WCAG 2.0/2.1/2.2 A and AA, colour contrast included), no form control without a label, no console errors. Per-state detail is in `checks.json`.

| Files | State |
|---|---|
| `settings-default-*` | Defaults: league email on, push off |
| `settings-push-on-*` | After pressing "Turn on push on this device". The permission request count was 0 before the click and 1 after; the result was announced in the polite live region |
| `settings-push-denied-*` | Permission refused; announced in the assertive live region |
| `settings-saved-keyboard-*` | Operated with the keyboard only (Tab, Space, Enter); the submitted form matched the toggles; "saved" announced |
| `settings-save-error-*` | Save failed; announced assertively |
| `settings-devices-on-*`, `settings-blocked-*`, `settings-push-not-configured-*` | Push on with a device listed; notifications blocked in the browser; server has no VAPID keys |
| `settings-iphone-needs-install-*` | iPhone user agent, not installed: explanation, and "Show install steps" opened the existing install card |
| `settings-spanish-*` | Spanish (`lang="es-419"`) |
| `settings-unavailable-*`, `settings-no-league-*` | Tables absent (no controls shown); a user with no league |
| `unsubscribe-*` | Confirm, done and invalid, in English and Spanish |
| `ops-list-*`, `ops-list-not-installed-*` | Operator list: ready, and with nothing configured |
| `ops-detail-draft-*`, `ops-detail-not-ready-*` | Draft with previews and recipient counts; the same with no provider configured |
| `ops-detail-confirm-*`, `-confirmed-submit-*`, `-confirm-cancelled-*` | The in-page confirmation: focus moved to its heading; "Send now" did nothing until SEND was typed; Escape closed it and returned focus to the opener |
| `ops-detail-failed-retry-*`, `ops-detail-sent-*` | A partly failed send waiting for retry; a sent announcement with locked content |
| `ops-detail-email-preview-*` | The email preview frame, captured on its own |
| `email-en-*`, `email-es-*`, `email-en-images-off-*` | The Chaos Week email at 640 and 390 wide, and with images blocked |

Widths: 1440 and 390 for pages; 640 and 390 for the email.

**Capture artefacts, not defects.** In full-page captures, fixed elements (the navigation rail, the mobile navigation bar, the skip link, the advisor button) are painted where the first viewport ended, so they appear part-way down tall pages. The email preview frames in the full-page operator captures are painted black; `ops-detail-email-preview-*` shows the frame's real content.

**Not covered.** Real push services, a real iPhone, a real inbox, mail-client rendering (Gmail, Outlook, Apple Mail), screen-reader listening, and production.

**In git.** `qa-artifacts/` is ignored by `.gitignore`. As with the earlier executive-world run, only this file, `checks.json` and twelve representative images are committed (`settings-default-1440/390`, `settings-push-on-390`, `settings-spanish-390`, `settings-iphone-needs-install-390`, `unsubscribe-confirm-390`, `ops-list-1440`, `ops-detail-draft-1440`, `ops-detail-confirm-1440/390`, `email-en-390`, `email-es-390`). Run the script to regenerate all 60.
