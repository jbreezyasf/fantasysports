import { NextResponse } from 'next/server';
import { assistantGmModelTools } from '../../../lib/assistant-gm/modelTools';
import { assistantGmToolContracts } from '../../../lib/assistant-gm/tools';
import { bigExecCapabilities } from '../../../lib/executive/capabilities';

export async function GET() {
  return NextResponse.json({
    schemaVersion: 'big-exec-capabilities.v1',
    capabilities: bigExecCapabilities,
    assistantGmTools: Object.entries(assistantGmToolContracts).map(([name, contract]) => ({
      name,
      ...contract
    })),
    modelToolDefinitions: assistantGmModelTools
  });
}
