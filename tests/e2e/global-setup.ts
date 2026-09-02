import { rmSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalSetup() {
  const runId = process.env.QA_RUN_ID || `${new Date().toISOString().slice(0, 10)}_10-manager-regression`;
  rmSync(join(process.cwd(), 'qa-artifacts', runId), { recursive: true, force: true });
}
