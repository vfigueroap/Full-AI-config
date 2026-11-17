# Memoria de diseño de AI

Este archivo conserva reglas y decisiones de producto, no memoria personal. El runtime guarda trabajos, eventos, memorias y programaciones en SQLite bajo `AI_DATA_DIR` (por defecto `AI/data/estado.sqlite`), ruta privada excluida de Git junto con WAL/SHM y artefactos.

## Reglas de memoria runtime

- Guarda solo contexto duradero y pertinente que el usuario autoriza conservar; anota fuente, tipo y fecha.
- No guardes credenciales, tokens, contraseñas ni datos personales innecesarios.
- Recupera contexto relacionado con el encargo; FTS5 es búsqueda de términos, no semántica vectorial.
- Separa preferencias del usuario, notas de agentes, documentos ingeridos y resúmenes de trabajo.
- No asumas que una tarea programada o un estado de cola prueba que se ejecutó.
- Mantén una base privada fuera de Git; respalda antes de migraciones y no copies su contenido en documentación versionada.

## Decisiones técnicas

- Agentes, skills, herramientas, integraciones y flujos canónicos: `registry/*.json`.
- La recuperación de jobs usa leases e intentos; el flujo completo puede reiniciarse sin checkpoint por subtarea.
- Las memorias tienen historial de revisiones en SQLite; guardar texto o metadata idénticos no crea una nueva revisión. `memoria historial CLAVE` lo muestra con límite.
- Las propuestas de escritura requieren aprobación explícita y solo crean archivos simples bajo `artifacts/`.
- Conectores remotos permanecen desactivados hasta que configuración, credenciales y alcance se verifiquen.
- La función temporal `supersededAt` adaptada de AgentMemory Apache-2.0 mantiene el orden de sustitución si dos escrituras caen en el mismo milisegundo; la procedencia y la licencia están en `third_party/agentmemory/`.
- MCP permite leer recursos de texto configurados por alias mediante stdio local; no invoca herramientas MCP. Voz/Agora no tienen adaptadores runtime. El worker en proceso no demuestra operación permanente sin supervisor configurado.

Para la arquitectura observable consulta [docs/architecture.md](docs/architecture.md); para fuentes y reutilización, [docs/research.md](docs/research.md) y [THIRD_PARTY.md](THIRD_PARTY.md).
