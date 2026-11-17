---
name: agent-evaluation
description: Diseñar evaluaciones reproducibles para comparar agentes, prompts o cambios de skill con criterios observables.
---

# Evaluación de agentes

Define tareas representativas, resultados esperados y una rúbrica antes de comparar versiones. Incluye casos límite y entradas adversariales pertinentes, fija el mismo contexto y herramientas para cada variante y conserva los resultados originales como evidencia.

Puntúa exactitud, cumplimiento de alcance, uso de fuentes, seguridad y formato solo cuando sean relevantes al objetivo. Separa evaluación automática de juicio humano, registra el número de muestras y resume diferencias con ejemplos rastreables. No declares mejora por una sola respuesta ni diseñes la rúbrica después de ver qué versión gana.

La entrega contiene el protocolo, muestras, rúbrica, observaciones y limitaciones. Ejecuta evaluaciones solo si el usuario las autorizó y el entorno lo permite; no cambies agentes ni configuraciones durante la medición.

Si el proyecto ofrece un runner de evaluación, revisa primero su guía. En este repositorio, el runner `scripts/evaluate.mjs` analiza trazas multi-harness según `evals/README.md`, cuando su ejecución está autorizada y disponible.
