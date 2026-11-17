import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ejecutar = promisify(execFile);
const cli = path.resolve(import.meta.dirname, '..', 'ia.mjs');

async function servidor(t, responder) {
  const solicitudes = [];
  const http = createServer(async (req, res) => {
    const trozos = [];
    for await (const trozo of req) trozos.push(trozo);
    const cuerpo = JSON.parse(Buffer.concat(trozos).toString('utf8'));
    solicitudes.push({ url: req.url, cuerpo });
    responder(cuerpo, res);
  });
  await new Promise((resolve, reject) => http.once('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => http.close(resolve)));
  const env = {
    ...process.env, LLM_BASE_URL: 'http://127.0.0.1:' + http.address().port + '/v1',
    LLM_API_KEY: '', LLM_MODEL: 'especialista-prueba', LLM_COORDINATOR_MODEL: 'coordinador-prueba',
  };
  return { env, solicitudes };
}

test('la CLI enruta, lee el material y entrega el resultado al redactor usando el transporte HTTP', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ia-material-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dato = 'La entrega se aprobó el jueves.';
  await writeFile(path.join(dir, 'acta.txt'), dato);
  const { env, solicitudes } = await servidor(t, (body, res) => {
    const ultimo = body.messages.at(-1).content;
    let salida;
    if (body.model === 'coordinador-prueba') salida = { flujo: 'sintesis' };
    else {
      const mensaje = JSON.parse(ultimo);
      if (mensaje.herramienta === 'leer_texto') salida = { tipo: 'resultado', texto: mensaje.resultado };
      else if (mensaje.dependencias?.investigador) salida = { tipo: 'resultado', texto: mensaje.dependencias.investigador + ' (acta.txt)' };
      else salida = { tipo: 'herramienta', nombre: 'leer_texto', argumentos: { ruta: 'acta.txt' } };
    }
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(salida) } }] }));
  });
  const { stdout } = await ejecutar(process.execPath, [cli, 'ejecutar', 'Resume acta.txt', '--json', '--material', dir], { env, cwd: dir });
  const r = JSON.parse(stdout);
  assert.equal(r.flujo, 'sintesis');
  assert.equal(r.resultados.investigador, dato);
  assert.equal(r.texto, dato + ' (acta.txt)');
  assert.equal(solicitudes.length, 4);
  assert.ok(solicitudes.every(s => s.url === '/v1/chat/completions'));
  assert.equal(solicitudes[0].cuerpo.model, 'coordinador-prueba');
  assert.ok(solicitudes.slice(1).every(s => s.cuerpo.model === 'especialista-prueba'));
});

test('la CLI conserva el diagnóstico HTTP sin exponer el cuerpo del proveedor', async t => {
  const { env, solicitudes } = await servidor(t, (body, res) => { res.writeHead(401); res.end('dato-secreto'); });
  await assert.rejects(ejecutar(process.execPath, [cli, 'ejecutar', 'Un plan', '--flujo', 'planificacion'], { env }), e => {
    assert.match(e.stderr, /planificador/);
    assert.match(e.stderr, /HTTP 401/);
    assert.doesNotMatch(e.stderr, /dato-secreto/);
    return true;
  });
  assert.equal(solicitudes.length, 1);
});
