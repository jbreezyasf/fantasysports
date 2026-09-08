import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'big-exec-pro-football',
    checkedAt: new Date().toISOString()
  });
}
