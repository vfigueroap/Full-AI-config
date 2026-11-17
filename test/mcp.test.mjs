import test from 'node:test';
import assert from 'node:assert/strict';
import { crearIntegraciones } from '../src/integraciones.mjs';

test('MCP abre el servidor configurado y lee exclusivamente el recurso autorizado', async () => {
  const server = `require('node:readline').createInterface({input:process.stdin}).on('line', raw => {
    const m=JSON.parse(raw);
    if(m.method==='initialize') console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:m.params.protocolVersion,capabilities:{resources:{}}}}));
    if(m.method==='resources/read') console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{contents:[{uri:m.params.uri,text:'Rúbrica vigente'}]}}));
  })`;
  const cfg = { protocol:'mcp', enabled:true, command_env:'MCP_BIN', args:['-e',server], resources:{rubrica:'curso://calculo/rubrica'} };
  const { consultar_integracion } = crearIntegraciones({ catalogo:{integraciones:{mcp:cfg}}, env:{MCP_BIN:process.execPath} });
  assert.equal(await consultar_integracion({integracion:'mcp',ruta:'rubrica'}), 'Rúbrica vigente');
  await assert.rejects(consultar_integracion({integracion:'mcp',ruta:'curso://secreto'}), /no permitido/);
});
