import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarCatalogo } from '../runtime/node/catalogo.mjs';

export function evaluarTrazas(casos, trazas, agentes) {
  if (!Array.isArray(trazas)) throw new Error('La evaluación requiere una lista de trazas.');
  const ids = new Set();
  for (const t of trazas) {
    if (!t || !casos.some(c => c.id === t.case_id) || ids.has(t.case_id) || !Array.isArray(t.delegations) || !Array.isArray(t.tools))
      throw new Error('Traza desconocida, duplicada o inválida.');
    ids.add(t.case_id);
  }
  const resultados = casos.map(c => {
    const t = trazas.find(t => t.case_id === c.id);
    const delegaciones = t?.delegations ?? [];
    const checks = {
      completa: t?.completed === true && typeof t.output === 'string' && t.output.trim().length > 0,
      primary: delegaciones.some(d => d.from === 'coordinador' && d.to === c.primary),
      secondary: delegaciones.some(d => d.from === c.primary && d.to === c.secondary),
      permisos: !!t && delegaciones.every(d => agentes[d.from]?.delegates.includes(d.to))
        && t.tools.every(x => agentes[x.agent]?.herramientas.includes(x.name)),
    };
    return { id:c.id, split:c.split, checks, passed:Object.values(checks).every(Boolean) };
  });
  return { kind:'routing-and-permissions', passed:resultados.filter(r => r.passed).length, total:resultados.length, results:resultados };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Uso: node scripts/evaluate.mjs TRAZAS.json');
    const raiz = path.resolve(import.meta.dirname,'..');
    const casos = JSON.parse(await readFile(path.join(raiz,'evals/cases.json'),'utf8'));
    const datos = await readFile(process.argv[2],'utf8');
    if (datos.length > 1000000) throw new Error('Las trazas superan 1 MB.');
    const c = await cargarCatalogo(raiz);
    const r = evaluarTrazas(casos,JSON.parse(datos),c.agentes);
    console.log(JSON.stringify(r,null,2));
    if (r.passed !== r.total) process.exitCode = 1;
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
