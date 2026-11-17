# Revisión del inventario y fuentes

## Catálogo local de estrellas

El inventario local reúne 60 repositorios; el catálogo portable incluido aquí es [favoritos.json](favoritos.json). Los clones fuente se conservan fuera de este repositorio y no se requieren para usar o exportar el catálogo. Nueve fuentes aportan implementaciones, plantillas, procedimientos o diseños. [Aportes al asistente](aportes.md) identifica cada uso y [THIRD_PARTY.md](../THIRD_PARTY.md) registra los archivos incorporados, commits y licencias. El análisis no implica auditoría completa de código ni prueba de ejecución.

| Repositorio clonado | Uso revisado en este proyecto | Decisión y límite |
| --- | --- | --- |
| `agency-agents` (MIT) | Referencias de orquestación, finanzas e investigación. | Se copiaron tres prompts con licencia íntegra; adaptación y commits en `THIRD_PARTY.md`. |
| `agent_skills` (MIT) | Skill de tutoría socrática de Jane Street. | Se copió una referencia y se adaptó la skill local; el estado de aprendizaje no persiste entre sesiones. |
| `ECC` (MIT) | Planificación y verificación. | Se copiaron planner y verification-loop como referencias; no se importaron comandos/harness de Claude Code. |
| `agentmemory` (Apache-2.0) | Referencia para búsqueda de memoria y versionado/procedencia. | No se instaló. Se adaptó solo `supersededAt()` para ordenar versiones previas incluso ante escrituras en el mismo milisegundo; historial y migración son implementación propia en SQLite. No se importó su backend, indexador, embeddings ni snapshots Git. Véase `third_party/agentmemory/ORIGEN.md` y la licencia íntegra. |
| `founder-skill` (MIT) | Guía y calculadora de economía unitaria. | Archivos necesarios copiados a `../third_party/founder-skill/` con licencia y commit registrados en `THIRD_PARTY.md`; `integrations/api/index.mjs` invoca `unit_economics.py` con Python si está disponible. No es servicio residente ni asesoría financiera. |
| `markitdown` (MIT) | Conversión local de documentos a Markdown. | No está incluido como código en este repositorio. El adaptador ejecuta `python -m markitdown` si se instala por separado. No se instala automáticamente. Su README advierte que accede a recursos con permisos del proceso. |

El inventario incluye proyectos con licencias distintas y entradas sin licencia declarada. No se incorporaron automáticamente al runtime solo por su popularidad. La selección priorizó lo que los módulos actuales llaman o lo que se adaptó explícitamente.

## Fuentes de concepto y demostraciones

- [Medium: “How to start building your own Jarvis (almost everyone does it wrong)”](https://kalashnikovisme.medium.com/how-to-start-building-your-own-jarvis-almost-everyone-does-it-wrong-daac4a9ee1fe): referencia conceptual para capturar procesos, contexto y acciones; voz queda como dirección futura, no capacidad actual.
- [YouTube: `hhym040zsBI`](https://www.youtube.com/watch?v=hhym040zsBI) y [YouTube: `aooylKf-PeA`](https://www.youtube.com/watch?v=aooylKf-PeA): demos asociadas a transcripciones de investigación sobre Agora/MCP y ADA con Gemini, Whisper y ElevenLabs. El material transcrito se mantiene fuera del repositorio portable. Estas fuentes sirven como ideas de interfaz y flujo, no como implementación ni verificación de servicios.

No hay entrada de audio/micrófono, ASR, TTS o llamada Agora en el runtime. Sí existe un adaptador MCP local de solo lectura para recursos de texto por alias permitido; no ejecuta herramientas remotas. Tampoco se infiere actividad continua o disponibilidad 24/7 a partir de una demo o de la existencia de un worker.

## Estado de evidencia

Las observaciones de arquitectura proceden de lectura de `runtime/node`, `ia.mjs`, registros y documentación. El inventario de favoritos está incluido en este repositorio; sus clones fuente quedan fuera. La fecha/contador de estrellas no se refrescó en la web. No se ejecutó una configuración real de Ubuntu, systemd, proveedor LLM ni credenciales de integraciones como parte de esta revisión documental.
