import { createClient } from '@supabase/supabase-js';
import { hostname } from 'node:os';
import { SelfHostedRenderer } from './selfHosted.js';
import { ManagedRenderer } from './managed.js';
import type { RenderPackage, RenderJob, RecapScene, RendererProvider } from './types.js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const provider = (process.env.RECAP_RENDER_PROVIDER || 'self_hosted') as RendererProvider;
const renderer = provider === 'managed' ? new ManagedRenderer() : new SelfHostedRenderer();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const workerId = process.env.RECAP_WORKER_ID || `${hostname()}-${process.pid}`;
const pollMs = Number(process.env.RECAP_POLL_MS || 3000);

async function claim(): Promise<RenderJob | null> {
  const { data, error } = await supabase.rpc('claim_recap_render', { p_worker_id: workerId, p_provider: renderer.provider });
  if (error) throw error;
  return (data as RenderJob | null) ?? null;
}

async function hydrate(render: RenderJob): Promise<RenderPackage> {
  const [{ data: script, error: scriptError }, { data: scenes, error: sceneError }] = await Promise.all([
    supabase.from('recap_scripts').select('id,title,summary').eq('id', render.recap_script_id).single(),
    supabase.from('recap_scenes').select('scene_index,scene_kind,duration_ms,payload').eq('recap_script_id', render.recap_script_id).order('scene_index')
  ]);
  if (scriptError) throw scriptError;
  if (sceneError) throw sceneError;
  if (!scenes?.length) throw new Error('Recap has no scenes');
  return { render, title: script.title, summary: script.summary, scenes: scenes as RecapScene[] };
}

async function workOnce() {
  const job = await claim();
  if (!job) return false;
  try {
    console.log(`[recap] rendering ${job.id} ${job.aspect_ratio} via ${renderer.provider}`);
    const result = await renderer.render(await hydrate(job));
    const { error } = await supabase.rpc('complete_recap_render', {
      p_render_id: job.id,
      p_storage_key: result.storageKey,
      p_bytes: result.bytes,
      p_duration_ms: result.durationMs,
      p_provider_job_id: result.providerJobId ?? null
    });
    if (error) throw error;
    console.log(`[recap] ready ${job.id} ${result.storageKey}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[recap] failed ${job.id}: ${message}`);
    await supabase.rpc('fail_recap_render', { p_render_id: job.id, p_error: message });
  }
  return true;
}

async function main() {
  console.log(`[recap] Big Exec worker ${workerId} provider=${renderer.provider}`);
  for (;;) {
    const worked = await workOnce();
    if (!worked) await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}

main().catch(error => { console.error(error); process.exit(1); });
