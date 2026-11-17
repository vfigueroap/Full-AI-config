import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as esperar } from 'node:timers/promises';
import path from 'node:path';

test('el comando servir procesa por HTTP un encargo, lo conserva y vuelve a abrirlo al reiniciar', {timeout:20000}, async t => {
  const dir = await mkdtemp(path.join(tmpdir(),'ai-daemon-'));
  const modelo = createServer(async (req, res) => {
    const partes=[]; for await (const parte of req) partes.push(parte);
    const {messages,model} = JSON.parse(Buffer.concat(partes));
    const entrada = JSON.parse(messages.at(-1).content);
    assert.equal(model,'coordinador-test');
    assert.equal(entrada.perfil.zona,'America/Santiago');
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({tipo:'resultado',texto:'Puedo ayudarte con tu proyecto.'})}}]}));
  });
  await new Promise(r => modelo.listen(0,'127.0.0.1',r));
  const reserva = createServer(); await new Promise(r => reserva.listen(0,'127.0.0.1',r));
  const port = reserva.address().port; await new Promise(r => reserva.close(r));
  const token = 'prueba-local-daemon-123456789012345678';
  const headers = {authorization:'Bearer '+token,'content-type':'application/json'};
  const url = 'http://127.0.0.1:'+port;
  const hijos=[];
  const parar = async hijo => {
    if (hijo.exitCode !== null || hijo.signalCode !== null) return;
    const fin = once(hijo,'exit'); hijo.kill(); await fin;
  };
  t.after(async () => {
    for(const hijo of hijos) await parar(hijo);
    await new Promise(r => modelo.close(r)); await rm(dir,{recursive:true,force:true});
  });
  async function arrancar() {
    const hijo=spawn(process.execPath,[path.resolve(import.meta.dirname,'../ia.mjs'),'servir'],{
      env:{...process.env, AI_HOST:'127.0.0.1',AI_PORT:String(port),AI_DATA_DIR:dir,AI_MATERIAL_DIR:'',AI_API_TOKEN:token,
        LLM_MODEL:'especialista-test',LLM_COORDINATOR_MODEL:'coordinador-test',LLM_API_KEY:'',LLM_BASE_URL:'http://127.0.0.1:'+modelo.address().port+'/v1'},
      stdio:'ignore',windowsHide:true,
    });
    hijos.push(hijo);
    for(let i=0;i<100;i++) {
      if(hijo.exitCode !== null) throw Error('El servicio terminó al iniciar');
      if((await fetch(url+'/health',{headers}).catch(()=>null))?.ok) return hijo;
      await esperar(40);
    }
    throw Error('Servicio no disponible');
  }
  const hijo=await arrancar();
  const solicitud=await fetch(url+'/jobs',{method:'POST',headers,body:JSON.stringify({objetivo:'Hola'})});
  assert.equal(solicitud.status,202); const {id}=await solicitud.json();
  let job;
  for(let i=0;i<100;i++) {
    job=await (await fetch(url+'/jobs/'+id,{headers})).json();
    if(['completed','failed'].includes(job.status)) break;
    await esperar(40);
  }
  assert.equal(job.status,'completed',job.error);
  await parar(hijo); await arrancar();
  const guardado=await (await fetch(url+'/jobs/'+id,{headers})).json();
  assert.equal(guardado.resultado.texto,'Puedo ayudarte con tu proyecto.');
});
