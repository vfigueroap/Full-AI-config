import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { cargarCatalogo } from '../runtime/node/catalogo.mjs';
import { abrirEstado } from '../runtime/node/estado.mjs';
import { crearCapacidades } from './capacidades.mjs';

export const PROTOCOL_VERSION = '2025-11-25';
export const MAX_MESSAGE_BYTES = 256 * 1024;
const SERVER_INFO = { name: 'ai-personal-tools', version: '0.3.0' };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ERROR_PARSE = { code: -32700, message: 'Parse error' };
const ERROR_INVALID = { code: -32600, message: 'Invalid request' };
const ERROR_METHOD = { code: -32601, message: 'Method not found' };
const ERROR_PARAMS = { code: -32602, message: 'Invalid params' };
const ERROR_NOT_READY = { code: -32002, message: 'Server not initialized' };
const ERROR_INTERNAL = { code: -32603, message: 'Internal error' };

function isId(id) { return typeof id === 'string' || Number.isSafeInteger(id); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function rpcError(id, error) { return { jsonrpc: '2.0', id, error }; }
function jsonSize(value) { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
function envPath(root, value, fallback) { return path.resolve(root, value || fallback); }

async function runtime({ root = ROOT, env = process.env } = {}) {
  const catalogo = await cargarCatalogo(root);
  const agentId = env.AI_AGENT_ID || 'investigador';
  const agente = catalogo.agentes[agentId];
  if (!agente || agente.role !== 'secondary') throw new Error('AI_AGENT_ID debe identificar un agente secundario existente.');
  const material = env.AI_MATERIAL_DIR ? envPath(root, env.AI_MATERIAL_DIR, 'data/material') : undefined;
  const dataDir = envPath(root, env.AI_DATA_DIR, 'data');
  let estado;
  const getState = () => estado ??= abrirEstado(dataDir);
  const estadoDiferido = new Proxy(Object.create(null), {
    get(_target, key) {
      if (key === 'then') return undefined;
      return (...args) => {
        const state = getState();
        const method = state[key];
        if (typeof method !== 'function') throw new Error('State method unavailable');
        return Reflect.apply(method, state, args);
      };
    },
  });

  let jobId = `external:${agentId}`;
  const makeCapabilities = () => crearCapacidades({ estado: estadoDiferido, jobId, catalogo, material, env });
  const listedCapabilities = makeCapabilities();
  const tools = Object.create(null);
  for (const id of agente.herramientas) {
    const definition = catalogo.herramientas[id];
    if (!definition || typeof listedCapabilities[id] !== 'function' || !definition.input_schema || !['read', 'local_write', 'approval'].includes(definition.effect)) continue;
    tools[id] = { name: id, description: definition.description, inputSchema: definition.input_schema };
  }

  async function callTool(name, input) {
    if (typeof name !== 'string' || !Object.hasOwn(tools, name)) return { content: [{ type: 'text', text: 'Tool not available for this agent.' }], isError: true };
    if (!isRecord(input)) return { content: [{ type: 'text', text: 'Tool arguments must be an object.' }], isError: true };
    try {
      if (name === 'proponer_archivo') {
        const job = await getState().encargoExterno({ objetivo: `Propuesta de archivo desde MCP (${agentId})` });
        jobId = job.id;
      }
      const tool = makeCapabilities()[name];
      if (typeof tool !== 'function') return { content: [{ type: 'text', text: 'Tool not available in this configuration.' }], isError: true };
      const result = await tool(input);
      if (name === 'proponer_archivo') {
        getState().evento(jobId, agentId, 'tool', { tool: name, status: 'ok', approvalId: result.id });
      }
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      const response = { content: [{ type: 'text', text }] };
      if (jsonSize(response) > MAX_MESSAGE_BYTES) return { content: [{ type: 'text', text: 'Tool result exceeds the message limit.' }], isError: true };
      return response;
    } catch {
      return { content: [{ type: 'text', text: 'Tool call failed.' }], isError: true };
    }
  }

  return {
    agentId,
    listTools() { return Object.values(tools); },
    callTool,
    close() { estado?.close(); },
  };
}

export async function crearPuente(options = {}) {
  const app = await runtime(options);
  let lifecycle = 'new';
  async function handle(message) {
    if (!isRecord(message)) return rpcError(null, ERROR_INVALID);
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string'
        || (Object.hasOwn(message, 'id') && !isId(message.id))) {
      return rpcError(null, ERROR_INVALID);
    }
    const hasId = Object.hasOwn(message, 'id');
    if (message.method === 'initialize') {
      if (!hasId || lifecycle !== 'new' || !isRecord(message.params) || typeof message.params.protocolVersion !== 'string') return hasId ? rpcError(message.id, ERROR_INVALID) : null;
      lifecycle = 'initializing';
      return { jsonrpc: '2.0', id: message.id, result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      } };
    }
    if (message.method === 'notifications/initialized') {
      if (!hasId && lifecycle === 'initializing') lifecycle = 'ready';
      return null;
    }
    if (!hasId) return null;
    if (lifecycle !== 'ready') return rpcError(message.id, ERROR_NOT_READY);
    if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id, result: {} };
    if (message.method === 'tools/list') return { jsonrpc: '2.0', id: message.id, result: { tools: app.listTools() } };
    if (message.method === 'tools/call') {
      if (!isRecord(message.params) || typeof message.params.name !== 'string'
          || (message.params.arguments !== undefined && !isRecord(message.params.arguments))) return rpcError(message.id, ERROR_PARAMS);
      const result = await app.callTool(message.params.name, message.params.arguments ?? {});
      return { jsonrpc: '2.0', id: message.id, result };
    }
    return rpcError(message.id, ERROR_METHOD);
  }
  return { ...app, handle };
}

export async function serveStdio({ input = process.stdin, output = process.stdout, root = ROOT, env = process.env } = {}) {
  const bridge = await crearPuente({ root, env });
  let partial = Buffer.alloc(0);
  let chain = Promise.resolve();
  let oversized = false;
  function send(message) {
    if (!message) return;
    let line;
    try { line = JSON.stringify(message); } catch { line = JSON.stringify(rpcError(null, ERROR_INTERNAL)); }
    if (Buffer.byteLength(line, 'utf8') > MAX_MESSAGE_BYTES) line = JSON.stringify(rpcError(message.id ?? null, ERROR_INTERNAL));
    output.write(line + '\n');
  }
  function queueLine(bytes) {
    if (oversized) return;
    if (bytes.length > MAX_MESSAGE_BYTES) {
      oversized = true;
      send(rpcError(null, ERROR_PARSE));
      return;
    }
    const line = bytes.toString('utf8').replace(/\r$/, '');
    chain = chain.then(async () => {
      let message;
      try { message = JSON.parse(line); }
      catch { send(rpcError(null, ERROR_PARSE)); return; }
      try { send(await bridge.handle(message)); }
      catch { if (isRecord(message) && isId(message.id)) send(rpcError(message.id, ERROR_INTERNAL)); }
    });
  }
  function onData(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;
    while (offset < bytes.length && !oversized) {
      const newline = bytes.indexOf(0x0a, offset);
      const end = newline < 0 ? bytes.length : newline;
      const part = bytes.subarray(offset, end);
      if (partial.length + part.length > MAX_MESSAGE_BYTES) {
        oversized = true;
        send(rpcError(null, ERROR_PARSE));
        input.pause();
        input.destroy?.();
        return;
      }
      if (newline < 0) {
        partial = partial.length ? Buffer.concat([partial, part]) : Buffer.from(part);
        return;
      }
      const line = partial.length ? Buffer.concat([partial, part]) : Buffer.from(part);
      partial = Buffer.alloc(0);
      queueLine(line);
      offset = newline + 1;
    }
  }
  try {
    await new Promise(resolve => {
      input.on('data', onData);
      input.once('end', resolve);
      input.once('close', resolve);
      input.once('error', resolve);
    });
    if (!oversized && partial.length) queueLine(partial);
    await chain;
  } finally { input.off('data', onData); bridge.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  serveStdio().catch(() => { process.exitCode = 1; });
}
