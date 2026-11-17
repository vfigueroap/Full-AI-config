# Memoria del repositorio de IA

## Intención de Vicente

El 17 de noviembre de 2026 Vicente precisó que AI debe ser su repositorio personal de configuraciones y capacidades de IA. Quiere conservar sus agentes, skills, herramientas, complementos y ajustes en archivos propios y exportarlos libremente al harness que prefiera. Citó Hermes, Codex y OpenClaw como posibles destinos. La facilidad de cambiar de software es un requisito del producto.

El destino de publicación autorizado es https://github.com/vfigueroap/Full-AI-config.git. Se publica el contenido de AI. El directorio padre contiene el agente de desarrollo, material del chat y clones de investigación.

## Decisiones

- registry cataloga definiciones propias con IDs estables y referencias relativas.
- agents/orchestrator, agents/primary y agents/secondary representan niveles de delegación que se validan.
- Cada skill tiene responsables secundarios. Los recursos asociados se mantienen dentro de su carpeta para permitir copiarla de forma independiente.
- tools, integrations, workflows, plugins y config reúnen capacidades de esas categorías.
- adapters y scripts/export.mjs generan formatos de destino revisables.
- runtime/node conserva el asistente ejecutable construido antes de esta aclaración como consumidor del catálogo.
- Los 60 favoritos de GitHub se clonaron en research/upstream del directorio padre. El inventario portable está en docs/favoritos.json. Se reutilizan implementaciones, procedimientos y diseños según su utilidad, conservando su procedencia.
- Los modelos económicos realizan tareas acotadas y el coordinador concentra decisiones e integración.

## Continuidad

Retoma desde docs/decisions/0001-portabilidad.md, registry y los adaptadores. Una capacidad nueva requiere una definición, un responsable y una forma clara de exportarla. La memoria personal de ejecución está en AI_DATA_DIR, separada de esta memoria de desarrollo.

## Verificación del 17 de noviembre de 2026

La versión 0.3.0 contiene 1 orquestador, 5 primarios, 15 secundarios, 16 skills, 10 herramientas, 11 workflows y 2 complementos. Todos los agentes son alcanzables y todas las skills tienen responsables secundarios.

Pasaron 53 pruebas del código y el validador de las 16 skills. Las pruebas incluyen MCP por stdio, la CLI ejecutada desde una exportación, persistencia tras reinicio, delegación permitida, aprobaciones y exclusión de rutas privadas. La revisión independiente corrigió la ausencia de la CLI en los paquetes y los nombres de archivos indicados en sus manuales.

Hay exportadores para portable, Codex, Hermes, OpenClaw y Agent Plugins 1.0.0. Las rutas MCP de los ejemplos se completan al instalar cada copia. Los modelos y políticas nativas del harness se configuran en el destino. Las pruebas usaron proveedores HTTP simulados y ejecutaron el cálculo Python incorporado. Quedan pendientes las pruebas con modelos reales, la carga en cada harness y la ejecución continua en el HP Ubuntu. MarkItDown y Tesseract son dependencias opcionales que deben instalarse para sus formatos.
