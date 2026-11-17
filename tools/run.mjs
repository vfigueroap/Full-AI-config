import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearPuente, MAX_MESSAGE_BYTES } from './server.mjs';

function usage() {
  throw new Error('Uso: node tools/run.mjs [--agent ID] --tool ID [--input archivo.json]');
}

function parse(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--agent', '--tool', '--input'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--') || options[key]) usage();
    options[key] = argv[++i];
  }
  if (!options['--tool']) usage();
  return options;
}

async function readInput(file) {
  let data;
  if (file) data = await readFile(file);
  else {
    const chunks = [];
    let total = 0;
    for await (const chunk of process.stdin) {
      total += chunk.length;
      if (total > MAX_MESSAGE_BYTES) throw new Error('Input too large.');
      chunks.push(chunk);
    }
    data = Buffer.concat(chunks);
  }
  if (data.length > MAX_MESSAGE_BYTES) throw new Error('Input too large.');
  let value;
  try { value = JSON.parse(data.toString('utf8')); } catch { throw new Error('Input must be valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Input must be a JSON object.');
  return value;
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const options = parse(argv);
  const input = await readInput(options['--input']);
  const runtimeEnv = { ...env };
  if (options['--agent']) runtimeEnv.AI_AGENT_ID = options['--agent'];
  const bridge = await crearPuente({ env: runtimeEnv });
  try {
    const result = await bridge.callTool(options['--tool'], input);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.isError) process.exitCode = 1;
    return result;
  } finally { bridge.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().catch(() => {
    process.stderr.write('Tool run failed.\n');
    process.exitCode = 1;
  });
}
