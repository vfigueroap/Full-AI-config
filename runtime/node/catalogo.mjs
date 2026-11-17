import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';


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
  async function leerLocal(relativo) {
    exigir(typeof relativo === 'string' && !path.isAbsolute(relativo), 'Se requiere una ruta local relativa');
    const archivo = path.resolve(directorio, relativo);
    const rutaReal = await realpath(archivo);
    const rel = path.relative(directorio, rutaReal);
    exigir(rel && !rel.startsWith('..') && !path.isAbsolute(rel) && path.relative(archivo, rutaReal) === '', 'Ruta fuera del catálogo: ' + relativo);
    const texto = (await readFile(archivo, 'utf8')).trim();
    exigir(texto.length > 0 && texto.length <= 2000000, 'Archivo vacío o demasiado grande: ' + relativo);
    return texto;
  }
  async function cargarJson(relativo) {
    const datos = JSON.parse(await leerLocal(relativo));
    exigir(datos && typeof datos === 'object' && !Array.isArray(datos), 'Configuración inválida: ' + relativo);
    return datos;
  }
  const [definiciones, skills, herramientas, integraciones, flujosIndex, plugins] = await Promise.all(
    ['agents', 'skills', 'tools', 'integrations', 'workflows', 'plugins'].map(nombre => cargarJson('registry/' + nombre + '.json')));
  const flujos = Object.create(null);
  for (const [id, entrada] of Object.entries(flujosIndex)) {
    exigir(idValido.test(id) && entrada.path === 'workflows/' + id + '/workflow.json', 'Ruta de flujo inválida: ' + id);
    flujos[id] = await cargarJson(entrada.path);
  }
  for (const [id, plugin] of Object.entries(plugins)) {
    exigir(idValido.test(id) && typeof plugin.enabled === 'boolean', 'Complemento inválido');
    exigir(plugin.manifest === 'plugins/' + id + '/plugin.json', 'Ruta de complemento inválida');
    const pack = await cargarJson(plugin.manifest);
    exigir(pack.workflows && typeof pack.workflows === 'object' && !Array.isArray(pack.workflows), 'Flujos de complemento inválidos');
    for (const [nombre, flujo] of Object.entries(pack.workflows)) {
      comprobarFlujo(nombre, flujo, definiciones);
      if (!plugin.enabled) continue;
      exigir(!Object.hasOwn(flujos, nombre), 'Flujo duplicado en complemento');
      flujos[nombre] = flujo;
    }
  }
  const agentes = Object.create(null);
  const niveles = { orchestrator: 'primary', primary: 'secondary', secondary: null };
  for (const [id, a] of Object.entries(definiciones)) {
    exigir(idValido.test(id) && a && typeof a.name === 'string' && a.name.trim() && typeof a.description === 'string' && a.description.trim(), 'Agente inválido: ' + id);
    exigir(Object.hasOwn(niveles, a.role), 'Nivel de agente inválido: ' + id);
    exigir(a.instructions === 'agents/' + a.role + '/' + id + '/AGENT.md', 'Ubicación de agente inválida: ' + id);
    exigir(Array.isArray(a.skills) && a.skills.every(s => Object.hasOwn(skills, s)) && new Set(a.skills).size === a.skills.length, 'Skills desconocidas o repetidas: ' + id);
    exigir(Array.isArray(a.tools) && a.tools.every(t => Object.hasOwn(herramientas, t)), 'Herramientas desconocidas: ' + id);
    exigir(Array.isArray(a.delegates) && a.delegates.every(d => d !== id && definiciones[d]?.role === niveles[a.role]), 'Delegación fuera de nivel: ' + id);
    exigir(a.role === 'secondary' ? a.delegates.length === 0 : a.delegates.length > 0, 'Delegados inválidos: ' + id);
    exigir(['coordinator', 'specialist'].includes(a.model_tier), 'Categoría de modelo inválida: ' + id);
    if (a.model !== undefined) exigir(typeof a.model === 'string' && a.model.trim(), 'Modelo inválido: ' + id);
    const rutas = a.skills.flatMap(s => [skills[s].path, ...(skills[s].resources ?? [])]);
    const textos = await Promise.all([a.instructions, ...rutas].map(leerLocal));
    agentes[id] = { nombre:a.name, descripcion:a.description, role:a.role, skills:a.skills, skill:textos.join('\n\n'), herramientas:a.tools,
      delegates:a.delegates, modelTier:a.model_tier, useWhen:a.use_when, avoidWhen:a.do_not_use_when, modelo:a.model };
  }
  exigir(definiciones.coordinador?.role === 'orchestrator' && Object.values(definiciones).filter(a => a.role === 'orchestrator').length === 1, 'Debe existir un único orquestador coordinador');
  const alcanzables = new Set();
  function visitar(id) { alcanzables.add(id); for (const d of definiciones[id].delegates) if (!alcanzables.has(d)) visitar(d); }
  visitar('coordinador');
  exigir(alcanzables.size === Object.keys(definiciones).length, 'Hay agentes sin ruta desde el orquestador');
  for (const [id, skill] of Object.entries(skills)) {
    exigir(idValido.test(id) && skill.path === 'skills/' + id + '/SKILL.md', 'Ruta de skill inválida: ' + id);
    exigir(Object.values(definiciones).some(a => a.role === 'secondary' && a.skills.includes(id)), 'Skill sin responsable secundario: ' + id);
    const texto = await leerLocal(skill.path);
    exigir(/^---\r?\n/.test(texto) && new RegExp('^name: *[\x22\x27]?' + id + '[\x22\x27]? *$', 'm').test(texto), 'Frontmatter inválido: ' + id);
    for (const recurso of skill.resources ?? []) {
      exigir(recurso.startsWith('skills/' + id + '/') && !recurso.split('/').includes('..'), 'Recurso fuera de su skill: ' + id);
      await leerLocal(recurso);
    }
  }
  for (const [id, t] of Object.entries(herramientas)) {
    exigir(idValido.test(id) && ['read', 'local_write', 'approval'].includes(t.effect) && t.input_schema?.type === 'object', 'Herramienta inválida: ' + id);
    exigir(Array.isArray(t.input_schema.required) && t.input_schema.properties && t.input_schema.additionalProperties === false, 'Esquema de herramienta inválido: ' + id);
    exigir(Object.values(definiciones).some(a => a.role === 'secondary' && a.tools.includes(id)), 'Herramienta sin secundario responsable: ' + id);
  }
  for (const [id, flujo] of Object.entries(flujos)) comprobarFlujo(id, flujo, agentes);
  return { agentes, flujos, skills, herramientas, integraciones, plugins };
}
