import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, lstat, mkdir, writeFile, cp, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exportar } from '../scripts/export.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
async function temp() { return mkdtemp(path.join(os.tmpdir(), 'ai-export-test-')); }

test('portable exports allowed source, excludes private locations and has deterministic manifest', async () => {
  const root = await temp();
  try {
    const a = path.join(root, 'a'), b = path.join(root, 'b');
    await exportar({ sourceRoot: source, target: 'portable', out: a });
    await exportar({ sourceRoot: source, target: 'portable', out: b });
    const ma = await readFile(path.join(a, 'manifest.json'), 'utf8');
    assert.equal(ma, await readFile(path.join(b, 'manifest.json'), 'utf8'));
    for (const forbidden of ['.env', 'config/settings.json', 'data', 'logs', '.git', 'floorplan']) {
      await assert.rejects(lstat(path.join(a, forbidden)));
    }
    assert.ok((await readFile(path.join(a, 'AGENTS.md'), 'utf8')).includes('## Delegación disponible'));
    assert.ok((await readFile(path.join(a, 'skills/analisis-riesgos/SKILL.md'), 'utf8')).length > 0);
    assert.ok((await readFile(path.join(a, 'skills/analisis-riesgos/references/template.md'), 'utf8')).length > 0);
    assert.ok((await readFile(path.join(a, 'ai.config.json'), 'utf8')).includes('entry_agent'));
    assert.ok((await readFile(path.join(a, 'manifest.json'), 'utf8')).includes('"sha256"'));
    const input = path.join(root, 'input.json');
    await writeFile(input, JSON.stringify({ texto: '{}' }));
    const run = await exec(process.execPath, ['tools/run.mjs', '--agent', 'revisor', '--tool', 'validar_json', '--input', input], { cwd: a });
    assert.equal(JSON.parse(run.stdout).content[0].text, 'JSON válido');
    await exec(process.execPath, ['scripts/validate.mjs'], { cwd: a });
    await lstat(path.join(a, 'deploy/ai.service'));
    await lstat(path.join(a, 'scripts/export.mjs'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native targets emit Codex TOML/skills and valid plugin and host config JSON', async () => {
  const root = await temp();
  try {
    for (const target of ['codex', 'hermes', 'openclaw', 'plugin']) {
      const out = path.join(root, target);
      await exportar({ sourceRoot: source, target, out });
      if (target === 'codex') {
        const toml = await readFile(path.join(out, '.codex/agents/investigador.toml'), 'utf8');
        assert.match(toml, /^name = "investigador"/m);
        assert.ok((await readdir(path.join(out, '.agents/skills'))).length > 0);
        const config = await readFile(path.join(out, 'codex-config.example.toml'), 'utf8');
        assert.match(config, /^\[mcp_servers\.ai-agent\]/m);
      }
      if (target === 'hermes') assert.match(await readFile(path.join(out, 'hermes-mcp.example.yaml'), 'utf8'), /^mcp_servers:/m);
      if (target === 'openclaw') {
        const config = JSON.parse(await readFile(path.join(out, 'openclaw-mcp.example.json5'), 'utf8'));
        assert.equal(config.mcp.servers['ai-agent'].transport, 'stdio');
      }
      if (target === 'plugin') {
        const manifest = JSON.parse(await readFile(path.join(out, 'plugin.json'), 'utf8'));
        assert.equal(manifest.version, '0.3.0');
        assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
        const mcp = JSON.parse(await readFile(path.join(out, 'mcp.json'), 'utf8'));
        assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
      }
      assert.ok((await readFile(path.join(out, 'MANUAL.md'), 'utf8')).includes('Limitaciones'));
      const names = { codex: 'codex-config.example.toml', hermes: 'hermes-mcp.example.yaml', openclaw: 'openclaw-mcp.example.json5', plugin: 'mcp.json' };
      assert.ok((await readFile(path.join(out, 'MANUAL.md'), 'utf8')).includes(names[target]));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('exports under exports/ and rejects destination parents linked into the source', async () => {
  const root = await temp();
  try {
    const fixture = path.join(root, 'source');
    await cp(source, fixture, { recursive: true, filter: p => !/(?:[\\/](?:\.git|node_modules|data|logs|floorplan|exports)(?:[\\/]|$))/.test(p) });
    await writeFile(path.join(fixture, 'skills/investigar/.env'), 'PRIVATE_SENTINEL');
    await writeFile(path.join(fixture, 'config/settings.json'), '{"private":"PRIVATE_SENTINEL"}');
    await exportar({ sourceRoot: fixture, target: 'portable', out: path.join(fixture, 'exports/portable') });
    await assert.rejects(lstat(path.join(fixture, 'exports/portable/skills/investigar/.env')));
    await assert.rejects(lstat(path.join(fixture, 'exports/portable/config/settings.json')));
    const alias = path.join(root, 'alias');
    await symlink(path.join(fixture, 'agents'), alias, 'junction');
    await assert.rejects(exportar({ sourceRoot: fixture, target: 'portable', out: path.join(alias, 'bad') }), /padres de destino/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('refuses existing destination without changing it', async () => {
  const root = await temp();
  try {
    const out = path.join(root, 'exists'); await mkdir(out); await writeFile(path.join(out, 'keep'), 'x');
    await assert.rejects(exportar({ sourceRoot: source, target: 'portable', out }));
    assert.equal(await readFile(path.join(out, 'keep'), 'utf8'), 'x');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects symlinks in the source allowlist', async (t) => {
  const root = await temp();
  try {
    const fixture = path.join(root, 'src'), elsewhere = path.join(root, 'elsewhere');
    await cp(source, fixture, { recursive: true, filter: (p) => !/(?:[\\/](?:\.git|node_modules|data|logs|floorplan|exports)(?:[\\/]|$))/.test(p) });
    await mkdir(elsewhere);
    const linked = path.join(fixture, 'skills/analisis-riesgos/references');
    await rm(linked, { recursive: true, force: true }); await symlink(elsewhere, linked, 'junction');
    await assert.rejects(exportar({ sourceRoot: fixture, target: 'portable', out: path.join(root, 'out') }), /symlinks/);
  } catch (error) {
    if (['EPERM','EACCES','UNKNOWN'].includes(error.code)) { t.skip('Windows no permite crear symlinks en este entorno'); return; }
    throw error;
  } finally { await rm(root, { recursive: true, force: true }); }
});
