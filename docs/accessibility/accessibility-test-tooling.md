# Accessibility Test Tooling

## Status

BE-A11Y-030 is implemented for the current web stack.

## Stack Fit

- Frontend: `apps/web` is a Next.js App Router React app.
- Existing automated tests: Vitest unit/render tests.
- Added tooling: `axe-core` with `jsdom` inside Vitest.
- Reason: this adds accessibility assertions without introducing a duplicate UI test framework.

## Files

- `apps/web/app/accessibility-automation/axeTestUtils.ts`
- `apps/web/app/accessibility-automation/axeTooling.test.ts`
- `apps/web/package.json`
- `package-lock.json`

## Local Command

Run all current web tests, including accessibility tooling:

```bash
npm test --workspace @fantasy-all-sports/web
```

## Coverage

The smoke suite proves that the configured tooling catches known injected defects for:

- missing accessible button names
- missing form labels
- invalid ARIA roles
- invalid ARIA state values
- unnamed dialogs

`axe-core` can also report common structural, ARIA, landmark, label, and color-contrast rules where the DOM environment provides enough information. `jsdom` does not provide real layout, so mobile touch-target and true rendered contrast checks still require browser/device QA.

## Usage

Use `expectNoAxeViolations(html)` for server-rendered markup checks:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { expectNoAxeViolations } from '../accessibility-automation/axeTestUtils';

await expectNoAxeViolations(renderToStaticMarkup(<Component />));
```

Use `runAxeOnHtml(html)` when a test needs to assert that a specific known defect is detected.
