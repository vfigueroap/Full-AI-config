import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluarTrazas } from '../scripts/evaluate.mjs';

test('evalúa rutas por responsabilidad y detecta escalamiento de permisos', () => {
  const cases=[{id:'x',split:'holdout',primary:'p',secondary:'s'}];
  const agents={coordinador:{delegates:['p'],herramientas:[]},p:{delegates:['s'],herramientas:[]},s:{delegates:[],herramientas:['leer']}};
  const trace={case_id:'x',completed:true,output:'Resultado',delegations:[{from:'coordinador',to:'p'},{from:'p',to:'s'}],tools:[{agent:'s',name:'leer'}]};
  assert.equal(evaluarTrazas(cases,[trace],agents).passed,1);
  trace.tools.push({agent:'s',name:'shell'});
  assert.equal(evaluarTrazas(cases,[trace],agents).passed,0);
  assert.equal(evaluarTrazas(cases,[],agents).passed,0);
  assert.throws(() => evaluarTrazas(cases,[trace,trace],agents),/duplicada/);
});
