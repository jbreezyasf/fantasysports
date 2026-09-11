import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeAudit(path, event) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ recordedAt: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
}
