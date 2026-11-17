import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cargarCatalogo } from '../runtime/node/catalogo.mjs';

const raiz = path.resolve(import.meta.dirname, '..');

test('todas las skills tienen un especialista secundario alcanzable y recursos portables', async () => {
  const c = await cargarCatalogo(raiz);
  assert.match(c.agentes.investigador.skill, /name: investigar/);
  for (const id of Object.keys(c.skills)) assert.ok(Object.values(c.agentes).some(a => a.role === 'secondary' && a.skills.includes(id)));
  const visited = new Set();
  const walk = id => { visited.add(id); c.agentes[id].delegates.forEach(walk); };
  walk('coordinador');
  assert.equal(visited.size, Object.keys(c.agentes).length);
  assert.ok(c.agentes.coordinador.delegates.every(id => c.agentes[id].role === 'primary'));
});

test('rechaza ciclos de flujos, delegaciones fuera de nivel y skills huérfanas', async t => {
  const temporal = await mkdtemp(path.join(tmpdir(), 'ia-catalogo-'));
  t.after(() => rm(temporal, {recursive:true,force:true}));
  for (const dir of ['registry','agents','skills','plugins','workflows']) await cp(path.join(raiz, dir), path.join(temporal, dir), {recursive:true});
  const ap=path.join(temporal,'registry/agents.json');
  const agentes=JSON.parse(await readFile(ap,'utf8'));
  agentes.coordinador.delegates.push('investigador');
  await writeFile(ap,JSON.stringify(agentes));
  await assert.rejects(cargarCatalogo(temporal),/Delegación fuera de nivel/);
  agentes.coordinador.delegates.pop();
  for(const a of Object.values(agentes)) if(a.role==='secondary') a.skills=a.skills.filter(s=>s!=='investigar');
  await writeFile(ap,JSON.stringify(agentes));
  await assert.rejects(cargarCatalogo(temporal),/Skill sin responsable secundario/);
  await cp(path.join(raiz,'registry/agents.json'),ap);
  const fp=path.join(temporal,'workflows/sintesis/workflow.json');
  const f=JSON.parse(await readFile(fp,'utf8'));f.pasos[0].depende_de=['redactor'];
  await writeFile(fp,JSON.stringify(f));
  await assert.rejects(cargarCatalogo(temporal),/Ciclo/);
});
