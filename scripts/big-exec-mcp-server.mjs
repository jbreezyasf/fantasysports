#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appUrl = (process.env.BIG_EXEC_APP_URL || 'https://www.bigexecfs.com').replace(/\/$/, '');
let buffer = Buffer.alloc(0);

const tools = [
  {
    name: 'get_openapi',
    description: 'Return the Big Exec machine API OpenAPI document from this repository.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'get_health',
    description: 'Read public Big Exec health status.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'list_capabilities',
    description: 'Read Big Exec capability and Assistant GM tool inventory. Uses the configured app URL.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'call_machine_api',
    description: 'Call a documented Big Exec machine API path with optional authenticated cookie or bearer token supplied through environment.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', pattern: '^/api/' },
        method: { enum: ['GET', 'POST'] },
        body: { type: 'object' }
      }
    }
  }
];

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function content(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

async function fetchJson(path, init = {}) {
  const headers = { accept: 'application/json', ...(init.headers ?? {}) };
  if (process.env.BIG_EXEC_SESSION_COOKIE) headers.cookie = process.env.BIG_EXEC_SESSION_COOKIE;
  if (process.env.BIG_EXEC_BEARER_TOKEN) headers.authorization = `Bearer ${process.env.BIG_EXEC_BEARER_TOKEN}`;
  const response = await fetch(`${appUrl}${path}`, { ...init, headers, cache: 'no-store' });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

async function callTool(name, args = {}) {
  if (name === 'get_openapi') {
    return { content: content(JSON.parse(readFileSync(join(process.cwd(), 'apps/web/public/openapi.json'), 'utf8'))) };
  }
  if (name === 'get_health') {
    return { content: content(await fetchJson('/api/health')) };
  }
  if (name === 'list_capabilities') {
    return { content: content(await fetchJson('/api/capabilities')) };
  }
  if (name === 'call_machine_api') {
    const path = typeof args.path === 'string' && args.path.startsWith('/api/') ? args.path : null;
    if (!path) throw new Error('path must start with /api/');
    const method = args.method === 'POST' ? 'POST' : 'GET';
    return {
      content: content(await fetchJson(path, {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify(args.body ?? {}) : undefined
      }))
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  if (message.method === 'notifications/initialized') return;
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'big-exec', version: '0.1.0' }
      }
    });
    return;
  }
  if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools } });
    return;
  }
  if (message.method === 'tools/call') {
    try {
      send({ jsonrpc: '2.0', id: message.id, result: await callTool(message.params?.name, message.params?.arguments ?? {}) });
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { isError: true, content: content(error instanceof Error ? error.message : 'Tool failed') }
      });
    }
    return;
  }
  if (message.id !== undefined) {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
  }
}

function parseMessages() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;
    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);
    void handle(JSON.parse(body));
  }
}

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  parseMessages();
});
