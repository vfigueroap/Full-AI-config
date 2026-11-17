# Flujo Consejo

Consejo obtiene dos perspectivas independientes sobre el mismo objetivo: `investigador` revisa evidencia y `planificador` analiza criterios, alternativas y riesgos. Ambos reciben el objetivo original sin resultados del otro. `revisor` recibe las respuestas bajo las etiquetas **Propuesta A** y **Propuesta B**, compara sus argumentos y produce una síntesis propia.

Las etiquetas cambian las claves que acompañan las respuestas; no eliminan señales de autoría que puedan aparecer dentro del texto. El revisor no debe inferir ni atribuir autores. La síntesis debe conservar desacuerdos e incertidumbres cuando la evidencia no permita resolverlos.

## Evidencia de diseño

La idea general se inspira en las etapas de opiniones iniciales, revisión cruzada y respuesta final descritas en [LLM Council, README en el commit `92e1fcc`](https://github.com/karpathy/llm-council/blob/92e1fccb1bdcf1bab7221aa9ed90f9dc72529131/README.md#L9-L15). El repositorio no declara licencia; se tomó como referencia conceptual y no se copiaron código, prompts ni interfaz.

## Uso

Selecciona el flujo `consejo` al crear un trabajo. El complemento añade configuración al catálogo existente y reutiliza los agentes y permisos ya definidos; no instala herramientas ni habilita accesos externos.
