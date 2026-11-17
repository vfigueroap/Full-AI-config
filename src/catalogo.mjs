import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { crearHerramientas } from './herramientas.mjs';

const idValido = /^[a-z][a-z0-9_-]*$/;

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function comprobarFlujo(id, flujo, agentes) {
  exigir(idValido.test(id), `Id de flujo inválido: ${id}`);
  exigir(flujo && typeof flujo.descripcion === 'string' && flujo.descripcion.trim(), `Descripción inválida en flujo ${id}`);
  exigir(Array.isArray(flujo.pasos) && flujo.pasos.length > 0, `Pasos inválidos en flujo ${id}`);
  const pasos = new Map();
  for (const paso of flujo.pasos) {
    if (paso?.instrucciones !== undefined) exigir(typeof paso.instrucciones === 'string' && paso.instrucciones.length <= 4000, 'Instrucciones de paso inválidas');
    if (paso?.anonimizar !== undefined) exigir(typeof paso.anonimizar === 'boolean', 'anonimizar debe ser booleano');
    exigir(paso && typeof paso.agente === 'string' && paso.agente !== 'coordinador' && Object.hasOwn(agentes, paso.agente), `Agente inválido en flujo ${id}: ${paso?.agente}`);
    exigir(!pasos.has(paso.agente), `Agente duplicado en flujo ${id}: ${paso.agente}`);
    exigir(Array.isArray(paso.depende_de), `depende_de debe ser una lista en flujo ${id}`);
    pasos.set(paso.agente, paso.depende_de);
  }
  for (const [agente, dependencias] of pasos) {
    exigir(new Set(dependencias).size === dependencias.length, `Dependencia duplicada en flujo ${id}: ${agente}`);
    for (const dependencia of dependencias) exigir(pasos.has(dependencia), `Dependencia desconocida en flujo ${id}: ${dependencia}`);
  }
  const estado = new Map();
  function visitar(agente) {
    exigir(estado.get(agente) !== 1, `Ciclo en flujo ${id}`);
    if (estado.get(agente) === 2) return;
    estado.set(agente, 1);
    for (const dependencia of pasos.get(agente)) visitar(dependencia);
    estado.set(agente, 2);
  }
  for (const agente of pasos.keys()) visitar(agente);
  const dependientes = new Set([...pasos.values()].flat());
  exigir([...pasos.keys()].filter((agente) => !dependientes.has(agente)).length === 1, `El flujo ${id} debe tener un único destino final`);
}

export async function cargarCatalogo(raiz) {
  const directorio = await realpath(raiz);
  const herramientasValidas = new Set(Object.keys(crearHerramientas(directorio)));
  async function cargarJson(relativo) {
    const archivo = path.join(directorio, relativo);
    const datos = JSON.parse(await readFile(archivo, 'utf8'));
    exigir(datos && typeof datos === 'object' && !Array.isArray(datos), `Configuración inválida: ${relativo}`);
    return datos;
  }
  if (await stat(path.join(directorio, 'registry')).catch(() => null)) {
    const [definiciones, skills, herramientas, integraciones, flujos] = await Promise.all(
      ['agents', 'skills', 'tools', 'integrations', 'workflows'].map(nombre => cargarJson(`registry/${nombre}.json`)));
    const leerLocal = async relativo => {
      exigir(typeof relativo === 'string' && !path.isAbsolute(relativo), 'Se requiere una ruta local relativa');
      const archivo = path.resolve(directorio, relativo);
      const rutaReal = await realpath(archivo);
      const rel = path.relative(directorio, rutaReal);
      exigir(rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.relative(archivo, rutaReal) === '', `Ruta de instrucciones inválida: ${relativo}`);
      const texto = (await readFile(archivo, 'utf8')).trim();
      exigir(texto.length > 0 && texto.length <= 100000, `Instrucciones vacías o demasiado largas: ${relativo}`);
      return texto;
    };
    const plugins = await cargarJson('registry/plugins.json');
    for (const [id, plugin] of Object.entries(plugins)) {
      exigir(idValido.test(id) && typeof plugin.enabled === 'boolean', 'Complemento inválido');
      if (!plugin.enabled) continue;
      exigir(plugin.manifest === `plugins/${id}/plugin.json`, 'Ruta de complemento inválida');
      const pack = JSON.parse(await leerLocal(plugin.manifest));
      for (const [nombre, flujo] of Object.entries(pack.workflows)) {
        exigir(idValido.test(nombre) && !Object.hasOwn(flujos, nombre), 'Flujo duplicado o inválido en complemento');
        flujos[nombre] = flujo;
      }
    }
    const agentes = Object.create(null);
    for (const [id, a] of Object.entries(definiciones)) {
      exigir(idValido.test(id) && a && typeof a.name === 'string' && typeof a.description === 'string', `Agente inválido: ${id}`);
      exigir(Array.isArray(a.skills) && a.skills.every(s => Object.hasOwn(skills, s)), `Skills desconocidas: ${id}`);
      exigir(Array.isArray(a.tools) && a.tools.every(t => Object.hasOwn(herramientas, t)), `Herramientas desconocidas: ${id}`);
      exigir(Array.isArray(a.delegates) && a.delegates.every(d => d !== id && Object.hasOwn(definiciones, d)), `Delegación inválida: ${id}`);
      exigir(['coordinator', 'specialist'].includes(a.model_tier), `Categoría de modelo inválida: ${id}`);
      const rutas = a.skills.flatMap(s => [skills[s].path, ...(skills[s].resources ?? [])]);
      const textos = await Promise.all([a.instructions, ...rutas].map(leerLocal));
      agentes[id] = { nombre: a.name, descripcion: a.description, skill: textos.join('\n\n'), herramientas: a.tools,
        delegates: a.delegates, modelTier: a.model_tier, useWhen: a.use_when, avoidWhen: a.do_not_use_when, modelo: a.model };
    }
    exigir(Object.hasOwn(agentes, 'coordinador'), 'Falta el agente coordinador');
    for (const [id, flujo] of Object.entries(flujos)) comprobarFlujo(id, flujo, agentes);
    for (const [id, t] of Object.entries(herramientas)) {
      exigir(idValido.test(id) && ['read', 'local_write', 'approval'].includes(t.effect) && t.input_schema?.type === 'object', `Herramienta inválida: ${id}`);
    }
    return { agentes, flujos, skills, herramientas, integraciones, plugins };
  }
  const [agentesConfig, flujos] = await Promise.all([cargarJson('config/agentes.json'), cargarJson('config/flujos.json')]);
  const agentes = Object.create(null);
  for (const [id, config] of Object.entries(agentesConfig)) {
    exigir(idValido.test(id), `Id de agente inválido: ${id}`);
    exigir(config && typeof config.nombre === 'string' && config.nombre.trim(), `Nombre inválido para agente ${id}`);
    exigir(typeof config.descripcion === 'string' && config.descripcion.trim(), `Descripción inválida para agente ${id}`);
    exigir(typeof config.skill === 'string' && idValido.test(config.skill), `Skill inválida para agente ${id}`);
    exigir(Array.isArray(config.herramientas) && config.herramientas.every((herramienta) => herramientasValidas.has(herramienta)), `Herramientas inválidas para agente ${id}`);
    const skillPath = path.join(directorio, 'skills', config.skill, 'SKILL.md');
    exigir(path.relative(skillPath, await realpath(skillPath)) === '', `Ruta de skill enlazada fuera de su carpeta: ${id}`);
    const skill = (await readFile(skillPath, 'utf8')).trim();
    exigir(skill.length > 0, `Skill vacía para agente ${id}`);
    const agente = { nombre: config.nombre, descripcion: config.descripcion, skill, herramientas: config.herramientas };
    if (config.modelo !== undefined) {
      exigir(typeof config.modelo === 'string' && config.modelo.trim(), `Modelo inválido para agente ${id}`);
      agente.modelo = config.modelo;
    }
    agentes[id] = agente;
  }
  exigir(Object.hasOwn(agentes, 'coordinador'), 'Falta el agente coordinador');
  exigir(Object.keys(flujos).length > 0, 'No hay flujos configurados');
  for (const [id, flujo] of Object.entries(flujos)) comprobarFlujo(id, flujo, agentes);
  return { agentes, flujos };
}
