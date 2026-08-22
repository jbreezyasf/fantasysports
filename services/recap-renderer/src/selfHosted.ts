import { build } from 'esbuild';
import { chromium } from 'playwright';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { RecapRenderer, RenderPackage, RenderResult } from './types.js';

const FPS = Math.max(1, Number(process.env.RECAP_FPS || 24) || 24);
const CAPTURE_FPS = Math.max(1, Math.min(FPS, Number(process.env.RECAP_CAPTURE_FPS || 12) || 12));
const OUTPUT_ROOT = process.env.RECAP_OUTPUT_ROOT || '/var/lib/bigexec-recaps';
const PUBLIC_BASE = process.env.RECAP_PUBLIC_BASE_URL?.replace(/\/$/, '');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

const r2 = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

function dimensions(aspect: string) {
  return aspect === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

async function run(command: string, args: string[]) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function publishRender(filePath: string, objectKey: string) {
  if (!r2 || !R2_BUCKET) return null;
  const body = await readFile(filePath);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    Body: body,
    ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return PUBLIC_BASE ? `${PUBLIC_BASE}/${objectKey}` : objectKey;
}

export class SelfHostedRenderer implements RecapRenderer {
  provider = 'self_hosted' as const;

  async render(input: RenderPackage): Promise<RenderResult> {
    const work = await mkdtemp(join(tmpdir(), 'bigexec-recap-'));
    const frames = join(work, 'frames');
    await mkdir(frames, { recursive: true });
    const bundle = join(work, 'renderer.js');
    const browserEntry = resolve(process.cwd(), 'src/browser/render.ts');

    await build({ entryPoints: [browserEntry], bundle: true, platform: 'browser', format: 'iife', outfile: bundle, minify: true });
    const script = await readFile(bundle, 'utf8');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: dimensions(input.render.aspect_ratio) });
    const { width, height } = dimensions(input.render.aspect_ratio);
    await page.setContent(`<html><head><style>html,body{margin:0;background:#08090b;overflow:hidden}canvas{display:block}</style></head><body><canvas></canvas><script>${script}</script></body></html>`);

    let frameIndex = 0;
    let durationMs = 0;
    try {
      for (const scene of input.scenes) {
        const sceneFrames = Math.max(1, Math.round((scene.duration_ms / 1000) * CAPTURE_FPS));
        durationMs += scene.duration_ms;
        for (let i = 0; i < sceneFrames; i++) {
          const progress = sceneFrames <= 1 ? 1 : i / (sceneFrames - 1);
          await page.evaluate(async ({ width, height, scene, progress, title }) => {
            const render = (window as unknown as { BIG_EXEC_RENDER:(x:unknown)=>Promise<boolean> }).BIG_EXEC_RENDER;
            await render({ width, height, scene, progress, title });
          }, { width, height, scene, progress, title: input.title });
          const name = String(frameIndex++).padStart(6, '0');
          await page.locator('canvas').screenshot({ path: join(frames, `${name}.png`) });
        }
      }
    } finally {
      await browser.close();
    }

    const targetDir = join(OUTPUT_ROOT, input.render.recap_script_id);
    await mkdir(targetDir, { recursive: true });
    const suffix = input.render.aspect_ratio.replace(':', 'x');
    const fileName = `${input.render.id}-${suffix}.mp4`;
    const output = join(targetDir, fileName);
    await run('ffmpeg', ['-y','-framerate',String(CAPTURE_FPS),'-i',join(frames,'%06d.png'),'-r',String(FPS),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',output]);
    const info = await stat(output);

    const objectKey = `renders/${input.render.recap_script_id}/${fileName}`;
    const r2StorageKey = await publishRender(output, objectKey);
    const storageKey = r2StorageKey || (PUBLIC_BASE ? `${PUBLIC_BASE}/${objectKey}` : output);

    await rm(work, { recursive: true, force: true });
    return { storageKey, bytes: info.size, durationMs };
  }
}
