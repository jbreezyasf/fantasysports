import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const appUrl = process.env.STADIUM_WORLD_APP_URL ?? 'http://127.0.0.1:3000';
const outDir = 'qa-artifacts/stadium-world';
await fs.mkdir(outDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const canvas = '.stadiumWorldCanvasShell canvas';

async function canvasMetrics(page) {
  return page.locator(canvas).evaluate((element) => {
    const gl = element.getContext('webgl2') ?? element.getContext('webgl');
    if (!gl) return { supported: false, gold: 0, green: 0, nonDark: 0 };
    const pixels = new Uint8Array(element.width * element.height * 4);
    gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let gold = 0;
    let green = 0;
    let nonDark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (r > 95 || g > 95 || b > 95) nonDark++;
      if (r > 110 && g > 80 && b < 110 && r > b * 1.35) gold++;
      if (g > 70 && g > r * 1.25 && g > b * 1.25) green++;
    }
    return { supported: true, gold, green, nonDark };
  });
}

// The camera flies between destinations; wait until it reports it has landed.
async function settle(page) {
  await page.locator(`${canvas}[data-camera="moving"]`).waitFor({ timeout: 8000 }).catch(() => {});
  await page.locator(`${canvas}[data-camera="settled"]`).waitFor({ timeout: 90000 });
  // Sample pixels only after a frame has actually been composited, not just after the canvas exists.
  await page.locator(`${canvas}[data-frame="drawn"]`).waitFor({ timeout: 30000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(300);
}

async function open(page, query = '') {
  await page.goto(`${appUrl}/visual/stadium-world${query}`, { waitUntil: 'networkidle' });
  await page.locator(`${canvas}[data-render-state="ready"]`).waitFor({ timeout: 30000 });
  await settle(page);
}

async function travel(page, label) {
  await page.locator('.stadiumWorldTravel').getByRole('button', { name: label, exact: true }).click();
  await settle(page);
}

async function verifyViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);

  const gate = await canvasMetrics(page);
  console.log(JSON.stringify({ viewport: name, stage: 'front-gate', metrics: gate }));
  await page.screenshot({ path: `${outDir}/${name}-1-front-gate.png` });
  assert(gate.supported, `${name}: WebGL context unavailable`);
  assert(gate.nonDark > 4000, `${name}: front gate is effectively blank (${gate.nonDark} non-dark pixels)`);
  assert(gate.gold > 1500, `${name}: franchise gold (banners, sign, facade) is not visible (${gate.gold})`);

  await travel(page, 'The Field');
  const field = await canvasMetrics(page);
  console.log(JSON.stringify({ viewport: name, stage: 'field', metrics: field }));
  await page.screenshot({ path: `${outDir}/${name}-2-field.png` });
  assert(field.green > 3000, `${name}: the field did not render (${field.green} green pixels)`);

  await travel(page, 'Owner’s Suite');
  const suite = await canvasMetrics(page);
  console.log(JSON.stringify({ viewport: name, stage: 'owners-suite', metrics: suite }));
  await page.screenshot({ path: `${outDir}/${name}-3-owners-suite.png` });
  assert(suite.gold > 1500, `${name}: the Champions Trophy did not render (${suite.gold})`);
  assert(await page.locator('.stadiumWorldCard h3').textContent() === 'Big Exec Champions Trophy', `${name}: trophy card did not open`);

  await travel(page, 'Rivalry Walk');
  await page.screenshot({ path: `${outDir}/${name}-4-rivalry-walk.png` });
  assert(new URL(page.url()).searchParams.get('zone') === 'rivalry-walk', `${name}: travel did not update the shareable zone link`);

  await travel(page, 'Legacy Wall');
  await page.screenshot({ path: `${outDir}/${name}-5-legacy-wall.png` });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `${name}: page scrolls horizontally by ${overflow}px`);
  assert(errors.length === 0, `${name}: page errors: ${errors.join('; ')}`);
  await context.close();
}

async function verifyStates(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // Deep link straight into the Owner's Suite.
  await open(page, '?zone=owners-suite');
  assert((await page.locator('.stadiumWorldTravel button[aria-pressed="true"]').textContent()) === 'Owner’s Suite', 'deep link did not open the Owner’s Suite');
  const earned = await canvasMetrics(page);

  // Brand-new franchise: the trophy must render locked (no Fantasy Core championship).
  await open(page, '?zone=owners-suite&titles=0&rivalries=0&unlocks=0');
  const locked = await canvasMetrics(page);
  console.log(JSON.stringify({ stage: 'locked-vs-earned-suite', earnedGold: earned.gold, lockedGold: locked.gold }));
  await page.screenshot({ path: `${outDir}/locked-owners-suite.png` });
  assert(locked.gold < earned.gold * 0.6, `locked trophy still renders as earned gold (${locked.gold} vs ${earned.gold})`);
  assert((await page.locator('.stadiumWorldStatus').textContent()) === 'Locked · waiting', 'locked trophy is not labelled as locked');

  // Mobile details expand without covering the destination bar.
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.locator('.stadiumWorldCard.expanded dl').waitFor();
  await page.screenshot({ path: `${outDir}/locked-owners-suite-details.png` });

  // Forced standard view: no canvas, fallback content present.
  await page.goto(`${appUrl}/visual/stadium-world?mode=2d`, { waitUntil: 'networkidle' });
  await page.locator('.stadiumWorldFallback').waitFor({ timeout: 10000 });
  assert(await page.locator('canvas').count() === 0, 'standard view still mounted a WebGL canvas');

  // Toggle from 3D to standard and back.
  await page.goto(`${appUrl}/visual/stadium-world`, { waitUntil: 'networkidle' });
  await page.locator(`${canvas}[data-render-state="ready"]`).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Standard view' }).click();
  await page.locator('.stadiumWorldFallback').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Enter 3D stadium' }).click();
  await page.locator(`${canvas}[data-render-state="ready"]`).waitFor({ timeout: 30000 });
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
