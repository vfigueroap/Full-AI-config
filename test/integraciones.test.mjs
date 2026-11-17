import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { crearIntegraciones } from '../src/integraciones.mjs';

async function server(t, handler) {
  const http = createServer(handler);
  await new Promise((resolve, reject) => http.once('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => http.close(resolve)));
  return `http://127.0.0.1:${http.address().port}`;
}

test('HTTP GET uses configured base, allowed prefix, Bearer and bounded response', async t => {
  const secret = 'token-no-mostrar';
  const base = await server(t, (req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/v1/items/42');
    assert.equal(req.headers.authorization, `Bearer ${secret}`);
    res.end('{"ok":true}');
  });
  const tools = crearIntegraciones({
    catalogo: { integraciones: { supabase: { protocol: 'http', enabled: true, base_url_env: 'API_URL', token_env: 'API_TOKEN', allowed_paths: ['/v1'] } } },
    env: { API_URL: base, API_TOKEN: secret },
  });
  assert.equal(await tools.consultar_integracion({ integracion: 'supabase', ruta: 'v1/items/42' }), '{"ok":true}');
  await assert.rejects(tools.consultar_integracion({ integracion: 'supabase', ruta: '../private' }), /Ruta inválida/);
  await assert.rejects(tools.consultar_integracion({ integracion: 'supabase', ruta: 'v2/items' }), /no está permitida/);
});

test('disabled, unconfigured, non-HTTPS remote and MCP integrations fail without leaking secrets', async () => {
  const secret = 'ultra-secreto';
  const off = crearIntegraciones({ catalogo: { integraciones: { off: { protocol: 'http', enabled: false } } } });
  await assert.rejects(off.consultar_integracion({ integracion: 'off', ruta: 'x' }), /deshabilitada/);
  const missing = crearIntegraciones({ catalogo: { integraciones: { supabase: { protocol: 'http', enabled: true, base_url_env: 'URL', token_env: 'TOKEN', allowed_paths: ['/'] } } }, env: { TOKEN: secret } });
  await assert.rejects(missing.consultar_integracion({ integracion: 'supabase', ruta: 'x' }), e => !e.message.includes(secret));
  const insecure = crearIntegraciones({ catalogo: { integraciones: { supabase: { protocol: 'http', enabled: true, base_url_env: 'URL', token_env: 'TOKEN', allowed_paths: ['/'] } } }, env: { URL: 'http://example.com', TOKEN: secret } });
  await assert.rejects(insecure.consultar_integracion({ integracion: 'supabase', ruta: 'x' }), e => /HTTPS/.test(e.message) && !e.message.includes(secret));
  const mcp = crearIntegraciones({ catalogo: { integraciones: { svc: { protocol: 'mcp', enabled: true } } } });
  await assert.rejects(mcp.consultar_integracion({ integracion: 'svc', ruta: 'x' }), /Configura el ejecutable/);
});

test('provider errors and redirects never expose response bodies', async t => {
  const base = await server(t, (_req, res) => { res.writeHead(401); res.end('provider-body-secret'); });
  const tools = crearIntegraciones({ catalogo: { integraciones: { supabase: { protocol: 'http', enabled: true, base_url_env: 'URL', allowed_paths: ['/v1'] } } }, env: { URL: base } });
  await assert.rejects(tools.consultar_integracion({ integracion: 'supabase', ruta: 'v1/data' }), e => /HTTP 401/.test(e.message) && !e.message.includes('provider-body-secret'));
});

test('Immich and Nextcloud use their documented header forms; route globs are rejected', async t => {
  const base = await server(t, (req, res) => {
    if (req.url === '/api/search') assert.equal(req.headers['x-api-key'], 'immich-key');
    else if (req.url === '/remote.php/dav/files/user') assert.equal(req.headers.authorization, `Basic ${Buffer.from('user:app-pass').toString('base64')}`);
    else assert.fail(`unexpected route ${req.url}`);
    res.end('ok');
  });
  const tools = crearIntegraciones({ catalogo: { integraciones: {
    immich: { protocol: 'http', enabled: true, base_url_env: 'BASE', token_env: 'IMMICH', allowed_paths: ['/api/search'] },
    nextcloud: { protocol: 'http', enabled: true, base_url_env: 'BASE', username_env: 'USER', token_env: 'PASS', allowed_paths: ['/remote.php/dav'] },
  } }, env: { BASE: base, IMMICH: 'immich-key', USER: 'user', PASS: 'app-pass' } });
  assert.equal(await tools.consultar_integracion({ integracion: 'immich', ruta: 'api/search' }), 'ok');
  assert.equal(await tools.consultar_integracion({ integracion: 'nextcloud', ruta: 'remote.php/dav/files/user' }), 'ok');
  const glob = crearIntegraciones({ catalogo: { integraciones: { supabase: { protocol: 'http', enabled: true, base_url_env: 'BASE', allowed_paths: ['/rest/v1/**'] } } }, env: { BASE: base } });
  await assert.rejects(glob.consultar_integracion({ integracion: 'supabase', ruta: 'rest/v1/items' }), /Prefijos de ruta inválidos/);
});

test('document conversion is bound to the explicit material directory and rejects traversal', async t => {
  const material = await mkdtemp(path.join(os.tmpdir(), 'ia-doc-'));
  t.after(() => rm(material, { recursive: true, force: true }));
  await mkdir(path.join(material, 'docs'));
  await writeFile(path.join(material, 'docs', 'memo.txt'), 'texto');
  const tools = crearIntegraciones({ catalogo: { integraciones: {} }, material, env: { AI_PYTHON: process.execPath } });
  await assert.rejects(tools.convertir_documento({ ruta: '../secret.txt' }), /Ruta inválida/);
  await writeFile(path.join(material, 'docs', 'password.txt'), 'secret');
  await assert.rejects(tools.convertir_documento({ ruta: 'docs/password.txt' }), /restringid/);
  await writeFile(path.join(material, 'docs', '.env'), 'secret');
  await assert.rejects(tools.convertir_documento({ ruta: 'docs/.env' }), /Ruta inválida/);
  await assert.rejects(tools.convertir_documento({ ruta: 'docs/memo.txt' }), /MarkItDown no pudo convertir|No se encontró Python o MarkItDown/);
  const noRoot = crearIntegraciones({ catalogo: { integraciones: {} } });
  await assert.rejects(noRoot.convertir_documento({ ruta: 'memo.txt' }), /carpeta material absoluta/);
});

test('unit economics invokes the vendored founder-skill script and returns JSON', async () => {
  const tools = crearIntegraciones({ catalogo: { integraciones: {} }, env: { AI_PYTHON: process.env.AI_PYTHON || (process.platform === 'win32' ? 'python' : 'python3') } });
  const out = JSON.parse(await tools.economia_unitaria({ datos: {
    business: 'Prueba', unit: 'unidad', price: 10, variable: [{ cost: 2 }], fixed_monthly: [{ cost: 100 }], startup: [],
    days_per_month: 20, plan_per_day: 2,
  } }));
  assert.equal(out.contribution, 8);
  assert.equal(out.breakeven_per_day, 0.625);
  assert.equal(out.months.length, 12);
  await assert.rejects(tools.economia_unitaria({ datos: { price: 'no-numérico' } }), /Datos económicos inválidos/);
});
