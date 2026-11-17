import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { abrirEstado } from '../src/estado.mjs';
import { cargarCatalogo } from '../src/catalogo.mjs';
import { crearServidor, procesarSiguiente, contextoRecuperado } from '../src/servicio.mjs';
import { aplicarAprobacion, ingerir } from '../src/capacidades.mjs';

test('HTTP → cola → especialista → propuesta → aprobación humana → archivo persistente', async t => {
  const directorio = await mkdtemp(path.join(tmpdir(), 'ai-servicio-'));
  const catalogo = await cargarCatalogo(path.resolve(import.meta.dirname, '..'));
  const estado = abrirEstado(directorio);
  const token = 'token-de-prueba-local-de-mas-de-32-bytes';
  const servidor = crearServidor({ estado, catalogo, directorio, token });
  await new Promise((resolve, reject) => servidor.once('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => servidor.close(resolve)); estado.close();
    await rm(directorio, { recursive: true, force: true });
  });
  const api = (ruta, body, autorizado = true) => fetch('http://127.0.0.1:' + servidor.address().port + ruta, {
    method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: autorizado ? 'Bearer ' + token : '' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await api('/health', null, false)).status, 401);
  assert.equal((await api('/jobs', { objetivo:'x', material:'../secreto' })).status, 400);
  const body = { objetivo: 'Escribe un resumen de la reunión', idempotencyKey: 'reunion-1' };
  const trabajo = await (await api('/jobs', body)).json();
  assert.equal((await (await api('/jobs', body)).json()).id, trabajo.id);
  const llamar = async ({ agente, mensajes }) => {
    const entrada = JSON.parse(mensajes.at(-1).content);
    if (agente === 'coordinador' && !entrada.agente) return JSON.stringify({ tipo:'delegar', agente:'redactor', objetivo:'Prepara un archivo' });
    if (agente === 'redactor' && !entrada.herramienta) return JSON.stringify({ tipo:'herramienta', nombre:'proponer_archivo', argumentos:{ ruta:'reunion.md', contenido:'Acta del lunes' } });
    return JSON.stringify({ tipo:'resultado', texto:'Acta pendiente de aprobación.' });
  };
  const fin = await procesarSiguiente({ estado, catalogo, llamar });
  assert.equal(fin.status, 'completed', fin.error);
  assert.equal(fin.resultado.llamadas, 4);
  assert.ok((await (await api('/jobs/' + trabajo.id)).json()).eventos.some(e => e.tipo === 'delegacion'));
  const archivo = path.join(directorio, 'artifacts/reunion.md');
  await assert.rejects(readFile(archivo), { code:'ENOENT' });
  const [propuesta] = await (await api('/approvals')).json();
  assert.equal(propuesta.status, 'pending');
  const decidir = () => api('/approvals/' + propuesta.id, { decision:'approve' });
  assert.equal((await (await decidir()).json()).status, 'applied');
  assert.equal((await (await decidir()).json()).status, 'applied');
  assert.equal(await readFile(archivo, 'utf8'), 'Acta del lunes');
  const otra = estado.proponer({ jobId:trabajo.id, tipo:'archivo', argumentos:{ ruta:'reunion.md', contenido:'Cambio' } });
  await assert.rejects(aplicarAprobacion({ estado, id:otra.id, directorio }), /ya existe/);
  assert.equal(await readFile(archivo, 'utf8'), 'Acta del lunes');
  assert.deepEqual(await (await api('/memory?q=pendiente')).json().then(r => r.map(x => x.tipo)), ['resumen']);
  await writeFile(path.join(directorio, 'guia.md'), 'La revisión usa referencias numeradas.');
  await ingerir({ estado, catalogo, material:directorio, ruta:'guia.md' });
  assert.equal(estado.buscar('referencias')[0].fuente, 'guia.md');
  estado.recordar({ clave:'guia-extensa', texto:'Inicio. '.repeat(150) + 'Biomarcadores: preparar muestras.', fuente:'guia.md', tipo:'documento' });
  const pasaje = contextoRecuperado(estado, 'Busca los biomarcadores').find(m => m.clave === 'guia-extensa');
  assert.ok(pasaje.parcial && pasaje.texto.includes('Biomarcadores') && pasaje.fuente === 'guia.md');
});
