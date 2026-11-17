import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { cargarCatalogo } from '../src/catalogo.mjs';
import { ejecutar } from '../src/orquestador.mjs';

const raiz = path.resolve(import.meta.dirname, '..');
const resultado = texto => JSON.stringify({ tipo: 'resultado', texto });

test('el flujo consejo obtiene opiniones independientes y un revisor sintetiza etiquetas A/B', async () => {
  const catalogo = await cargarCatalogo(raiz);
  assert.equal(catalogo.plugins.consejo.enabled, true);
  assert.equal(catalogo.plugins['revision-documental'].enabled, true);
  const pasos = catalogo.flujos.consejo.pasos;
  assert.deepEqual(pasos.map(p => [p.agente, p.depende_de]), [
    ['investigador', []], ['planificador', []], ['revisor', ['investigador', 'planificador']],
  ]);
  assert.equal(pasos[2].anonimizar, true);
  for (const paso of pasos) assert.ok(paso.instrucciones.length > 0);

  const vistas = {};
  const r = await ejecutar({ catalogo, flujo: 'consejo', objetivo: '¿Conviene lanzar el curso piloto en abril?', llamar: async ({ agente, mensajes }) => {
    const tarea = JSON.parse(mensajes[1].content);
    if (agente === 'investigador' || agente === 'planificador') {
      assert.equal(tarea.objetivo, '¿Conviene lanzar el curso piloto en abril?');
      assert.deepEqual(tarea.dependencias, {});
      assert.match(mensajes[0].content, /Encargo de este paso:/);
      vistas[agente] = tarea;
      return agente === 'investigador'
        ? resultado('Propuesta con hechos: validar demanda antes de confirmar abril.')
        : resultado('Propuesta con plan: hacer piloto pequeño en abril y revisar métricas.');
    }
    assert.equal(agente, 'revisor');
    assert.match(mensajes[0].content, /etiquetas no garantizan/);
    assert.deepEqual(Object.keys(tarea.dependencias), ['Propuesta A', 'Propuesta B']);
    assert.deepEqual(Object.values(tarea.dependencias), [
      'Propuesta con hechos: validar demanda antes de confirmar abril.',
      'Propuesta con plan: hacer piloto pequeño en abril y revisar métricas.',
    ]);
    assert.equal(vistas.investigador.objetivo, vistas.planificador.objetivo);
    return resultado('Sí, con un piloto pequeño y una validación de demanda antes de escalar.');
  } });

  assert.equal(r.texto, 'Sí, con un piloto pequeño y una validación de demanda antes de escalar.');
  assert.equal(r.resultados.investigador, 'Propuesta con hechos: validar demanda antes de confirmar abril.');
  assert.equal(r.resultados.planificador, 'Propuesta con plan: hacer piloto pequeño en abril y revisar métricas.');
  assert.equal(r.resultados.revisor, r.texto);
  assert.equal(r.llamadas, 3);
});
