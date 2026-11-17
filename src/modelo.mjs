export class ErrorDeModelo extends Error {}

// Solo estos diagnósticos locales se muestran en la CLI; la respuesta de error del servidor puede contener el prompt.
export function crearCliente(entorno = process.env) {
  const base = new URL(entorno.LLM_BASE_URL || 'http://127.0.0.1:11434/v1');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('LLM_BASE_URL debe ser la URL base HTTP(S) del servidor, sin credenciales ni parámetros.');
  }
  const clave = entorno.LLM_API_KEY;
  if (clave && base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new Error('Usa HTTPS para enviar LLM_API_KEY a un servidor remoto.');
  }
  base.pathname = base.pathname.replace(/\/$/, '') + '/chat/completions';
  return async function llamar({ agente, modelo, tier, mensajes, signal }) {
    const elegido = modelo || ((tier === 'coordinator' || agente === 'coordinador') && entorno.LLM_COORDINATOR_MODEL) || entorno.LLM_MODEL;
    if (!elegido) throw new ErrorDeModelo('Define LLM_MODEL con el nombre de un modelo disponible en tu servidor.');
    let respuesta;
    try {
      respuesta = await fetch(base, {
        method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        headers: { 'content-type': 'application/json', ...(clave ? { authorization: 'Bearer ' + clave } : {}) },
        body: JSON.stringify({ model: elegido, messages: mensajes, stream: false, response_format: { type: 'json_object' } }),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') throw new ErrorDeModelo('El modelo superó el tiempo de espera de dos minutos.');
      throw new ErrorDeModelo('No se pudo contactar el servidor de modelos. Comprueba LLM_BASE_URL y que el servidor esté iniciado.');
    }
    if (!respuesta.ok) {
      await respuesta.body?.cancel();
      throw new ErrorDeModelo('El servidor devolvió HTTP ' + respuesta.status + '. Comprueba el modelo, la URL y el acceso.');
    }
    const trozos = [];
    let bytes = 0;
    for await (const trozo of respuesta.body) {
      bytes += trozo.length;
      if (bytes > 512 * 1024) throw new ErrorDeModelo('La respuesta del servidor supera 512 KiB.');
      trozos.push(trozo);
    }
    let datos;
    try { datos = JSON.parse(Buffer.concat(trozos).toString('utf8')); }
    catch { throw new ErrorDeModelo('El servidor devolvió una respuesta ilegible. Comprueba que admita Chat Completions.'); }
    const opcion = datos?.choices?.[0];
    if (opcion?.finish_reason === 'length') throw new ErrorDeModelo('El servidor cortó la respuesta por longitud.');
    if (typeof opcion?.message?.content !== 'string' || !opcion.message.content.trim()) {
      throw new ErrorDeModelo('El servidor no devolvió texto en choices[0].message.content.');
    }
    return opcion.message.content;
  };
}
