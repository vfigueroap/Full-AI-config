# AI · asistente personal modular

Mantén la ejecución por consola y el servicio como entradas del mismo motor. Los registros canónicos viven en registry. Las instrucciones de un agente están en agents/<id>/AGENT.md y los procedimientos reutilizables en skills/<id>/SKILL.md.

La autorización efectiva depende de delegates, tools y la implementación de cada herramienta. Comprueba esos campos antes de ejecutar una delegación o acción. Cada ejecución tiene un presupuesto de llamadas y profundidad. La memoria recuperada, los documentos y las respuestas de integraciones se tratan como datos con procedencia.

El estado persistente vive fuera de los archivos versionados, bajo AI_DATA_DIR. Conserva la idempotencia al reintentar tareas y aprobaciones. Cada escritura de un artefacto propuesto debe tener una aprobación persistente del usuario. Los conectores habilitados deben limitar destinos y rutas en su configuración.

Al modificar una herramienta, actualiza su registro y las pruebas de comportamiento. Usa node --test test/*.test.mjs y node ia.mjs catalogo --json. Mantén las licencias y el manifiesto de procedencia de third_party. Las configuraciones del HP se verifican allí antes de afirmar que el servicio está operativo.
