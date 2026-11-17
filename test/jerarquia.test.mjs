import test from 'node:test';
import assert from 'node:assert/strict';
import { ejecutar } from '../runtime/node/orquestador.mjs';

const salida = texto => JSON.stringify({ tipo: 'resultado', texto });
const agentes = {
  coordinador: { nombre: 'Coordinador', descripcion: 'Planifica', skill: 'Integra.', delegates: ['universidad'] },
  universidad: { nombre: 'Universidad', descripcion: 'Investiga', skill: 'Investiga.', delegates: ['tutor'] },
  tutor: { nombre: 'Tutor', descripcion: 'Explica', skill: 'Explica.', delegates: [] },
};
const catalogo = { agentes, flujos: {} };

test('devuelve por la jerarquía coordinador → universidad → tutor y cada padre integra al hijo', async () => {
  const vistos = {};
  const r = await ejecutar({ catalogo, jerarquia: true, objetivo: 'Diseña una clase', llamar: async ({ agente, mensajes }) => {
    const ult = JSON.parse(mensajes.at(-1).content);
    if (agente === 'coordinador' && !ult.agente) return JSON.stringify({ tipo: 'delegar', agente: 'universidad', objetivo: 'Busca evidencia para la clase' });
    if (agente === 'universidad' && !ult.agente) return JSON.stringify({ tipo: 'delegar', agente: 'tutor', objetivo: 'Explica el concepto principal' });
    if (agente === 'tutor') return salida('Concepto: aprendizaje activo.');
    vistos[agente] = ult;
    if (agente === 'universidad') {
      assert.deepEqual(ult, { agente: 'tutor', resultado: 'Concepto: aprendizaje activo.' });
      return salida('Evidencia: el aprendizaje activo mejora la retención.');
    }
    assert.deepEqual(ult, { agente: 'universidad', resultado: 'Evidencia: el aprendizaje activo mejora la retención.' });
    return salida('Clase: aprendizaje activo con evidencia y explicación.');
  } });
  assert.equal(r.flujo, 'jerarquia');
  assert.equal(r.texto, 'Clase: aprendizaje activo con evidencia y explicación.');
  assert.deepEqual(r.resultados, {
    tutor: 'Concepto: aprendizaje activo.',
    universidad: 'Evidencia: el aprendizaje activo mejora la retención.',
    coordinador: 'Clase: aprendizaje activo con evidencia y explicación.',
  });
  assert.equal(r.llamadas, 5);
});

test('rechaza delegaciones fuera de la allowlist y corta ciclos de delegación', async () => {
  const noAutorizado = structuredClone(catalogo);
  noAutorizado.agentes.coordinador.delegates = [];
  await assert.rejects(ejecutar({ catalogo: noAutorizado, jerarquia: true, objetivo: 'x', llamar: async () =>
    JSON.stringify({ tipo: 'delegar', agente: 'universidad', objetivo: 'y' }) }), /delegación no autorizada/);

  const cíclico = structuredClone(catalogo);
  cíclico.agentes.universidad.delegates = ['coordinador'];
  await assert.rejects(ejecutar({ catalogo: cíclico, jerarquia: true, objetivo: 'x', llamar: async ({ agente }) =>
    agente === 'coordinador'
      ? JSON.stringify({ tipo: 'delegar', agente: 'universidad', objetivo: 'y' })
      : JSON.stringify({ tipo: 'delegar', agente: 'coordinador', objetivo: 'z' }) }), /Delegación cíclica o demasiado profunda/);
});

test('comparte un presupuesto de 32 llamadas de modelo entre agentes del DAG', async () => {
  const names = Array.from({ length: 7 }, (_, i) => `a${i}`);
  const cat = { agentes: Object.fromEntries(names.map(id => [id, {
    nombre: id, descripcion: '', skill: '', herramientas: ['ping'],
  }])), flujos: { todos: { pasos: names.map(agente => ({ agente })) } } };
  let llamadas = 0;
  const tools = { ping() { return 'pong'; } };
  await assert.rejects(ejecutar({ catalogo: cat, flujo: 'todos', objetivo: 'x', herramientas: tools, llamar: async ({ agente }) => {
    llamadas++;
    const count = cat.agentes[agente].count = (cat.agentes[agente].count ?? 0) + 1;
    if (count <= 4) return JSON.stringify({ tipo: 'herramienta', nombre: 'ping', argumentos: {} });
    return salida('ok');
  } }), /límite de 32 llamadas al modelo/);
  assert.equal(llamadas, 32);
});

test('permite cuatro herramientas por agente y rechaza la quinta', async () => {
  const cat = { agentes: { a: { nombre: 'A', descripcion: '', skill: '', herramientas: ['ping'] } },
    flujos: { uno: { pasos: [{ agente: 'a' }] } } };
  let usadas = 0;
  await assert.rejects(ejecutar({ catalogo: cat, flujo: 'uno', objetivo: 'x', herramientas: { ping() { usadas++; } }, llamar: async () =>
    JSON.stringify({ tipo: 'herramienta', nombre: 'ping', argumentos: {} }) }), /excedió el límite de 4 llamadas a herramientas/);
  assert.equal(usadas, 4);
});

test('ejecuta en paralelo hasta tres nodos independientes y espera sus dependencias', async () => {
  const cat = { agentes: Object.fromEntries(['a', 'b', 'c', 'final'].map(id => [id,
    { nombre: id, descripcion: '', skill: '', herramientas: [] }])), flujos: { dag: { pasos: [
      { agente: 'final', depende_de: ['a', 'b', 'c'] }, { agente: 'a' }, { agente: 'b' }, { agente: 'c' },
    ] } } };
  let activos = 0, maxActivos = 0;
  const r = await ejecutar({ catalogo: cat, flujo: 'dag', objetivo: 'x', llamar: async ({ agente, mensajes }) => {
    if (agente === 'final') assert.deepEqual(JSON.parse(mensajes[1].content).dependencias, { a: 'a', b: 'b', c: 'c' });
    activos++;
    maxActivos = Math.max(maxActivos, activos);
    await new Promise(resolve => setTimeout(resolve, 5));
    activos--;
    return salida(agente);
  } });
  assert.equal(maxActivos, 3);
  assert.equal(r.texto, 'final');
});
