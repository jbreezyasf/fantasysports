# CI Accessibility Gate

## Status

BE-A11Y-032 is implemented.

## CI Integration

The GitHub Actions workflow now runs an explicit accessibility regression step:

```yaml
- name: Run accessibility regression suite
  run: npm run test:a11y
```

The root script delegates to the web workspace:

```bash
npm run test:a11y
```

The web workspace script runs only the accessibility automation folder:

```bash
npm run test:a11y --workspace @fantasy-all-sports/web
```

## Files

- `.github/workflows/ci.yml`
- `package.json`
- `apps/web/package.json`
- `apps/web/app/accessibility-automation/axeTooling.test.ts`
- `apps/web/app/accessibility-automation/p0ScreenRegression.test.ts`

## Gate Behavior

CI blocks merge when the accessibility regression suite fails. Failure output names the failing test file and screen-oriented assertion, for example:

- `app/accessibility-automation/axeTooling.test.ts`
- `app/accessibility-automation/p0ScreenRegression.test.ts`
- `P0 accessibility screen regressions > keeps draft state, clock, queue, and confirmed-pick accessibility semantics`

`npm test` still includes the accessibility tests through the normal Vitest run. The dedicated CI step exists so accessibility failures are visible as their own gate.
