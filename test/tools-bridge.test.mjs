import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPuente } from '../tools/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'tools', 'server.mjs');
const RUNNER = path.join(ROOT, 'tools', 'run.mjs');
const LIMIT = 256 * 1024;

async function launch(entry, env = {}) {
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', chunk => stdout.push(chunk));
  child.stderr.on('data', chunk => stderr.push(chunk));
  return {
    child,
    send(value) { child.stdin.write(typeof value === 'string' ? value : `${JSON.stringify(value)}\n`); },
    async finish(input) {
      if (input) child.stdin.write(input);
      child.stdin.end();
      const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('child timeout')); }, 5000);
        child.once('error', reject);
        child.once('close', (status, signal) => { clearTimeout(timer); resolve(status ?? signal); });
      });
      return { code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') };
    },
  };
}

function request(id, method, params = {}) { return { jsonrpc: '2.0', id, method, params }; }
function initialized() { return { jsonrpc: '2.0', method: 'notifications/initialized' }; }
function lines(output) { return output.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

test('stdio MCP performs handshake and exposes only the selected secondary agent tools', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ai-mcp-'));
  try {
    const client = await launch(SERVER, { AI_DATA_DIR: path.join(temp, 'state'), AI_AGENT_ID: 'investigador' });
    client.send(request(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
    client.send(initialized());
    client.send(request(2, 'tools/list'));
    const result = await client.finish();
    assert.equal(result.code, 0);
    const [hello, listing] = lines(result.stdout);
    assert.equal(hello.result.protocolVersion, '2025-11-25');
    assert.equal(hello.result.serverInfo.version, '0.3.0');
    assert.deepEqual(listing.result.tools.map(t => t.name), ['buscar_memoria']);
    assert.equal(await import('node:fs/promises').then(fs => fs.stat(path.join(temp, 'state')).then(() => true, () => false)), false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('a call before initialized is rejected; invalid JSON receives JSON-RPC parse error', async () => {
  const client = await launch(SERVER, { AI_AGENT_ID: 'investigador' });
  client.send(request(1, 'tools/list'));
  client.send('{not json}\n');
  const result = await client.finish();
  const output = lines(result.stdout);
  assert.equal(output[0].error.code, -32002);
  assert.equal(output[1].error.code, -32700);
});

test('oversized line is rejected and the process exits without buffering an unbounded message', async () => {
  const child = spawn(process.execPath, [SERVER], { cwd: ROOT, env: { ...process.env, AI_AGENT_ID: 'investigador' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', value => stdout += value);
  child.stdin.write('x'.repeat(LIMIT + 1));
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('oversized stream left process hanging with stdin open')); }, 3000);
    child.once('error', reject);
    child.once('close', value => { clearTimeout(timer); resolve(value); });
  });
  assert.equal(code, 0);
  assert.equal(lines(stdout)[0].error.code, -32700);
});

test('invalid JSON-RPC values respond with invalid request and valid notifications stay silent', async () => {
  const bridge = await crearPuente({ env: { ...process.env, AI_AGENT_ID: 'investigador', AI_DATA_DIR: path.join(os.tmpdir(), `ai-invalid-${process.pid}`) } });
  try {
    for (const invalid of [[], 42, {}, { jsonrpc: '2.0', method: 4 }, { jsonrpc: '2.0', method: 'ping', id: {} }]) {
      const response = await bridge.handle(invalid);
      assert.deepEqual(response, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
    }
    assert.equal(await bridge.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  } finally { bridge.close(); }
});

test('tools/list reflects configured material and hides disabled integrations', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ai-mcp-list-'));
  const material = path.join(temp, 'material');
  await mkdir(material);
  try {
    const bridge = await crearPuente({ env: { ...process.env, AI_AGENT_ID: 'auditor-seguridad', AI_MATERIAL_DIR: material, AI_DATA_DIR: path.join(temp, 'state') } });
    try {
      const names = bridge.listTools().map(tool => tool.name);
      assert(names.includes('leer_texto'));
      assert(names.includes('listar_archivos'));
      assert.equal(names.includes('consultar_integracion'), false);
      assert.equal(names.includes('proponer_archivo'), true);
    } finally { bridge.close(); }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('invalid primary agent cannot start the bridge', async () => {
  const client = await launch(SERVER, { AI_AGENT_ID: 'coordinador' });
  const result = await client.finish();
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, '');
});

test('tool permissions and schema remain enforced by the selected agent capabilities', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ai-mcp-'));
  const material = path.join(temp, 'material');
  await mkdir(material);
  await writeFile(path.join(material, 'nota.txt'), 'texto permitido');
  try {
    const client = await launch(SERVER, { AI_AGENT_ID: 'investigador', AI_DATA_DIR: path.join(temp, 'state'), AI_MATERIAL_DIR: material });
    client.send(request(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
    client.send(initialized());
    client.send(request(2, 'tools/call', { name: 'leer_texto', arguments: { ruta: 'nota.txt' } }));
    client.send(request(3, 'tools/call', { name: 'proponer_archivo', arguments: { ruta: 'x.md', contenido: 'no' } }));
    client.send(request(4, 'tools/call', { name: 'listar_archivos', arguments: { ruta: '../' } }));
    const result = await client.finish();
    const [read, denied, invalidPath] = lines(result.stdout).slice(1);
    assert.equal(read.result.content[0].text, 'texto permitido');
    assert.equal(denied.result.isError, true);
    assert.match(denied.result.content[0].text, /not available/i);
    assert.equal(invalidPath.result.isError, true);
    assert.equal(invalidPath.result.content[0].text, 'Tool call failed.');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('one-shot runner reads JSON stdin, returns one result, and does not load .env', async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER, '--agent', 'analista-financiero', '--tool', 'sumar_importes'], {
      cwd: ROOT,
      env: { ...process.env, AI_DATA_DIR: path.join(os.tmpdir(), `ai-cli-${process.pid}`), AI_AGENT_ID: 'investigador' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', x => stdout += x);
    child.stderr.setEncoding('utf8').on('data', x => stderr += x);
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end('{"importes":["2.50","3"]}');
  });
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).content[0].text, '5.50');
  assert.equal(result.stderr, '');
});

test('CLI rejects oversized input file', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ai-mcp-'));
  const input = path.join(temp, 'large.json');
  try {
    await writeFile(input, `{"x":"${'x'.repeat(LIMIT)}"}`);
    const child = spawn(process.execPath, [RUNNER, '--tool', 'validar_json', '--input', input], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.setEncoding('utf8').on('data', x => out += x);
    child.stderr.setEncoding('utf8').on('data', x => err += x);
    const code = await new Promise(resolve => child.once('close', resolve));
    assert.notEqual(code, 0);
    assert.equal(out, '');
    assert.equal(err, 'Tool run failed.\n');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
