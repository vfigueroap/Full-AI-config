#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnvFile } from 'node:process';
import { cargarCatalogo } from './src/catalogo.mjs';
import { crearHerramientas } from './src/herramientas.mjs';
import { crearCliente, ErrorDeModelo } from './src/modelo.mjs';
import { ejecutar } from './src/orquestador.mjs';
import { abrirEstado } from './src/estado.mjs';
import { aplicarAprobacion, ingerir } from './src/capacidades.mjs';
import { crearServidor, procesarSiguiente } from './src/servicio.mjs';

const raiz = import.meta.dirname;
try { loadEnvFile(path.join(raiz, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const ayuda = `AI · Node.js 26+
  node ia.mjs catalogo [--json]
  node ia.mjs ejecutar "objetivo" [--flujo ID] [--material CARPETA] [--json]
  node ia.mjs pedir "objetivo" [--flujo ID]
  node ia.mjs servir
  node ia.mjs trabajos [ID]
  node ia.mjs aprobaciones
  node ia.mjs aprobar ID | rechazar ID
  node ia.mjs memoria listar | buscar "texto" | guardar CLAVE "texto" | historial CLAVE | olvidar CLAVE
  node ia.mjs ingerir ARCHIVO_RELATIVO --material CARPETA
  node ia.mjs programar ID "objetivo" --cada SEGUNDOS [--flujo ID]
  node ia.mjs programaciones | desprogramar ID

«pedir» guarda el encargo; «servir» lo procesa con delegación jerárquica.
«ejecutar» conserva el modo inmediato de flujos sin memoria persistente.
Consulta README.md para configurar modelos, token y despliegue Ubuntu.`;
const imprimir = obj => console.log(JSON.stringify(obj, null, 2));

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    flujo: { type: 'string' }, material: { type: 'string' }, cada: { type: 'string' },
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  const [comando, primero, segundo, tercero] = positionals;
  if (!comando || values.help) return console.log(ayuda);
  const catalogo = await cargarCatalogo(raiz);
  if (values.flujo !== undefined && !Object.hasOwn(catalogo.flujos, values.flujo)) throw new Error('Flujo desconocido.');
  if (comando === 'catalogo') {
    const agentes = Object.entries(catalogo.agentes).map(([id, a]) => ({ id, nombre: a.nombre, descripcion: a.descripcion, herramientas: a.herramientas, delegates: a.delegates, model_tier: a.modelTier }));
    if (values.json) return imprimir({ agentes, flujos: catalogo.flujos });
    console.log(agentes.map(a => a.id + ' · ' + a.descripcion).join('\n'));
    console.log('\nFlujos: ' + Object.keys(catalogo.flujos).join(', ')); return;
  }
  const material = values.material || process.env.AI_MATERIAL_DIR;
  const directorioMaterial = material ? path.resolve(raiz, material) : undefined;
  if (directorioMaterial && !(await stat(directorioMaterial).catch(() => null))?.isDirectory()) throw new Error('La carpeta de material no existe.');
  if (comando === 'ejecutar') {
    const resultado = await ejecutar({ catalogo, objetivo: primero, flujo: values.flujo,
      herramientas: crearHerramientas(directorioMaterial), llamar: crearCliente(),
      alPaso: ({ agente, evento }) => console.error('[' + agente + '] ' + evento),
    });
    console.log(values.json ? JSON.stringify(resultado, null, 2) : resultado.texto); return;
  }
  const directorio = path.resolve(raiz, process.env.AI_DATA_DIR || 'data');
  const estado = abrirEstado(directorio);
  try {
    if (comando === 'pedir') return imprimir(estado.encolar({ objetivo: primero, flujo: values.flujo }));
    if (comando === 'trabajos') return imprimir(primero ? { trabajo: estado.trabajo(primero), eventos: estado.eventos(primero) } : estado.listarTrabajos());
    if (comando === 'aprobaciones') return imprimir(estado.aprobaciones());
    if (comando === 'aprobar') return imprimir(await aplicarAprobacion({ estado, id: primero, directorio }));
    if (comando === 'rechazar') return imprimir(estado.rechazar(primero));
    if (comando === 'programaciones') return imprimir(estado.programaciones());
    if (comando === 'desprogramar') return imprimir({ eliminado: estado.desprogramar(primero) });
    if (comando === 'programar') return imprimir(estado.programar({ id: primero, objetivo: segundo, flujo: values.flujo, cadaSegundos: Number(values.cada) }));
    if (comando === 'ingerir') return imprimir(await ingerir({ estado, material: directorioMaterial, ruta: primero, catalogo }));
    if (comando === 'memoria') {
      if (primero === 'listar') return imprimir(estado.memorias());
      if (primero === 'buscar') return imprimir(estado.buscar(segundo));
      if (primero === 'historial') return imprimir(estado.historial(segundo));
      if (primero === 'olvidar') return imprimir({ eliminado: estado.olvidar(segundo) });
      if (primero === 'guardar' && /^[a-zA-Z0-9_-]{1,100}$/.test(segundo || '')) return imprimir(estado.recordar({ clave: 'usuario:' + segundo, texto: tercero, fuente: 'usuario', tipo: 'preferencia' }));
    }
    if (comando === 'servir') {
      const port = Number(process.env.AI_PORT || 8787);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AI_PORT inválido.');
      if (!process.env.LLM_MODEL) throw new Error('Define LLM_MODEL antes de iniciar el servicio.');
      const llamar = crearCliente();
      let ajustes;
      try { ajustes = await readFile(path.join(raiz, 'config/settings.json'), 'utf8'); }
      catch (e) {
        if (e.code !== 'ENOENT') throw e;
        ajustes = await readFile(path.join(raiz, 'config/settings.example.json'), 'utf8');
      }
      const { language, timezone } = JSON.parse(ajustes);
      const reloj = new Intl.DateTimeFormat(language, { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' });
      const servidor = crearServidor({ estado, catalogo, directorio, token: process.env.AI_API_TOKEN });
      const control = new AbortController();
      const detener = () => control.abort();
      process.once('SIGINT', detener); process.once('SIGTERM', detener);
      try {
        await new Promise((resolve, reject) => servidor.once('error', reject).listen(port, process.env.AI_HOST || '127.0.0.1', resolve));
        console.error('AI listo en ' + (process.env.AI_HOST || '127.0.0.1') + ':' + port);
        while (!control.signal.aborted) {
          await procesarSiguiente({ estado, catalogo, llamar, material: directorioMaterial, signal: control.signal,
            perfil: { idioma: language, zona: timezone, fecha: reloj.format(new Date()) } });
          if (!control.signal.aborted) await new Promise(resolve => {
            const done = () => { clearTimeout(timer); control.signal.removeEventListener('abort', done); resolve(); };
            const timer = setTimeout(done, 1000); control.signal.addEventListener('abort', done, { once: true });
          });
        }
      } finally {
        process.removeListener('SIGINT', detener); process.removeListener('SIGTERM', detener);
        servidor.closeAllConnections();
        await new Promise(resolve => servidor.close(resolve));
      }
      return;
    }
    throw new Error('Comando inválido.\n' + ayuda);
  } finally { estado.close(); }
}
main().catch(error => {
  console.error(error.message);
  if (error.cause instanceof ErrorDeModelo) console.error(error.cause.message);
  process.exitCode = 1;
});
