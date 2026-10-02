import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const appUrl = process.env.STADIUM_WORLD_APP_URL ?? 'http://127.0.0.1:3000';
const outDir = 'qa-artifacts/stadium-world';
await fs.mkdir(outDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function canvasMetrics(page) {
  return page.locator('.stadiumWorldCanvasShell canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { supported: false, gold: 0, light: 0, nonDark: 0, width: canvas.width, height: canvas.height };
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let gold = 0;
    let light = 0;
    let nonDark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (r > 95 || g > 95 || b > 95) nonDark++;
      if (r > 110 && g > 80 && b < 110 && r > b * 1.35) gold++;
      if (r > 135 && g > 135 && b > 120) light++;
    }
    return { supported: true, gold, light, nonDark, width: canvas.width, height: canvas.height };
  });
}

async function verifyViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${appUrl}/visual/stadium-world`, { waitUntil: 'networkidle' });
  await page.locator('.stadiumWorldCanvasShell canvas[data-render-state="ready"]').waitFor({ timeout: 15000 });

  const initial = await canvasMetrics(page);
  console.log(JSON.stringify({ viewport: name, stage: 'concourse', metrics: initial }));
  await page.screenshot({ path: `${outDir}/${name}-concourse.png`, fullPage: true });
  assert(initial.supported, `${name}: WebGL context unavailable`);
  assert(initial.nonDark > 1500, `${name}: canvas is effectively blank (${initial.nonDark} non-dark pixels)`);
  assert(initial.gold > 150, `${name}: expected Big Exec gold geometry is not visible (${initial.gold} pixels)`);
  assert(initial.light > 80, `${name}: expected light/ivory geometry is not visible (${initial.light} pixels)`);

  await page.getByRole('button', { name: 'Owner’s Office' }).click();
  await page.locator('.stadiumWorldCanvasShell canvas[data-render-state="ready"]').waitFor({ timeout: 10000 });
  await page.getByText('Owner’s Office', { exact: true }).first().waitFor();
  await page.waitForTimeout(1800); // let the camera finish travelling
  const office = await canvasMetrics(page);
  console.log(JSON.stringify({ viewport: name, stage: 'owners-office', metrics: office }));
  await page.screenshot({ path: `${outDir}/${name}-owners-office.png`, fullPage: true });
  assert(office.gold > 100, `${name}: Owner's Office trophy geometry did not render`);

  await page.getByRole('button', { name: 'Rivalry Hall' }).click();
  await page.locator('.stadiumWorldCanvasShell canvas[data-render-state="ready"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1800);
  assert(new URL(page.url()).searchParams.get('zone') === 'rivalry-hall', `${name}: fast travel did not update the shareable zone link`);
  const rivalry = await canvasMetrics(page);
  console.log(JSON.stringify({ viewport: name, stage: 'rivalry-hall', metrics: rivalry }));
  await page.screenshot({ path: `${outDir}/${name}-rivalry-hall.png`, fullPage: true });
  assert(rivalry.gold > 100, `${name}: Rivalry Hall monument geometry did not render`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `${name}: page scrolls horizontally by ${overflow}px`);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(JSON.stringify({ viewport: name, initial, office, rivalry }));
  await context.close();
}

async function verifyStates(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // Deep link straight into the Owner's Office.
  await page.goto(`${appUrl}/visual/stadium-world?zone=owners-office`, { waitUntil: 'networkidle' });
  await page.locator('.stadiumWorldCanvasShell canvas[data-render-state="ready"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1800);
  assert((await page.locator('.stadiumWorldTravel button[aria-pressed="true"]').textContent()) === 'Owner’s Office', 'deep link did not open the Owner’s Office');
  const earned = await canvasMetrics(page);
  await page.screenshot({ path: `${outDir}/deeplink-owners-office.png`, fullPage: true });

  // Brand-new franchise: trophy must render locked (no Fantasy Core championship).
  await page.goto(`${appUrl}/visual/stadium-world?zone=owners-office&titles=0&rivalries=0&unlocks=0`, { waitUntil: 'networkidle' });
  await page.locator('.stadiumWorldCanvasShell canvas[data-render-state="ready"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1800);
  const locked = await canvasMetrics(page);
  console.log(JSON.stringify({ stage: 'locked-vs-earned-office', earnedGold: earned.gold, lockedGold: locked.gold }));
  await page.screenshot({ path: `${outDir}/locked-owners-office.png`, fullPage: true });
  assert(locked.gold < earned.gold * 0.5, `locked trophy still renders as earned gold (${locked.gold} vs ${earned.gold})`);
  assert(await page.getByText('LOCKED / WAITING').count() === 3, 'locked objects are not labelled as locked');

  // Forced standard view: no canvas, fallback content present, Three.js chunk not needed.
  await page.goto(`${appUrl}/visual/stadium-world?mode=2d`, { waitUntil: 'networkidle' });
  await page.locator('.stadiumWorldFallback').waitFor({ timeout: 10000 });
  assert(await page.locator('canvas').count() === 0, 'standard view still mounted a WebGL canvas');
  await page.screenshot({ path: `${outDir}/standard-view.png`, fullPage: true });

  // Toggle from 3D to standard and back.
  await page.goto(`${appUrl}/visual/stadium-world`, { waitUntil: 'networkidle' });
  await page.locator('.stadiumWorldCanvasShell canvas[data-render-state="ready"]').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Switch to standard view' }).click();
  await page.locator('.stadiumWorldFallback').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Enter 3D stadium' }).click();
  await page.locator('.stadiumWorldCanvasShell canvas[data-render-state="ready"]').waitFor({ timeout: 15000 });
  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
try {
  await verifyViewport(browser, 'mobile-390x844', { width: 390, height: 844 });
  await verifyViewport(browser, 'desktop-1440x900', { width: 1440, height: 900 });
  await verifyStates(browser);
  console.log('STADIUM WORLD VISUAL QA: PASS');
} finally {
  await browser.close();
}
