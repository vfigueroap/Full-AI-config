# Adaptadores de exportación

`node scripts/export.mjs --target <target> --out <directorio-nuevo>` genera una copia autocontenida del catálogo y sus recursos. `ai.config.json` describe su organización y la lista de rutas que se copian está en `scripts/export.mjs`.

| Target | Artefactos nativos | Límites |
| --- | --- | --- |
| portable | Node runtime, catálogo, skills, `AGENTS.md`, bridge MCP | Requiere Node 26 y configuración local explícita. |
| codex | `.codex/agents/*.toml`, `.agents/skills/` | El host controla cuándo delega y qué herramientas habilita. |
| hermes | Workspace `AGENTS.md`, `skills/`, ejemplo YAML MCP | Hermes consume skills y contexto del workspace; no convierte los registros de perfiles/delegación en agentes nativos separados. |
| openclaw | Workspace `AGENTS.md`, `skills/`, ejemplo JSON5 MCP | OpenClaw consume skills y contexto del workspace; los límites de delegación del catálogo no se imponen automáticamente. |
| plugin | `plugin.json` schema 1.0.0, `skills/`, MCP stdio local | Requiere executor local; MCP no es universalmente portable. |

No instala archivos en directorios globales. Solo copia `.env.example` y `config/settings.example.json`; nunca copia credenciales, datos o logs. Los symlinks se rechazan.

Referencias oficiales: [Codex customization](https://developers.openai.com/codex/concepts/customization), [Codex subagents](https://developers.openai.com/codex/multi-agent), [Hermes context](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files/), [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/), [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/), [OpenClaw workspace](https://docs.openclaw.ai/concepts/agent-workspace), [OpenClaw skills](https://docs.openclaw.ai/skills), [OpenClaw MCP](https://docs.openclaw.ai/tools/mcp), [Plugin format](https://developers.openai.com/plugins/build/plugins), [Desktop-only local MCP](https://developers.openai.com/plugins/deploy/desktop-only).
