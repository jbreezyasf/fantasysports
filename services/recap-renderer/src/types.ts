export type AspectRatio = '16:9' | '9:16';
export type RendererProvider = 'self_hosted' | 'managed';

export type RecapScene = {
  scene_index: number;
  scene_kind: string;
  duration_ms: number;
  payload: Record<string, unknown>;
};

export type RenderJob = {
  id: string;
  recap_script_id: string;
  aspect_ratio: AspectRatio;
  status: string;
  renderer_provider: RendererProvider;
  attempts: number;
};

export type RenderPackage = {
  render: RenderJob;
  title: string;
  summary: string;
  scenes: RecapScene[];
};

export type RenderResult = {
  storageKey: string;
  bytes: number;
  durationMs: number;
  providerJobId?: string | null;
};

export interface RecapRenderer {
  provider: RendererProvider;
  render(input: RenderPackage): Promise<RenderResult>;
}
