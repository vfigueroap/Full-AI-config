import { spawn } from 'node:child_process';
import path from 'node:path';
import { once } from 'node:events';

// El operador elige el binario y las URI. El modelo solo puede seleccionar un alias.
export async function leerRecursoMcp(cfg, alias, env) {
  const ejecutable = env[cfg.command_env];
  if (!ejecutable || !path.isAbsolute(ejecutable) || !Array.isArray(cfg.args) || !cfg.args.every(x => typeof x === 'string'))
    throw new Error('Configura el ejecutable absoluto y los argumentos del servidor MCP.');
  if (!cfg.resources || typeof alias !== 'string' || !Object.hasOwn(cfg.resources, alias))
    throw new Error('Recurso MCP no permitido.');
  const uri = cfg.resources[alias];
  if (typeof uri !== 'string' || !URL.canParse(uri)) throw new Error('URI MCP inválida.');
  const entorno = {};
  for (const k of ['PATH','Path','SYSTEMROOT','SystemRoot','TEMP','TMP','LANG', ...(cfg.env_keys ?? [])]) {
    if (env[k] !== undefined) entorno[k] = env[k];
  }
  const hijo = spawn(ejecutable, cfg.args, { env: entorno, shell:false, windowsHide:true, stdio:['pipe','pipe','ignore'] });
  const cerrado = once(hijo, 'close').catch(() => {});
  const enviar = objeto => hijo.stdin.write(JSON.stringify({ jsonrpc:'2.0', ...objeto }) + '\n');
  const fallo = new Error('El servidor MCP no completó la lectura del recurso.');
  const timer = setTimeout(() => hijo.kill('SIGKILL'), 20000);
  let errorInicio;
  hijo.once('error', () => { errorInicio = true; });
  hijo.stdin.on('error', () => hijo.kill('SIGKILL'));
  try {
    enviar({ id:1, method:'initialize', params:{ protocolVersion:'2025-11-25', capabilities:{}, clientInfo:{name:'ai-personal',version:'0.2'} } });
    let pendiente = '', bytes = 0, esperado = 1;
    hijo.stdout.setEncoding('utf8');
    for await (const trozo of hijo.stdout) {
      bytes += Buffer.byteLength(trozo);
      if (bytes > 160 * 1024) throw new Error('La respuesta MCP supera el límite.');
      pendiente += trozo;
      let corte;
      while ((corte = pendiente.indexOf('\n')) !== -1) {
        const linea = pendiente.slice(0,corte).trim(); pendiente = pendiente.slice(corte+1);
        if (!linea) continue;
        let rpc;
        try { rpc = JSON.parse(linea); } catch { throw fallo; }
        if (rpc?.jsonrpc !== '2.0') throw fallo;
        if (rpc.method === 'ping' && rpc.id != null) { enviar({id:rpc.id,result:{}}); continue; }
        if (rpc.method && rpc.id == null) continue;
        if (rpc.id !== esperado || !rpc.result || rpc.error || rpc.method) throw fallo;
        if (esperado === 1) {
          if (rpc.result.protocolVersion !== '2025-11-25' || !rpc.result.capabilities?.resources) throw fallo;
          enviar({ method:'notifications/initialized' });
          enviar({ id:2, method:'resources/read', params:{uri} });
          esperado = 2;
        } else {
          const partes = rpc.result.contents;
          if (!Array.isArray(partes) || !partes.length || !partes.every(p => p?.uri === uri && typeof p.text === 'string')) throw fallo;
          return partes.map(p => p.text).join('\n');
        }
      }
    }
    if (errorInicio) throw new Error('No se pudo iniciar el servidor MCP.');
    throw fallo;
  } finally {
    clearTimeout(timer); hijo.stdin.end(); hijo.kill('SIGKILL'); await cerrado;
  }
}
