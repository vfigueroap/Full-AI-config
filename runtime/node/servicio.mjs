import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ejecutar } from './orquestador.mjs';
import { ErrorDeModelo } from './modelo.mjs';
import { crearCapacidades, aplicarAprobacion } from '../../tools/capacidades.mjs';

// Conserva la procedencia y prioriza el pasaje pertinente dentro del presupuesto del modelo.
export function contextoRecuperado(estado, objetivo) {
  const consulta = objetivo.slice(0, 1000);
  const memorias = [...estado.preferencias(), ...estado.buscar(consulta, 5)];
  const vistas = new Set();
  const palabras = (consulta.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(p => !['una','los','las','para','que','con','del'].includes(p));
  return memorias.filter(m => {
    if (vistas.has(m.clave)) return false;
    vistas.add(m.clave); return true;
  }).map(({clave, texto, fuente, tipo, actualizado}) => {
    const pasajes = texto.match(/[\s\S]{1,900}/gu) || [];
    const mejor = pasajes.reduce((top, fragmento, i) => {
      const puntos = palabras.filter(p => fragmento.toLowerCase().includes(p)).length;
      return puntos > top.puntos ? { puntos, i } : top;
    }, { puntos:-1, i:0 });
    return { clave, fuente, tipo, actualizado, texto:pasajes[mejor.i], parcial:pasajes.length > 1 };
  });
}

export async function procesarSiguiente({ estado, catalogo, llamar, material, env, signal, perfil }) {
  signal?.throwIfAborted();
  estado.activarProgramadas();
  const trabajo = estado.tomarTrabajo();
  if (!trabajo) return null;
  const control = new AbortController();
  const cancelacion = signal ? AbortSignal.any([signal, control.signal]) : control.signal;
  const comprobarLease = () => {
    try { if (!estado.renovar(trabajo.id, trabajo.leaseToken)) control.abort(); }
    catch { control.abort(); }
  };
  const renovar = setInterval(comprobarLease, 30000);
  try {
    const contexto = contextoRecuperado(estado, trabajo.objetivo);
    const resultado = await ejecutar({ catalogo, objetivo: trabajo.objetivo, flujo: trabajo.flujo || undefined,
      llamar, jerarquia: true, signal: cancelacion, contexto, perfil,
      herramientas: crearCapacidades({ estado, jobId: trabajo.id, catalogo, material, env, signal: cancelacion, comprobarLease }),
      alPaso: ({ agente, evento, ...detalle }) => estado.evento(trabajo.id, agente, evento, detalle),
    });
    cancelacion.throwIfAborted();
    const terminado = estado.terminar(trabajo.id, trabajo.leaseToken, { resultado });
    if (terminado) estado.recordar({ clave: 'job:' + trabajo.id, texto: resultado.texto.slice(0, 8000), fuente: trabajo.id, tipo: 'resumen' });
    return terminado;
  } catch (error) {
    if (cancelacion.aborted) return null; // La próxima instancia recupera el trabajo tras expirar su lease.
    const mensaje = error.cause instanceof ErrorDeModelo ? error.cause.message : error.message;
    return estado.terminar(trabajo.id, trabajo.leaseToken, { error: String(mensaje).slice(0, 4000) });
  } finally { clearInterval(renovar); }
}

function campos(obj, permitidos) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(k => !permitidos.includes(k))) throw new Error('Campos no válidos.');
  return obj;
}

export function crearServidor({ estado, catalogo, directorio, token }) {
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw new Error('AI_API_TOKEN debe tener al menos 32 bytes.');
  const secreto = Buffer.from('Bearer ' + token);
  const flujoValido = flujo => { if (flujo !== undefined && !Object.hasOwn(catalogo.flujos, flujo)) throw new Error('Flujo desconocido.'); };
  const servidor = createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    const enviar = (status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); };
    const recibida = Buffer.from(req.headers.authorization || '');
    if (recibida.length !== secreto.length || !timingSafeEqual(recibida, secreto)) return enviar(401, { error: 'No autorizado.' });
    try {
      const url = new URL(req.url, 'http://localhost');
      const ruta = url.pathname;
      if (req.method === 'GET') {
        if (ruta === '/health') return enviar(200, { ok: true });
        if (ruta === '/jobs') return enviar(200, estado.listarTrabajos().map(({ leaseToken, ...j }) => j));
        if (/^\/jobs\/[a-zA-Z0-9-]+$/.test(ruta)) {
          const trabajo = estado.trabajo(ruta.slice(6));
          if (!trabajo) return enviar(404, { error: 'Trabajo desconocido.' });
          const { leaseToken, ...publico } = trabajo;
          return enviar(200, { ...publico, eventos: estado.eventos(trabajo.id) });
        }
        if (ruta === '/approvals') return enviar(200, estado.aprobaciones());
        if (ruta === '/schedules') return enviar(200, estado.programaciones());
        if (ruta === '/memory') return enviar(200, url.searchParams.has('q') ? estado.buscar(url.searchParams.get('q')) : estado.memorias());
      }
      if (req.method !== 'POST') return enviar(404, { error: 'Ruta desconocida.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return enviar(415, { error: 'Se requiere application/json.' });
      let bytes = 0;
      const trozos = [];
      for await (const trozo of req) {
        bytes += trozo.length;
        if (bytes > 65536) { enviar(413, { error: 'Solicitud demasiado grande.' }); return; }
        trozos.push(trozo);
      }
      const body = JSON.parse(Buffer.concat(trozos).toString('utf8'));
      if (ruta === '/jobs') {
        campos(body, ['objetivo', 'flujo', 'idempotencyKey']); flujoValido(body.flujo);
        const { leaseToken, ...trabajo } = estado.encolar(body);
        return enviar(202, trabajo);
      }
      if (ruta === '/memory') {
        campos(body, ['clave', 'texto']);
        if (typeof body.clave !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.clave)) throw new Error('Clave inválida.');
        return enviar(201, estado.recordar({ clave: 'usuario:' + body.clave, texto: body.texto, tipo: 'preferencia', fuente: 'usuario' }));
      }
      if (ruta === '/schedules') {
        campos(body, ['id', 'objetivo', 'flujo', 'cadaSegundos', 'proxima']); flujoValido(body.flujo);
        return enviar(201, estado.programar(body));
      }
      if (/^\/approvals\/[a-f0-9]{64}$/.test(ruta)) {
        campos(body, ['decision']);
        const id = ruta.slice(11);
        if (body.decision === 'approve') return enviar(200, await aplicarAprobacion({ estado, id, directorio }));
        if (body.decision === 'reject') {
          const propuesta = estado.rechazar(id);
          if (!propuesta) return enviar(404, { error: 'Propuesta desconocida.' });
          return enviar(propuesta.status === 'rejected' ? 200 : 409, propuesta);
        }
        throw new Error('Decisión inválida.');
      }
      enviar(404, { error: 'Ruta desconocida.' });
    } catch { if (!res.headersSent) enviar(400, { error: 'Solicitud inválida o acción no disponible. Consulta el catálogo y el estado de la propuesta.' }); }
  });
  return servidor;
}
