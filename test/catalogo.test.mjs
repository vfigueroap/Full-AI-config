import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cargarCatalogo } from '../src/catalogo.mjs';

const raiz = path.resolve(import.meta.dirname, '..');

test('carga las skills y las referencias a agentes del catálogo real', async () => {
  const catalogo = await cargarCatalogo(raiz);
  assert.match(catalogo.agentes.investigador.skill, /name: investigar/);
  assert.ok(catalogo.flujos.investigacion.pasos.some(p => p.agente === 'investigador' && !p.depende_de.length));
});

test('rechaza ids inválidos y ciclos en flujos', async () => {
  const temporal = await mkdtemp(path.join(tmpdir(), 'ia-catalogo-'));
  try {
    await mkdir(path.join(temporal, 'config'), { recursive: true });
    await mkdir(path.join(temporal, 'skills', 'x'), { recursive: true });
    await writeFile(path.join(temporal, 'skills', 'x', 'SKILL.md'), 'skill');
    const perfil = { nombre: 'X', descripcion: 'Agente', skill: 'x', herramientas: [] };
    await writeFile(path.join(temporal, 'config', 'agentes.json'), JSON.stringify({ x: perfil, coordinador: perfil }));
    const flujosPath = path.join(temporal, 'config', 'flujos.json');
    await writeFile(flujosPath, JSON.stringify({ 'flujo malo': { descripcion: 'Inválido', pasos: [{ agente: 'x', depende_de: [] }] } }));
    await assert.rejects(cargarCatalogo(temporal), /Id de flujo inválido/);
    await writeFile(flujosPath, JSON.stringify({ f: { descripcion: 'Cíclico', pasos: [{ agente: 'x', depende_de: ['x'] }] } }));
    await assert.rejects(cargarCatalogo(temporal), /Ciclo/);
    await writeFile(flujosPath, JSON.stringify({ f: { descripcion: 'Rol ajeno', pasos: [{ agente: 'constructor', depende_de: [] }] } }));
    await assert.rejects(cargarCatalogo(temporal), /Agente inválido/);
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
});
