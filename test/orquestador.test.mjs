import test from 'node:test';
import assert from 'node:assert/strict';
import { ejecutar } from '../src/orquestador.mjs';

const catalogo = {
  agentes: {
    coordinador: { modelo: 'simple' },
    a: { nombre: 'A', descripcion: 'Analiza', skill: 'Resume.', herramientas: [] },
    b: { nombre: 'B', descripcion: 'Redacta', skill: 'Redacta.', herramientas: [] },
    c: { nombre: 'C', descripcion: 'Combina', skill: 'Combina.', herramientas: ['leer'] },
  },
  flujos: { normal: { descripcion: '', pasos: [{ agente: 'c', depende_de: ['a', 'b'] }, { agente: 'a' }, { agente: 'b' }] } },
};

test('ejecuta dependencias declaradas aunque los pasos estén desordenados', async () => {
  const llamadas = [];
  const r = await ejecutar({ catalogo, flujo: 'normal', objetivo: 'x', llamar: async ({ agente, mensajes }) => {
    llamadas.push(agente);
    if (agente === 'c') assert.deepEqual(JSON.parse(mensajes[1].content).dependencias, { a: 'A', b: 'B' });
    return JSON.stringify({ tipo: 'resultado', texto: agente.toUpperCase() });
  } });
  assert.deepEqual(new Set(llamadas), new Set(['a', 'b', 'c']));
  assert.equal(r.texto, 'C');
});

test('usa el coordinador y rechaza una selección desconocida', async () => {
  let prompt;
  await assert.rejects(ejecutar({ catalogo: { ...catalogo, agentes: { ...catalogo.agentes, coordinador: { nombre: 'Coord', descripcion: 'D', skill: 'S' } } }, objetivo: 'x', llamar: async ({ agente, mensajes }) => { if (agente === 'coordinador') { prompt = mensajes[0].content; return '{"flujo":"otro"}'; } return ''; } }), /coordinador seleccionó un flujo inválido/);
  assert.match(prompt, /Coord\. D/);
  assert.match(prompt, /Instrucciones: S/);
});

test('rechaza herramientas no autorizadas', async () => {
  const cat = structuredClone(catalogo);
  cat.agentes.a.herramientas = [];
  await assert.rejects(ejecutar({ catalogo: cat, flujo: 'normal', objetivo: 'x', llamar: async ({ agente }) => agente === 'a' ? '{"tipo":"herramienta","nombre":"leer","argumentos":{}}' : '{"tipo":"resultado","texto":"ok"}', herramientas: { leer: async () => 'dato' } }), /herramienta no autorizada/);
});

test('no ejecuta dependientes cuando una dependencia falla', async () => {
  const llamadas = [];
  await assert.rejects(ejecutar({ catalogo, flujo: 'normal', objetivo: 'x', llamar: async ({ agente }) => {
    llamadas.push(agente);
    if (agente === 'a') throw new Error('falló');
    return '{"tipo":"resultado","texto":"ok"}';
  } }), /Agente a: error al llamar al modelo/);
  assert.ok(!llamadas.includes('c'));
});

test('expone herramientas disponibles, rechaza resultados vacíos y contextualiza errores sin detalles sensibles', async () => {
  const cat = structuredClone(catalogo);
  cat.agentes.a.herramientas = ['validar', 'ausente'];
  const tool = async () => { throw new Error('token=secreto'); };
  tool.nombre = 'Validador';
  tool.descripcion = 'Valida datos';
  tool.uso = '{"texto":"..."}';
  await assert.rejects(ejecutar({ catalogo: cat, flujo: 'normal', objetivo: 'x', herramientas: { validar: tool }, llamar: async ({ agente, mensajes }) => {
    if (agente === 'a') {
      assert.match(mensajes[0].content, /Validador/);
      assert.match(mensajes[0].content, /texto/);
      assert.doesNotMatch(mensajes[0].content, /ausente/);
      return '{"tipo":"herramienta","nombre":"validar","argumentos":{"texto":"x"}}';
    }
    return '{"tipo":"resultado","texto":"ok"}';
  } }), /Agente a: error al ejecutar la herramienta validar/);

  await assert.rejects(ejecutar({ catalogo, flujo: 'normal', objetivo: 'x', llamar: async () => '{"tipo":"resultado","texto":"  "}' }), /resultado está vacío/);
});

test('no ofrece ni permite herramientas que no están en el registry', async () => {
  await assert.rejects(ejecutar({ catalogo, flujo: 'normal', objetivo: 'x', llamar: async ({ agente, mensajes }) => {
    if (agente === 'c') {
      assert.doesNotMatch(mensajes[0].content, /"leer"/);
      return '{"tipo":"herramienta","nombre":"leer","argumentos":{}}';
    }
    return '{"tipo":"resultado","texto":"ok"}';
  } }), /herramienta no autorizada o no disponible: leer/);
});
