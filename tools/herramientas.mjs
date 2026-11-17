import { lstat, realpath, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_TEXT = 24 * 1024;
const MAX_JSON = 256 * 1024;
const MAX_ENTRIES = 200;
const FORBIDDEN_EXT = /\.(?:pem|key|p12|pfx|env|secret|sqlite|db|exe|dll|bat|cmd|ps1|sh)$/i;

function error(message) { throw new Error(message); }

function safeRoute(route = '') {
  if (typeof route !== 'string' || route.includes('\0') || route.includes(':') || route.includes('\\')) error('Ruta inválida; use segmentos relativos con /');
  if (route.startsWith('/') || path.posix.isAbsolute(route)) error('La ruta debe ser relativa a la carpeta de material');
  const parts = route ? route.split('/') : [];
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) error('Ruta inválida o restringida');
  if (parts.length > 8) error('Ruta demasiado profunda');
  return parts;
}

function allowedName(name) {
  return !name.startsWith('.') && !FORBIDDEN_EXT.test(name) && !/(?:^|[^a-z0-9])(?:credentials?|token|password|secret|id_rsa|id_ed25519|authorized_keys|known_hosts)(?:$|[^a-z0-9])/i.test(name);
}

function args(value, keys, tool) {
  if (value === undefined) value = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) error(`Argumentos inválidos para ${tool}`);
  return value;
}

function canonical(p) { return path.resolve(p.replace(/^\\\\\?\\/, '')); }
function samePath(a, b) { return path.relative(a, b) === ''; }
function within(base, target) {
  const rel = path.relative(base, target);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}

export function resolverMaterial(directorio) {
  if (typeof directorio !== "string" || !path.isAbsolute(directorio)) error("Se requiere una carpeta material absoluta.");
  let rootPromise;
  async function root() {
    if (!rootPromise) rootPromise = (async () => {
      const st = await lstat(directorio);
      if (!st.isDirectory() || st.isSymbolicLink()) error('La carpeta de material debe ser un directorio real');
      const resolved = await realpath(directorio);
      if (!samePath(canonical(directorio), canonical(resolved))) error('No se admiten enlaces en la carpeta de material');
      return resolved;
    })();
    return rootPromise;
  }
  async function resolveInside(route, wantDirectory) {
    const base = await root();
    const parts = safeRoute(route);
    let current = base;
    for (const part of parts) {
      if (!allowedName(part)) error('Ruta inválida o restringida');
      current = path.join(current, part);
      let st;
      try { st = await lstat(current); } catch { error('No se encontró la ruta solicitada'); }
      if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile())) error('No se admiten enlaces ni archivos especiales');
    }
    const resolved = await realpath(current);
    const canon = canonical(resolved);
    if (!within(base, canon)) error('La ruta sale de la carpeta de material');
    const st = await lstat(resolved);
    if (wantDirectory ? !st.isDirectory() : !st.isFile()) error(wantDirectory ? 'La ruta no es una carpeta' : 'La ruta no es un archivo');
    if (!wantDirectory && !allowedName(path.basename(canon))) error('Archivo restringido');
    return resolved;
  }
  return resolveInside;
}

export function crearHerramientas(directorio) {
  if (directorio !== undefined && (typeof directorio !== 'string' || !path.isAbsolute(directorio))) error('directorio debe ser una ruta absoluta explícita');
  const sumar_importes = async (input) => {
    const { importes } = args(input, ['importes'], 'sumar_importes');
    if (!Array.isArray(importes) || importes.length < 1 || importes.length > 200 || importes.some(v => typeof v !== 'string' || v.length > 40 || !/^-?\d+(?:\.\d{1,2})?$/.test(v))) error('importes debe contener de 1 a 200 cadenas numéricas con hasta 2 decimales');
    let total = 0n;
    let scale = 0;
    for (const importe of importes) {
      const [entero, decimal = ''] = importe.split('.');
      scale = Math.max(scale, decimal.length);
      total += BigInt(entero) * 100n + BigInt((decimal + '00').slice(0, 2)) * (entero.startsWith('-') ? -1n : 1n);
    }
    const divisor = scale === 0 ? 100n : scale === 1 ? 10n : 1n;
    const value = total / divisor;
    if (scale === 0) return value.toString();
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  };
  sumar_importes.uso = '{"importes":["12000","-2500","0.25"]}';
  const validar_json = async (input) => {
    const { texto } = args(input, ['texto'], 'validar_json');
    if (typeof texto !== 'string') error('validar_json requiere texto string');
    if (Buffer.byteLength(texto, 'utf8') > MAX_JSON) error('El JSON supera el límite de 256 KiB');
    try { JSON.parse(texto); return 'JSON válido'; } catch { return 'JSON inválido'; }
  };
  validar_json.uso = '{"texto":"{\\"ok\\":true}"}';
  if (directorio === undefined) return Object.freeze({ validar_json, sumar_importes });
  const resolveInside = resolverMaterial(directorio);
  const tools = {
    async listar_archivos(input) {
      const { ruta = '' } = args(input, ['ruta'], 'listar_archivos');
      const dir = await resolveInside(ruta, true);
      const names = await readdir(dir, { withFileTypes: true });
      return names.filter(e => allowedName(e.name) && !e.isSymbolicLink() && (e.isDirectory() || e.isFile())).slice(0, MAX_ENTRIES).map(e => e.isDirectory() ? `${e.name}/` : e.name).join('\n');
    },
    async leer_texto(input) {
      const { ruta } = args(input, ['ruta'], 'leer_texto');
      if (!ruta || typeof ruta !== 'string') error('leer_texto requiere ruta');
      const file = await resolveInside(ruta, false);
      const st = await lstat(file);
      if (st.size > MAX_TEXT) error('El archivo supera el límite de lectura (24 KiB)');
      const data = await readFile(file);
      if (data.includes(0)) error('El archivo no parece texto UTF-8');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      return text;
    },
    validar_json,
    sumar_importes
  };
  tools.listar_archivos.uso = '{"ruta":"docs"}';
  tools.leer_texto.uso = '{"ruta":"docs/nota.txt"}';
  tools.validar_json.uso = '{"texto":"{\\"ok\\":true}"}';
  tools.sumar_importes.uso = sumar_importes.uso;
  return Object.freeze(tools);
}
