import { mkdirSync, fchmodSync, openSync, closeSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { supersededAt } from '../../third_party/agentmemory/memory-utils.mjs';

const maxTexto = 16000;
const maxMaterial = 100000;
const maxJson = 100000;
const error = mensaje => new Error(mensaje);

function texto(valor, nombre, max = maxTexto, opcional = false) {
  if (opcional && (valor === undefined || valor === null)) return null;
  if (typeof valor !== 'string' || !valor.trim() || valor.length > max) throw error(`${nombre} inválido.`);
  return valor;
}

function json(valor, nombre, max = maxJson) {
  let serializado;
  try { serializado = JSON.stringify(valor); } catch { throw error(`${nombre} inválido.`); }
  if (serializado === undefined || serializado.length > max) throw error(`${nombre} inválido.`);
  return serializado;
}

function parse(value) { return value == null ? null : JSON.parse(value); }
function canon(value) {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function transaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
function job(row) {
  if (!row) return null;
  return { id: row.id, objetivo: row.objetivo, flujo: row.flujo, material: parse(row.material), status: row.status,
    resultado: parse(row.resultado), error: row.error, intentos: row.intentos, creado: row.creado, actualizado: row.actualizado,
    leaseUntil: row.lease_until, ...(row.lease_token ? { leaseToken: row.lease_token } : {}) };
}
function sinSecretos(value) {
  if (Array.isArray(value)) return value.map(sinSecretos);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, /authorization|api[_-]?key|token|password|secret|credential/i.test(key) ? '[redactado]' : sinSecretos(item)]));
  if (typeof value !== 'string') return value;
  return value.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redactado]')
    .replace(/((?:authorization|api[_-]?key|token|password|secret|credential)\s*[:=]\s*["']?)([^\s,"'}]+)/gi, '$1[redactado]');
}

export function abrirEstado(directorio) {
  if (typeof directorio !== 'string' || !directorio.trim()) throw error('Directorio inválido.');
  const dir = path.resolve(directorio);
  if (dir === path.parse(dir).root) throw error('Indica una carpeta privada de datos.');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (path.relative(dir, realpathSync(dir)) !== '') throw error('No se admiten enlaces en la carpeta de datos.');
  const dbPath = path.join(dir, 'estado.sqlite');
  const previa = lstatSync(dbPath, { throwIfNoEntry: false });
  if (previa && !previa.isFile()) throw error('La base de estado debe ser un archivo regular.');
  const fd = openSync(dbPath, 'a', 0o600);
  try { if (process.platform !== 'win32') fchmodSync(fd, 0o600); } finally { closeSync(fd); }
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  try { transaccion(db, () => {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) throw error('La base de estado requiere una versión más reciente.');
    if (version === 0) db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, objetivo TEXT NOT NULL, flujo TEXT, material TEXT, status TEXT NOT NULL,
        resultado TEXT, error TEXT, idempotency_key TEXT UNIQUE, payload TEXT NOT NULL, intentos INTEGER NOT NULL DEFAULT 0,
        creado INTEGER NOT NULL, actualizado INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER);
      CREATE INDEX jobs_claim ON jobs(status, lease_until, creado);
      CREATE TABLE events (id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        agente TEXT NOT NULL, tipo TEXT NOT NULL, detalle TEXT NOT NULL, creado INTEGER NOT NULL);
      CREATE INDEX events_job ON events(job_id, id);
      CREATE TABLE memories (clave TEXT PRIMARY KEY, texto TEXT NOT NULL, fuente TEXT, tipo TEXT, actualizado INTEGER NOT NULL);
      CREATE VIRTUAL TABLE memories_fts USING fts5(clave UNINDEXED, texto, tokenize='unicode61 remove_diacritics 2');
      CREATE TABLE approvals (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL, argumentos TEXT NOT NULL, status TEXT NOT NULL, creado INTEGER NOT NULL, actualizado INTEGER NOT NULL);
      CREATE INDEX approvals_job ON approvals(job_id, creado);
      CREATE TABLE schedules (id TEXT PRIMARY KEY, objetivo TEXT NOT NULL, flujo TEXT, cada_segundos INTEGER NOT NULL, proxima INTEGER NOT NULL);
      PRAGMA user_version=1;
    `);
    if (version < 2) {
      db.exec(`CREATE TABLE memory_history (
        id INTEGER PRIMARY KEY, clave TEXT NOT NULL, texto TEXT NOT NULL, fuente TEXT, tipo TEXT,
        actualizado INTEGER NOT NULL, superseded_at TEXT NOT NULL
      ); CREATE INDEX memory_history_key ON memory_history(clave, superseded_at, id); PRAGMA user_version=2;`);
    }
  }); } catch (e) { db.close(); throw e; }

  const getJob = db.prepare('SELECT * FROM jobs WHERE id=?');
  const insertJob = db.prepare(`INSERT INTO jobs(id,objetivo,flujo,material,status,idempotency_key,payload,creado,actualizado)
    VALUES(?,?,?,?, 'queued', ?,?,?,?)`);
  const enqueue = ({ objetivo, flujo, material, idempotencyKey }) => {
    objetivo = texto(objetivo, 'Objetivo'); flujo = texto(flujo, 'Flujo', 200, true);
    const mat = material === undefined ? null : json(material, 'Material', maxMaterial);
    const key = texto(idempotencyKey, 'Clave de idempotencia', 500, true);
    const payload = canon({ objetivo, flujo, material: mat == null ? null : JSON.parse(mat) });
    if (key) {
      const existing = db.prepare('SELECT * FROM jobs WHERE idempotency_key=?').get(key);
      if (existing) {
        if (existing.payload !== payload) throw error('Conflicto de idempotencia: payload distinto.');
        return job(existing);
      }
    }
    const id = randomUUID(), now = Date.now();
    try { insertJob.run(id, objetivo, flujo, mat, key, payload, now, now); }
    catch (e) {
      if (!key) throw e;
      const existing = db.prepare('SELECT * FROM jobs WHERE idempotency_key=?').get(key);
      if (!existing || existing.payload !== payload) throw error('Conflicto de idempotencia: payload distinto.');
      return job(existing);
    }
    return job(getJob.get(id));
  };
  const estado = {
    close() { db.close(); },
    encolar(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Trabajo inválido.');
      return enqueue(input);
    },
    encargoExterno({ objetivo }) {
      return transaccion(db, () => {
        const entrada = enqueue({ objetivo });
        db.prepare("UPDATE jobs SET status='completed',resultado=? WHERE id=?")
          .run(JSON.stringify({ texto:'Interacción solicitada desde un harness externo.' }), entrada.id);
        return job(getJob.get(entrada.id));
      });
    },
    listarTrabajos() { return db.prepare('SELECT * FROM jobs ORDER BY creado DESC LIMIT 100').all().map(job); },
    trabajo(id) { return job(getJob.get(texto(id, 'Id', 100))); },
    tomarTrabajo(leaseMs = 300000) {
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 86400000) throw error('Lease inválido.');
      return transaccion(db, () => {
        const now = Date.now();
        db.prepare("UPDATE jobs SET status='failed',error='Lease expirado; límite de intentos alcanzado',lease_token=NULL,lease_until=NULL,actualizado=? WHERE status='running' AND lease_until<=? AND intentos>=3").run(now, now);
        const row = db.prepare("SELECT id FROM jobs WHERE status='queued' OR (status='running' AND lease_until<=? AND intentos<3) ORDER BY creado,id LIMIT 1").get(now);
        if (!row) return null;
        const token = randomUUID();
        db.prepare("UPDATE jobs SET status='running',lease_token=?,lease_until=?,intentos=intentos+1,actualizado=? WHERE id=?").run(token, now + leaseMs, now, row.id);
        return job(getJob.get(row.id));
      });
    },
    renovar(id, leaseToken, leaseMs = 300000) {
      texto(id, 'Id', 100); texto(leaseToken, 'Token de lease', 100);
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 86400000) throw error('Lease inválido.');
      const now = Date.now();
      return db.prepare("UPDATE jobs SET lease_until=?,actualizado=? WHERE id=? AND status='running' AND lease_token=? AND lease_until>?").run(now + leaseMs, now, id, leaseToken, now).changes > 0;
    },
    terminar(id, leaseToken, { resultado, error: mensaje } = {}) {
      texto(id, 'Id', 100); texto(leaseToken, 'Token de lease', 100);
      if (resultado !== undefined && mensaje !== undefined) throw error('Indica resultado o error, no ambos.');
      if (resultado === undefined && mensaje === undefined) throw error('Indica resultado o error.');
      const success = mensaje === undefined;
      const result = resultado === undefined ? null : json(resultado, 'Resultado', 4200000);
      const failure = mensaje === undefined ? null : texto(mensaje, 'Error', 4000);
      return transaccion(db, () => {
        const now = Date.now();
        const changed = db.prepare("UPDATE jobs SET status=?,resultado=?,error=?,lease_token=NULL,lease_until=NULL,actualizado=? WHERE id=? AND status='running' AND lease_token=? AND lease_until>?").run(success ? 'completed' : 'failed', result, failure, now, id, leaseToken, now).changes;
        return changed ? job(getJob.get(id)) : null;
      });
    },
    evento(jobId, agente, tipo, detalle = null) {
      texto(jobId, 'Job id', 100); texto(agente, 'Agente', 200); texto(tipo, 'Tipo', 200);
      const raw = json(detalle, 'Detalle', 4000);
      const clean = JSON.stringify(sinSecretos(JSON.parse(raw)));
      db.prepare('INSERT INTO events(job_id,agente,tipo,detalle,creado) VALUES(?,?,?,?,?)').run(jobId, agente, tipo, clean, Date.now());
      return estado.eventos(jobId).at(-1);
    },
    eventos(jobId) {
      texto(jobId, 'Job id', 100);
      return db.prepare('SELECT agente,tipo,detalle,creado FROM events WHERE job_id=? ORDER BY id').all(jobId).map(r => ({ ...r, detalle: parse(r.detalle) }));
    },
    recordar({ clave, texto: contenido, fuente, tipo } = {}) {
      clave = textoVal(clave, 'Clave', 200); contenido = textoVal(contenido, 'Texto', 8000);
      fuente = textoVal(fuente, 'Fuente', 500, true); tipo = textoVal(tipo, 'Tipo', 200, true);
      const now = Date.now();
      transaccion(db, () => {
        const previous = db.prepare('SELECT texto,fuente,tipo,actualizado FROM memories WHERE clave=?').get(clave);
        if (previous && previous.texto === contenido && previous.fuente === fuente && previous.tipo === tipo) return;
        if (previous) {
          const latest = db.prepare('SELECT superseded_at FROM memory_history WHERE clave=? ORDER BY superseded_at DESC,id DESC LIMIT 1').get(clave);
          const previousAt = latest?.superseded_at ?? new Date(previous.actualizado).toISOString();
          const at = supersededAt(previousAt, new Date(now).toISOString());
          db.prepare('INSERT INTO memory_history(clave,texto,fuente,tipo,actualizado,superseded_at) VALUES(?,?,?,?,?,?)')
            .run(clave, previous.texto, previous.fuente, previous.tipo, previous.actualizado, at);
        }
        db.prepare('INSERT INTO memories(clave,texto,fuente,tipo,actualizado) VALUES(?,?,?,?,?) ON CONFLICT(clave) DO UPDATE SET texto=excluded.texto,fuente=excluded.fuente,tipo=excluded.tipo,actualizado=excluded.actualizado').run(clave, contenido, fuente, tipo, now);
        db.prepare('DELETE FROM memories_fts WHERE clave=?').run(clave);
        db.prepare('INSERT INTO memories_fts(clave,texto) VALUES(?,?)').run(clave, contenido);
      });
      return db.prepare('SELECT clave,texto,fuente,tipo,actualizado FROM memories WHERE clave=?').get(clave);
    },
    olvidar(clave) {
      texto(clave, 'Clave', 200);
      return transaccion(db, () => {
        db.prepare('DELETE FROM memories_fts WHERE clave=?').run(clave);
        db.prepare('DELETE FROM memory_history WHERE clave=?').run(clave);
        return db.prepare('DELETE FROM memories WHERE clave=?').run(clave).changes > 0;
      });
    },
    historial(clave, limit = 20) {
      texto(clave, 'Clave', 200);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw error('Límite de historial inválido.');
      return db.prepare(`SELECT clave,texto,fuente,tipo,actualizado,superseded_at AS supersededAt FROM (
        SELECT * FROM memory_history WHERE clave=? ORDER BY superseded_at DESC,id DESC LIMIT ?
      ) ORDER BY superseded_at,id`).all(clave, limit).map(r => ({ ...r, actualizado: new Date(r.actualizado).toISOString() }));
    },
    buscar(query, limit = 5) {
      texto(query, 'Consulta', 1000);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw error('Límite inválido.');
      const palabras = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
      const tokens = [...new Set(palabras.filter(p => !/^(?:el|la|las|los|un|una|de|del|para|por|en|que|con|mi|mis|y|al)$/i.test(p)))].slice(0, 32);
      if (!tokens.length) return [];
      const match = tokens.map(token => `"${token}"`).join(' OR ');
      return db.prepare(`SELECT m.clave,m.texto,m.fuente,m.tipo,m.actualizado FROM memories_fts f JOIN memories m USING(clave)
        WHERE memories_fts MATCH ? ORDER BY bm25(memories_fts),m.clave LIMIT ?`).all(match, limit);
    },
    memorias() { return db.prepare('SELECT clave,texto,fuente,tipo,actualizado FROM memories ORDER BY actualizado DESC LIMIT 100').all(); },
    preferencias() { return db.prepare("SELECT clave,texto,fuente,tipo,actualizado FROM memories WHERE tipo='preferencia' ORDER BY actualizado DESC LIMIT 8").all(); },
    proponer({ jobId, tipo, argumentos } = {}) {
      texto(jobId, 'Job id', 100); tipo = textoVal(tipo, 'Tipo', 200); const args = json(argumentos, 'Argumentos');
      const id = createHash('sha256').update(`${jobId}\0${tipo}\0${canon(argumentos)}`).digest('hex');
      const now = Date.now();
      db.prepare("INSERT OR IGNORE INTO approvals(id,job_id,tipo,argumentos,status,creado,actualizado) VALUES(?,?,?,?,'pending',?,?)").run(id, jobId, tipo, args, now, now);
      return approval(db.prepare('SELECT * FROM approvals WHERE id=?').get(id));
    },
    aprobaciones(jobId) {
      if (jobId !== undefined) { texto(jobId, 'Job id', 100); return db.prepare('SELECT * FROM approvals WHERE job_id=? ORDER BY creado').all(jobId).map(approval); }
      return db.prepare('SELECT * FROM approvals ORDER BY creado DESC LIMIT 100').all().map(approval);
    },
    aprobar(id) { return cambiarAprobacion(id, 'approved', ['pending', 'approved']); },
    rechazar(id) { return cambiarAprobacion(id, 'rejected', ['pending', 'rejected']); },
    aplicada(id) { return cambiarAprobacion(id, 'applied', ['approved', 'applied']); },
    programar({ id, objetivo, flujo, cadaSegundos, proxima } = {}) {
      id = textoVal(id, 'Id de programación', 200); objetivo = textoVal(objetivo, 'Objetivo'); flujo = textoVal(flujo, 'Flujo', 200, true);
      if (!Number.isSafeInteger(cadaSegundos) || cadaSegundos < 1 || cadaSegundos > 31536000) throw error('Intervalo inválido.');
      if (proxima === undefined) proxima = Date.now();
      if (!Number.isSafeInteger(proxima) || proxima < 0) throw error('Próxima ejecución inválida.');
      db.prepare('INSERT INTO schedules(id,objetivo,flujo,cada_segundos,proxima) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET objetivo=excluded.objetivo,flujo=excluded.flujo,cada_segundos=excluded.cada_segundos,proxima=excluded.proxima').run(id, objetivo, flujo, cadaSegundos, proxima);
      return db.prepare('SELECT * FROM schedules WHERE id=?').get(id);
    },
    programaciones() { return db.prepare('SELECT * FROM schedules ORDER BY id').all(); },
    desprogramar(id) {
      texto(id, 'Id de programación', 200);
      return db.prepare('DELETE FROM schedules WHERE id=?').run(id).changes > 0;
    },
    activarProgramadas(now = Date.now()) {
      if (!Number.isSafeInteger(now) || now < 0) throw error('Fecha inválida.');
      return transaccion(db, () => {
        const due = db.prepare('SELECT * FROM schedules WHERE proxima<=? ORDER BY proxima,id').all(now);
        return due.map(s => {
          const key = `schedule:${s.id}:${s.proxima}`;
          const created = enqueue({ objetivo: s.objetivo, flujo: s.flujo, idempotencyKey: key });
          const next = s.proxima + (Math.floor((now - s.proxima) / (s.cada_segundos * 1000)) + 1) * s.cada_segundos * 1000;
          db.prepare('UPDATE schedules SET proxima=? WHERE id=? AND proxima=?').run(next, s.id, s.proxima);
          return created;
        });
      });
    },
  };
  function cambiarAprobacion(id, target, allowed) {
    texto(id, 'Id de aprobación', 100);
    return transaccion(db, () => {
      const row = db.prepare('SELECT * FROM approvals WHERE id=?').get(id);
      if (!row) return null;
      if (!allowed.includes(row.status)) return approval(row);
      db.prepare('UPDATE approvals SET status=?,actualizado=? WHERE id=?').run(target, Date.now(), id);
      return approval(db.prepare('SELECT * FROM approvals WHERE id=?').get(id));
    });
  }
  return estado;
}

function textoVal(value, name, max = maxTexto, optional = false) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw error(`${name} inválido.`);
  return value;
}
function approval(row) {
  return row && { id: row.id, jobId: row.job_id, tipo: row.tipo, argumentos: parse(row.argumentos), status: row.status, creado: row.creado, actualizado: row.actualizado };
}
