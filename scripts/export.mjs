import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarCatalogo } from '../runtime/node/catalogo.mjs';

const VERSION = '1.0.0';
const TARGETS = new Set(['portable', 'codex', 'hermes', 'openclaw', 'plugin']);
const FILES = [
  '.env.example', '.gitignore', 'AGENTS.md', 'MEMORY.md', 'README.md', 'THIRD_PARTY.md',
  'ai.config.json', 'ia.mjs', 'package.json', 'config/settings.example.json',
  'evals/cases.json', 'evals/README.md', 'deploy/ai.service',
  'docs/ubuntu.md', 'docs/catalogo.md', 'docs/architecture.md', 'docs/aportes.md',
  'docs/favoritos.json', 'docs/reuse.md', 'docs/research.md', 'docs/consejo.md', 'docs/decisions/0001-portabilidad.md',
];
const DIRS = ['agents', 'skills', 'tools', 'integrations', 'workflows', 'plugins', 'registry', 'runtime/node', 'third_party', 'adapters', 'scripts', 'test'];
const OMIT = new Set(['.git', 'data', 'logs', 'floorplan', 'exports', 'node_modules', 'target', 'dist']);
const omitEntry = name => OMIT.has(name) || (name.startsWith('.env') && name !== '.env.example') || /(?:\.local\.json|\.sqlite(?:-[a-z]+)?|\.db|\.log)$/.test(name);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const inside = (a, b) => { const r = path.relative(a, b); return !path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`); };
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
const quoteToml = (s) => JSON.stringify(String(s));

async function copyFileSafe(src, dest, root) {
  const st = await lstat(src);
  if (st.isSymbolicLink()) throw new Error(`No se admiten symlinks: ${path.relative(root, src)}`);
  if (!st.isFile()) throw new Error(`Tipo de archivo no permitido: ${path.relative(root, src)}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await readFile(src));
}
async function copyTree(src, dest, root) {
  const st = await lstat(src);
  if (st.isSymbolicLink()) throw new Error(`No se admiten symlinks: ${path.relative(root, src)}`);
  if (st.isFile()) return copyFileSafe(src, dest, root);
  if (!st.isDirectory()) throw new Error(`Tipo de archivo no permitido: ${path.relative(root, src)}`);
  await mkdir(dest, { recursive: true });
  for (const ent of (await readdir(src, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    if (omitEntry(ent.name)) continue;
    const from = path.join(src, ent.name), to = path.join(dest, ent.name);
    if (ent.isSymbolicLink()) throw new Error(`No se admiten symlinks: ${path.relative(root, from)}`);
    await copyTree(from, to, root);
  }
}
async function assertNoSymlinks(src, root) {
  const st = await lstat(src);
  if (st.isSymbolicLink()) throw new Error(`No se admiten symlinks: ${path.relative(root, src)}`);
  if (st.isDirectory()) for (const ent of await readdir(src, { withFileTypes: true })) {
    if (omitEntry(ent.name)) continue;
    await assertNoSymlinks(path.join(src, ent.name), root);
  }
}
function readJson(p) { return readFile(p, 'utf8').then(JSON.parse); }

export async function exportar({ sourceRoot, target, out }) {
  if (!TARGETS.has(target)) throw new Error(`Target inválido. Use: ${[...TARGETS].join('|')}`);
  if (typeof sourceRoot !== 'string' || !sourceRoot || typeof out !== 'string' || !out) throw new Error('sourceRoot y out deben ser rutas no vacías');
  const sourceInput = path.resolve(sourceRoot), source = await realpath(sourceInput), destination = path.resolve(out);
  const sourceInputStat = await lstat(sourceInput);
  if (sourceInputStat.isSymbolicLink() || source !== sourceInput) throw new Error('El origen no puede ser symlink');
  const st = await lstat(source);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('El origen debe ser directorio real');
  const exportArea = path.join(source, 'exports');
  if ((inside(source, destination) && (!inside(exportArea, destination) || destination === exportArea)) || inside(destination, source)) throw new Error('El destino debe estar fuera del origen o dentro de AI/exports');
  for (const rel of FILES) await assertNoSymlinks(path.join(source, rel), source);
  for (const rel of DIRS) await assertNoSymlinks(path.join(source, rel), source);
  await cargarCatalogo(source);
  {
    let current = path.parse(destination).root;
    for (const part of path.relative(current, path.dirname(destination)).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try { const parentStat = await lstat(current); if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) throw new Error('No se admiten padres de destino enlazados o inválidos'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  try { await lstat(destination); throw new Error(`El destino ya existe: ${destination}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  const temp = await mkdtemp(path.join(parent, '.ai-export-'));
  try {
    for (const rel of FILES) await copyFileSafe(path.join(source, rel), path.join(temp, rel), source);
    for (const rel of DIRS) await copyTree(path.join(source, rel), path.join(temp, rel), source);
    try { await copyFileSafe(path.join(source, 'LICENSE'), path.join(temp, 'LICENSE'), source); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const agents = await readJson(path.join(temp, 'registry/agents.json'));
    const skills = await readJson(path.join(temp, 'registry/skills.json'));
    const orchestrator = Object.entries(agents).find(([, a]) => a.role === 'orchestrator');
    if (!orchestrator) throw new Error('Catálogo sin agente orchestrator');
    const [rootId, rootAgent] = orchestrator;
    const profile = await readFile(path.join(temp, rootAgent.instructions), 'utf8');
    const delegation = (rootAgent.delegates ?? []).map(id => `- ${id}: ${agents[id]?.description ?? 'delegado del catálogo'}`).join('\n');
    const workspaceGuide = `${profile.trim()}\n\n## Delegación disponible\n${delegation || '- Sin delegados configurados.'}\n\nConsulta registry/agents.json para cargar las instrucciones, skills y herramientas de cada delegado. Si el harness admite subagentes, entrega al hijo su AGENT.md y las skills asignadas. Conserva la jerarquía orquestador, primario y secundario. Usa los IDs del catálogo. Los contratos ejecutables están en registry/tools.json y el puente MCP requiere un AI_AGENT_ID secundario explícito.\n`;
    await writeFile(path.join(temp, 'AGENTS.md'), workspaceGuide);
    const skillIds = Object.keys(skills).sort();
    if (target === 'codex') {
      await mkdir(path.join(temp, '.agents/skills'), { recursive: true });
      await copyTree(path.join(temp, 'skills'), path.join(temp, '.agents/skills'), temp);
      await mkdir(path.join(temp, '.codex/agents'), { recursive: true });
      for (const [id, agent] of Object.entries(agents).sort(([a],[b]) => a.localeCompare(b))) {
        const instructions = await readFile(path.join(temp, agent.instructions), 'utf8');
        const attachedSkills = (agent.skills ?? []).map(skillId => `${skillId} — .agents/skills/${skillId}/SKILL.md`).join('\n');
        const delegates = (agent.delegates ?? []).join(', ');
        const prompt = `${instructions.trim()}\n\nSkills declaradas: ${attachedSkills || 'ninguna'}.\nIDs de delegación declarados: ${delegates || 'ninguno'}.`;
        const body = `name = ${quoteToml(id)}\ndescription = ${quoteToml(agent.description)}\ndeveloper_instructions = ${quoteToml(prompt)}\n`;
        await writeFile(path.join(temp, `.codex/agents/${id}.toml`), body);
      }
      await writeFile(path.join(temp, 'codex-config.example.toml'), `[mcp_servers.ai-agent]\ncommand = "node"\nargs = ["<EXPORT_ROOT>/tools/server.mjs"]\n[mcp_servers.ai-agent.env]\nAI_AGENT_ID = "investigador"\n`);
    } else if (target === 'hermes' || target === 'openclaw') {
      await mkdir(path.join(temp, 'skills'), { recursive: true });
      const host = target === 'hermes' ? 'hermes' : 'openclaw';
      if (host === 'hermes') await writeFile(path.join(temp, 'hermes-mcp.example.yaml'), `mcp_servers:\n  ai-agent:\n    command: node\n    args: ["<EXPORT_ROOT>/tools/server.mjs"]\n    env:\n      AI_AGENT_ID: investigador\n`);
      else await writeFile(path.join(temp, 'openclaw-mcp.example.json5'), json({ mcp: { servers: { 'ai-agent': { transport: 'stdio', command: 'node', args: ['<EXPORT_ROOT>/tools/server.mjs'], env: { AI_AGENT_ID: 'investigador' } } } } }));
    } else if (target === 'plugin') {
      const template = await readJson(path.join(source, 'adapters/templates/plugin.json'));
      template.name = 'ai-personal-assistant'; template.version = (await readJson(path.join(temp, 'package.json'))).version;
      template.description = 'Agentes y flujos exportados desde el catálogo AI.';
      await writeFile(path.join(temp, 'plugin.json'), json(template));
      await writeFile(path.join(temp, 'mcp.json'), json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { 'ai-agent': { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/tools/server.mjs'], cwd: '${PLUGIN_ROOT}', env: { AI_AGENT_ID: 'investigador' } } } }));
    }
    await writeFile(path.join(temp, 'MANUAL.md'), manual(target, rootId, skillIds));
    const metadata = await readJson(path.join(temp, 'package.json'));
    const files = [];
    async function collect(dir) {
      for (const ent of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name), rel = path.relative(temp, p).split(path.sep).join('/');
        if (ent.isDirectory()) await collect(p);
        else if (rel !== 'manifest.json') {
          const generated = ['AGENTS.md', 'MANUAL.md', 'plugin.json', 'mcp.json', 'codex-config.example.toml', 'hermes-mcp.example.yaml', 'openclaw-mcp.example.json5'].includes(rel) || rel.startsWith('.codex/agents/');
          files.push({ path: rel, source: generated ? null : rel.startsWith('.agents/skills/') ? `skills/${rel.slice('.agents/skills/'.length)}` : rel, sha256: hash(await readFile(p)) });
        }
      }
    }
    await collect(temp);
    files.sort((a,b) => a.path.localeCompare(b.path, 'en'));
    await writeFile(path.join(temp, 'manifest.json'), json({ schema_version: 1, exporter_version: VERSION, source_version: metadata.version, target, files }));
    await rename(temp, destination);
    return { destination, files: files.length };
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}

function manual(target, rootId, skillIds) {
  const native = {
    portable: 'El runtime Node y el puente MCP están incluidos. Para iniciar el servicio, copia .env.example a .env y sigue docs/ubuntu.md.',
    codex: 'Abre Codex en este directorio. Los agentes están en .codex/agents y las skills en .agents/skills. Sustituye <EXPORT_ROOT> en codex-config.example.toml por la ruta absoluta de esta copia y combina ese fragmento con tu .codex/config.toml.',
    hermes: 'Inicia Hermes desde este workspace para cargar AGENTS.md. Copia las carpetas de skills/ a ~/.hermes/skills/ o al directorio de skills de tu perfil. Sustituye <EXPORT_ROOT> en hermes-mcp.example.yaml y combina el fragmento con el config.yaml del perfil. registry/agents.json conserva los roles y delegaciones para configurar los subagentes del host.',
    openclaw: 'Configura este directorio como workspace de OpenClaw para cargar AGENTS.md y skills/. Sustituye <EXPORT_ROOT> en openclaw-mcp.example.json5 y combina el objeto mcp con la configuración de tu gateway. registry/agents.json conserva los roles y delegaciones para configurar los subagentes del host.',
    plugin: 'Importa esta carpeta en un host compatible con Agent Plugins 1.0.0 que tenga executor local. plugin.json, skills/ y mcp.json describen el paquete. El host debe expandir ${PLUGIN_ROOT} y disponer de Node 26. Configura AI_DATA_DIR con una carpeta persistente escribible al habilitar el servidor.',
  }[target];
  return `# Manual de exportación (${target})\n\nEl agente de entrada es \`${rootId}\`. Las skills incluidas son ${skillIds.map(x => `\`${x}\``).join(', ')}.\n\n${native}\n\nConfigura AI_AGENT_ID con el secundario que usará el puente MCP. Cada instancia expone sus herramientas autorizadas y disponibles. AI_MATERIAL_DIR habilita una carpeta de lectura explícita. AI_DATA_DIR fija el almacenamiento persistente y, por defecto, apunta a data/ dentro de esta exportación. El puente toma variables de entorno del proceso.\n\n## Comprobar la copia\n\nEjecuta \`node scripts/validate.mjs\` desde esta carpeta. Para probar una herramienta determinista usa \`echo '{"texto":"{}"}' | node tools/run.mjs --agent revisor --tool validar_json\`. El esquema de cada herramienta está en registry/tools.json.\n\n## Limitaciones\n\nEl host controla sus agentes nativos, la delegación y los permisos externos. El puente aplica la lista de herramientas del secundario elegido. Los presupuestos y la jerarquía estricta se ejecutan también en el runtime de referencia. La integración real con cada harness requiere una prueba local después de configurar sus rutas y modelos. Los ejemplos MCP requieren edición de rutas antes de activarse.\n\nLas fuentes y el formato de cada adaptación están documentados en adapters/README.md.\n`;
}

async function main(argv) {
  let target, out;
  for (let i=0; i<argv.length; i++) {
    if (argv[i] === '--target') target = argv[++i];
    else if (argv[i] === '--out') out = argv[++i];
    else throw new Error(`Argumento desconocido: ${argv[i]}`);
  }
  if (!target || !out) throw new Error('Uso: node scripts/export.mjs --target portable|codex|hermes|openclaw|plugin --out CARPETA_NUEVA');
  const result = await exportar({ sourceRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), target, out });
  console.log(`Exportación ${target}: ${result.destination} (${result.files} archivos)`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
