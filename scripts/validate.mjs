import path from 'node:path';
import { cargarCatalogo } from '../runtime/node/catalogo.mjs';

try {
  const catalogo = await cargarCatalogo(path.resolve(import.meta.dirname, '..'));
  console.log(JSON.stringify({
    valid: true,
    agents: Object.values(catalogo.agentes).reduce((acc, a) => ({...acc, [a.role]:(acc[a.role] || 0) + 1}), {}),
    skills: Object.keys(catalogo.skills).length,
    tools: Object.keys(catalogo.herramientas).length,
    workflows: Object.keys(catalogo.flujos).length,
    plugins: Object.keys(catalogo.plugins).length,
  }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
