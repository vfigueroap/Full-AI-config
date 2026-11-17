import { lstat, mkdir, realpath, readFile, writeFile, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { crearHerramientas } from './herramientas.mjs';
import { crearIntegraciones } from './integraciones.mjs';

function archivo({ ruta, contenido }) {
  if (typeof ruta !== 'string' || ruta.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(md|txt|json|csv)$/.test(ruta)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(ruta)) throw new Error('Usa un nombre simple .md, .txt, .json o .csv, sin carpetas.');
  if (typeof contenido !== 'string' || Buffer.byteLength(contenido) > 64000) throw new Error('Contenido inválido o mayor de 64 kB.');
  return { ruta, contenido };
}

export function crearCapacidades({ estado, jobId, catalogo, material, env, signal, comprobarLease }) {
  const activas = {
    ...crearHerramientas(material), ...crearIntegraciones({ catalogo, material, env }),
    buscar_memoria({ consulta }) { return estado.buscar(consulta); },
    guardar_memoria({ clave, texto }) {
      if (typeof clave !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(clave)) throw new Error('Clave inválida.');
      return estado.recordar({ clave: 'agente:' + clave, texto, fuente: 'job:' + jobId, tipo: 'nota_agente' });
    },
    proponer_archivo(input) { return estado.proponer({ jobId, tipo: 'archivo', argumentos: archivo(input) }); },
  };
  if (!material) delete activas.convertir_documento;
  const conectadas = Object.entries(catalogo.integraciones).filter(([, c]) => c.enabled);
  if (!conectadas.length) delete activas.consultar_integracion;
  const herramientas = Object.fromEntries(Object.entries(activas).map(([id, fn]) => [id, async input => {
    if (catalogo.herramientas[id].effect !== 'read') comprobarLease?.();
    signal?.throwIfAborted();
    const contrato = catalogo.herramientas[id].input_schema;
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || contrato.required.some(k => !Object.hasOwn(input, k))
        || Object.keys(input).some(k => !Object.hasOwn(contrato.properties, k))) throw new Error('Argumentos inválidos.');
    return fn(input);
  }]));
  if (herramientas.consultar_integracion) {
    herramientas.consultar_integracion.alcance = Object.fromEntries(conectadas.map(([id, c]) =>
      [id, c.protocol === 'mcp' ? Object.keys(c.resources ?? {}) : c.allowed_paths.map(p => p.replace(/^\//, ''))]));
  }
  return herramientas;
}

export async function aplicarAprobacion({ estado, id, directorio }) {
  const aprobacion = estado.aprobar(id);
  if (!aprobacion) throw new Error('Aprobación desconocida.');
  if (aprobacion.status === 'applied') return aprobacion;
  if (aprobacion.status !== 'approved' || aprobacion.tipo !== 'archivo') throw new Error('La propuesta no puede aplicarse.');
  const { ruta, contenido } = archivo(aprobacion.argumentos);
  const base = path.resolve(directorio, 'artifacts');
  await mkdir(base, { recursive: true, mode: 0o700 });
  if ((await lstat(base)).isSymbolicLink() || path.relative(base, await realpath(base)) !== '') throw new Error('El directorio de resultados no admite enlaces.');
  const destino = path.join(base, ruta);
  const temporal = path.join(base, '.pending-' + randomUUID());
  // El enlace exclusivo publica el archivo completo sin sobrescribir un resultado anterior.
  await writeFile(temporal, contenido, { flag: 'wx', mode: 0o600 });
  try {
    try { await link(temporal, destino); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const s = await lstat(destino);
      if (!s.isFile() || s.isSymbolicLink() || s.size > 64000 || await readFile(destino, 'utf8') !== contenido) throw new Error('El archivo ya existe con otro contenido; no fue sobrescrito.');
    }
  } finally { await unlink(temporal); }
  return estado.aplicada(id);
}

export async function ingerir({ estado, material, ruta, catalogo, env }) {
  if (!material) throw new Error('Indica --material o AI_MATERIAL_DIR.');
  const texto = /\.(txt|md|csv|json)$/i.test(ruta)
    ? await crearHerramientas(material).leer_texto({ ruta })
    : await crearIntegraciones({ catalogo, material, env }).convertir_documento({ ruta });
  if (typeof texto !== 'string' || !texto.trim() || texto.length > 128000) throw new Error('Documento vacío o demasiado grande.');
  const fuente = 'documento:' + createHash('sha256').update(material + '\0' + ruta + '\0' + texto).digest('hex').slice(0, 24);
  let fragmentos = 0;
  for (let i = 0; i < texto.length; i += 3500) {
    estado.recordar({ clave: fuente + ':' + fragmentos++, texto: texto.slice(i, i + 4000), fuente: ruta, tipo: 'documento' });
  }
  return { fuente, fragmentos };
}
