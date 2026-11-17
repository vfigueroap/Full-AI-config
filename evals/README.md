# Comparar cambios entre harnesses

Los casos de cases.json contienen solicitudes, un reparto train/holdout y la ruta de responsables que se espera. Úsalos para comprobar una modificación del catálogo o un cambio de harness.

Ejecuta cada solicitud con el harness elegido y conserva su traza en un archivo privado. Exporta la observación al formato siguiente. Cada elemento representa un caso.

```json
[{
  "case_id":"documento",
  "completed":true,
  "output":"Respuesta observada del asistente",
  "delegations":[
    {"from":"coordinador","to":"investigacion"},
    {"from":"investigacion","to":"investigador"}
  ],
  "tools":[{"agent":"investigador","name":"leer_texto"}]
}]
```

Ejecuta `node scripts/evaluate.mjs TRAZAS.json`. El resultado cuenta rutas válidas, completitud declarada y herramientas autorizadas. Para evaluar la calidad del contenido, compara la respuesta con el material del caso y registra la evidencia por separado.

Guarda un commit antes del cambio, compara los mismos casos y conserva los resultados por harness y modelo. Ajusta el procedimiento que produjo el fallo observado. Comprueba el holdout antes de reemplazar una versión. Este proceso de resolver, observar, modificar y evaluar adapta la guía de evolving-ai-agents a archivos portables.
