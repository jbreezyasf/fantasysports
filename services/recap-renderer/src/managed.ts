import type { RecapRenderer, RenderPackage, RenderResult } from './types.js';

export class ManagedRenderer implements RecapRenderer {
  provider = 'managed' as const;

  async render(_input: RenderPackage): Promise<RenderResult> {
    throw new Error('Managed renderer adapter is not configured. Self-hosted is the active Big Exec provider.');
  }
}
