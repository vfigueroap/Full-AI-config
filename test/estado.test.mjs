import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { abrirEstado } from '../src/estado.mjs';
import { supersededAt } from '../third_party/agentmemory/memory-utils.mjs';

async function carpeta() {
  return mkdtemp(path.join(tmpdir(), 'estado-'));
}
function limpiar(t, dir, ...estados) {
  t.after(async () => {
    for (const estado of estados) estado.close();
    await rm(dir, { recursive: true, force: true });
  });
}

test('persiste trabajos, eventos y memorias al reiniciar', async t => {
  const dir = await carpeta(t);
  let estado = abrirEstado(dir);
  const job = estado.encolar({ objetivo: 'Preparar informe', flujo: 'redactar', material: { ruta: 'acta' } });
  estado.evento(job.id, 'analista', 'inicio', { token: 'abc123', nota: 'Bearer abc123', detalle: { apiKey: 'def456', texto: 'token=ghi789' } });
  estado.recordar({ clave: 'acta', texto: 'La reunión acordó café.' });
  estado.close();
  estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  assert.equal(estado.trabajo(job.id).objetivo, 'Preparar informe');
  assert.deepEqual(estado.eventos(job.id)[0].detalle, {
    token: '[redactado]', nota: 'Bearer [redactado]', detalle: { apiKey: '[redactado]', texto: 'token=[redactado]' },
  });
  assert.equal(estado.memorias()[0].texto, 'La reunión acordó café.');
});

test('migra esquema v1 sin perder memoria existente', async t => {
  const dir = await carpeta(t), db = new DatabaseSync(path.join(dir, 'estado.sqlite'));
  db.exec(`
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
    INSERT INTO memories VALUES ('previa','Dato conservado','usuario','preferencia',1700000000000);
    INSERT INTO memories_fts VALUES ('previa','Dato conservado');
    PRAGMA user_version=1;
  `);
  db.close();
  const estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  assert.equal(estado.memorias().find(m => m.clave === 'previa').texto, 'Dato conservado');
  estado.recordar({ clave: 'previa', texto: 'Dato actualizado', fuente: 'usuario', tipo: 'preferencia' });
  assert.equal(estado.historial('previa')[0].texto, 'Dato conservado');
});

test('archiva cambios reales, mantiene orden con escrituras en el mismo milisegundo y elimina historial', async t => {
  const dir = await carpeta(t), estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  estado.recordar({ clave: 'dato', texto: 'v1', fuente: 'archivo', tipo: 'nota' });
  estado.recordar({ clave: 'dato', texto: 'v1', fuente: 'archivo', tipo: 'nota' });
  estado.recordar({ clave: 'dato', texto: 'v2', fuente: 'archivo', tipo: 'nota' });
  estado.recordar({ clave: 'dato', texto: 'v3', fuente: 'usuario', tipo: 'nota' });
  estado.recordar({ clave: 'dato', texto: 'v3', fuente: 'usuario', tipo: 'preferencia' });
  const history = estado.historial('dato');
  assert.deepEqual(history.map(x => x.texto), ['v1', 'v2', 'v3']);
  assert.equal(history[0].fuente, 'archivo');
  assert.equal(history[1].fuente, 'archivo');
  assert.ok(Date.parse(history[1].supersededAt) > Date.parse(history[0].supersededAt));
  assert.ok(history.every(x => Number.isFinite(Date.parse(x.actualizado))));
  assert.equal(history[2].tipo, 'nota');
  assert.deepEqual(estado.historial('dato', 1), [history.at(-1)]);
  assert.throws(() => estado.historial('dato', 101), /historial/i);
  assert.equal(estado.olvidar('dato'), true);
  assert.deepEqual(estado.historial('dato'), []);
});

test('supersededAt avanza un milisegundo ante marcas iguales o anteriores', () => {
  const iso = '2026-11-17T10:00:00.000Z';
  assert.equal(supersededAt(iso, iso), '2026-11-17T10:00:00.001Z');
  assert.equal(supersededAt('2026-11-17T10:00:00.002Z', iso), '2026-11-17T10:00:00.003Z');
});

test('encolado es idempotente y rechaza la misma clave con otro payload', async t => {
  const dir = await carpeta(), estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  const a = estado.encolar({ objetivo: 'A', idempotencyKey: 'same' });
  assert.equal(estado.encolar({ objetivo: 'A', idempotencyKey: 'same' }).id, a.id);
  assert.throws(() => estado.encolar({ objetivo: 'B', idempotencyKey: 'same' }), /Conflicto de idempotencia/);
});

test('claims compiten entre conexiones y el lease token anterior no puede terminar el trabajo', async t => {
  const dir = await carpeta(t);
  const a = abrirEstado(dir), b = abrirEstado(dir);
  limpiar(t, dir, a, b);
  a.encolar({ objetivo: 'Trabajo' });
  const first = a.tomarTrabajo(15);
  assert.ok(first.leaseToken);
  assert.equal(b.tomarTrabajo(), null);
  await new Promise(resolve => setTimeout(resolve, 25));
  const second = b.tomarTrabajo(1000);
  assert.notEqual(second.leaseToken, first.leaseToken);
  assert.equal(a.renovar(first.id, first.leaseToken), false);
  assert.equal(a.terminar(first.id, first.leaseToken, { resultado: 'stale' }), null);
  assert.equal(b.terminar(second.id, second.leaseToken, { resultado: 'listo' }).status, 'completed');
});

test('limita reintentos de leases expirados a tres claims', async t => {
  const dir = await carpeta(t), estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  estado.encolar({ objetivo: 'Agota' });
  for (let n = 0; n < 3; n++) {
    const claim = estado.tomarTrabajo(5);
    assert.equal(claim.intentos, n + 1);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(estado.tomarTrabajo(), null);
  assert.equal(estado.listarTrabajos()[0].status, 'failed');
});

test('FTS encuentra acentos sin interpretar operadores de consulta', async t => {
  const dir = await carpeta(), estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  estado.recordar({ clave: 'reunion', texto: 'La reunión aprobó el análisis financiero.' });
  assert.equal(estado.buscar('reunion')[0].clave, 'reunion');
  assert.deepEqual(estado.buscar('" OR * NEAR('), []);
});

test('aprobaciones deduplican propuestas y respetan sus transiciones', async t => {
  const dir = await carpeta(t), estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  const task = estado.encolar({ objetivo: 'Publicar' });
  const proposed = estado.proponer({ jobId: task.id, tipo: 'publicar', argumentos: { destino: 'sitio' } });
  assert.equal(estado.proponer({ jobId: task.id, tipo: 'publicar', argumentos: { destino: 'sitio' } }).id, proposed.id);
  assert.equal(estado.aprobar(proposed.id).status, 'approved');
  assert.equal(estado.aplicada(proposed.id).status, 'applied');
  assert.equal(estado.rechazar(proposed.id).status, 'applied');
  const second = estado.proponer({ jobId: task.id, tipo: 'borrar', argumentos: {} });
  assert.equal(estado.rechazar(second.id).status, 'rejected');
  assert.equal(estado.aprobar(second.id).status, 'rejected');
});

test('activa cada schedule vencido una vez, incluso desde dos conexiones', async t => {
  const dir = await carpeta(t), a = abrirEstado(dir), b = abrirEstado(dir);
  limpiar(t, dir, a, b);
  const start = Date.now() - 10_000;
  a.programar({ id: 'diario', objetivo: 'Revisar', cadaSegundos: 60, proxima: start });
  const first = a.activarProgramadas(Date.now());
  assert.equal(first.length, 1);
  assert.equal(b.activarProgramadas(Date.now()).length, 0);
  assert.equal(a.listarTrabajos().length, 1);
  assert.ok(a.programaciones()[0].proxima > Date.now());
});

test('desprogramar cancela schedules y evita activaciones posteriores', async t => {
  const dir = await carpeta(t), estado = abrirEstado(dir);
  limpiar(t, dir, estado);
  estado.programar({ id: 'cancelable', objetivo: 'No ejecutar', cadaSegundos: 60, proxima: 1 });
  assert.equal(estado.desprogramar('cancelable'), true);
  assert.equal(estado.desprogramar('cancelable'), false);
  assert.deepEqual(estado.activarProgramadas(Date.now()), []);
  assert.deepEqual(estado.programaciones(), []);
});
