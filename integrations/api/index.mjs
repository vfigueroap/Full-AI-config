import { resolverMaterial } from '../../tools/herramientas.mjs';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { leerRecursoMcp } from '../mcp/client.mjs';

const execFile = promisify(execFileCallback);
const MAX_OUTPUT = 128 * 1024;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ECONOMY_SCRIPT = path.join(ROOT, 'third_party/founder-skill/unit_economics.py');
const idPattern = /^[a-z][a-z0-9_-]*$/;
const documentExtensions = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.html', '.htm', '.txt', '.md', '.csv', '.json', '.xml', '.jpg', '.jpeg', '.png']);

function fail(message) { throw new Error(message); }
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} debe ser un objeto`);
  return value;
}
function args(value, keys, name) {
  object(value ?? {}, `Argumentos de ${name}`);
  if (Object.keys(value ?? {}).some(k => !keys.includes(k))) fail(`Argumentos inválidos para ${name}`);
  return value ?? {};
}
function safeRoute(route) {
  if (typeof route !== 'string' || !route || route.length > 1024 || route.includes('\0') || /[\\:%?#]/.test(route) || route.startsWith('/') || route.split('/').some(x => !x || x === '.' || x === '..')) fail('Ruta inválida');
  return route;
}
function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const version = net.isIP(host);
  return version === 4 ? host.startsWith('127.') : version === 6 && (host === '::1' || host.startsWith('::ffff:127.'));
}
function minimalEnv() {
  const e = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME']) if (process.env[k]) e[k] = process.env[k];
  return e;
}
function python(env) {
  const p = env.AI_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  if (typeof p !== 'string' || !p || p.includes('\0')) fail('AI_PYTHON no identifica un intérprete válido');
  return p;
}
export function crearIntegraciones({ catalogo, material, env = process.env } = {}) {
  const integraciones = object(catalogo?.integraciones, 'catalogo.integraciones');

  async function consultar_integracion(input) {
    const { integracion, ruta } = args(input, ['integracion', 'ruta'], 'consultar_integracion');
    if (typeof integracion !== 'string' || !idPattern.test(integracion)) fail('Identificador de integración inválido');
    const cfg = integraciones[integracion];
    if (!cfg || cfg.enabled !== true) fail(`Integración «${integracion}» deshabilitada o no configurada`);
    if (cfg.protocol === 'mcp') return leerRecursoMcp(cfg, ruta, env);
    if (cfg.protocol !== 'http') fail(`Protocolo no compatible en integración «${integracion}»`);
    if (typeof cfg.base_url_env !== 'string' || !cfg.base_url_env || !env[cfg.base_url_env]) fail(`Falta configurar base_url_env para «${integracion}»`);
    let base;
    try { base = new URL(env[cfg.base_url_env]); } catch { fail(`URL base inválida en integración «${integracion}»`); }
    if (base.username || base.password || base.search || base.hash) fail('La URL base no puede incluir credenciales, query ni fragmento');
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && isLoopback(base.hostname))) fail('La integración remota requiere HTTPS');
    if (!Array.isArray(cfg.allowed_paths) || !cfg.allowed_paths.length || cfg.allowed_paths.some(p => typeof p !== 'string' || !p.startsWith('/') || p.includes('..') || p.includes('%') || /[*?{}]/.test(p))) fail('Prefijos de ruta inválidos en la integración');
    const requested = safeRoute(ruta);
    const encoded = requested.split('/').map(encodeURIComponent).join('/');
    const allowed = cfg.allowed_paths.some(prefix => {
      const clean = prefix.replace(/\/+$/, '');
      return `/${encoded}` === clean || `/${encoded}`.startsWith(`${clean}/`);
    });
    if (!allowed) fail('La ruta no está permitida para esta integración');
    const url = new URL(base.href);
    url.pathname = `${base.pathname.replace(/\/$/, '')}/${encoded}`;
    if (url.origin !== base.origin || url.username || url.password) fail('Destino de integración inválido');
    const token = cfg.token_env ? env[cfg.token_env] : undefined;
    if ((token || (integracion === 'nextcloud' && env[cfg.username_env])) && url.protocol !== 'https:' && !isLoopback(url.hostname)) fail('Las credenciales solo se pueden enviar por HTTPS');
    const headers = { accept: 'application/json, text/plain;q=0.9, */*;q=0.1' };
    if (integracion === 'supabase') {
      if (token) { headers.authorization = `Bearer ${token}`; headers.apikey = token; }
    } else if (integracion === 'immich') {
      if (token) headers['x-api-key'] = token;
    } else if (integracion === 'nextcloud') {
      const username = cfg.username_env && env[cfg.username_env];
      if (token && username) headers.authorization = `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;
      else if (token || username) fail('Nextcloud requiere usuario y contraseña de aplicación');
    } else {
      fail(`Autenticación no implementada para integración «${integracion}»`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let response;
    try { response = await fetch(url, { method: 'GET', headers, redirect: 'error', signal: controller.signal }); }
    catch { clearTimeout(timer); fail('No se pudo consultar la integración (redirección, red o timeout)'); }
    if (!response.ok) { await response.body?.cancel(); clearTimeout(timer); fail(`La integración respondió HTTP ${response.status}`); }
    const reader = response.body?.getReader();
    if (!reader) { clearTimeout(timer); return ''; }
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_OUTPUT) { await reader.cancel(); fail('La respuesta de integración supera 128 KiB'); }
        chunks.push(value);
      }
    } catch { fail('No se pudo leer la respuesta de integración (timeout o error de red)'); }
    finally { reader.releaseLock(); clearTimeout(timer); }
    return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
  }

  async function convertir_documento(input) {
    const { ruta } = args(input, ['ruta'], 'convertir_documento');
    if (typeof ruta !== 'string') fail('convertir_documento requiere ruta');
    const file = await resolverMaterial(material)(ruta, false);
    const ext = path.extname(file).toLowerCase();
    if (!documentExtensions.has(ext)) fail('Tipo de documento restringido');
    if ((await lstat(file)).size > 25 * 1024 * 1024) fail('El documento supera 25 MiB');
    if (['.png','.jpeg','.jpg'].includes(ext)) {
      try {
        const {stdout} = await execFile(env.AI_TESSERACT || 'tesseract', [file, 'stdout', '-l', 'spa'], {env:minimalEnv(),timeout:30000,maxBuffer:MAX_OUTPUT,windowsHide:true});
        return stdout;
      } catch { fail('No se pudo reconocer la imagen con Tesseract y el paquete de idioma español.'); }
    }
    try {
      const { stdout } = await execFile(python(env), ['-m', 'markitdown', file], { env: minimalEnv(), timeout: 30_000, maxBuffer: MAX_OUTPUT, windowsHide: true });
      return stdout;
    } catch (e) {
      if (e.code === 'ENOENT') fail('No se encontró Python o MarkItDown; no se instaló nada automáticamente');
      if (e.code === 'ETIMEDOUT' || e.killed) fail('La conversión superó el límite de 30 segundos');
      if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') fail('El documento convertido supera 128 KiB');
      fail('MarkItDown no pudo convertir el documento');
    }
  }

  async function economia_unitaria(input) {
    const { datos } = args(input, ['datos'], 'economia_unitaria');
    object(datos, 'datos');
    const json = JSON.stringify(datos);
    if (Buffer.byteLength(json, 'utf8') > 64 * 1024) fail('datos supera 64 KiB');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ia-economia-'));
    try {
      const inputPath = path.join(dir, 'datos.json');
      await writeFile(inputPath, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      try {
        const { stdout } = await execFile(python(env), [ECONOMY_SCRIPT, inputPath, '--json'], { env: minimalEnv(), timeout: 10_000, maxBuffer: MAX_OUTPUT, windowsHide: true });
        return stdout.trim();
      } catch (e) {
        if (e.code === 'ENOENT') fail('No se encontró Python para calcular economía unitaria');
        if (e.code === 'ETIMEDOUT' || e.killed) fail('El cálculo económico superó 10 segundos');
        fail('Datos económicos inválidos o cálculo fallido');
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  consultar_integracion.uso = '{"integracion":"mi_api","ruta":"v1/items"}';
  convertir_documento.uso = '{"ruta":"informe.pdf"}';
  economia_unitaria.uso = '{"datos":{"business":"Ejemplo","unit":"unidad","price":10,"variable":[],"fixed_monthly":[],"startup":[],"plan_per_day":1}}';
  return Object.freeze({ consultar_integracion, convertir_documento, economia_unitaria });
}
