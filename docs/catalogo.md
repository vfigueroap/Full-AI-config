# Catálogo portable de agentes

Los manifiestos describen responsabilidades y capacidades de forma portable. El harness decide cómo transportar una delegación o invocar una herramienta; las instrucciones de los agentes no imponen un formato de respuesta propio de un runtime.

## Jerarquía

| Rol | ID | Responsable de | Delegaciones autorizadas |
| --- | --- | --- | --- |
| Orchestrator | `coordinador` | Asignación general, integración y respuesta final. | `personal`, `universidad`, `sistemas`, `negocios`, `investigacion` |
| Primary | `personal` | Agenda, tareas y memoria personal autorizada. | `planificador`, `memoria` |
| Primary | `universidad` | Estudio, investigación y evaluación académica. | `tutor`, `evaluador`, `investigador`, `redactor`, `revisor` |
| Primary | `sistemas` | Diagnóstico, seguridad, integraciones y adaptación de harness. | `desarrollador`, `auditor-seguridad`, `operador-integraciones`, `adaptador-harness` |
| Primary | `negocios` | Iniciativas, operaciones y economía de negocio. | `planificador`, `analista-financiero`, `investigador`, `redactor` |
| Primary | `investigacion` | Evidencia, síntesis, revisión y mejora del catálogo. | `investigador`, `redactor`, `revisor`, `arquitecto-agentes`, `evaluador-agentes`, `evolucionador-agentes` |

Todos los secundarios tienen `delegates: []`. El grafo es acíclico: el orquestador solo dirige a primarios; cada primario delega únicamente en especialistas secundarios. Los IDs originales de los especialistas se conservan para los flujos existentes.

## Especialistas secundarios y herramientas

| ID | Trabajo concreto | Herramientas registradas |
| --- | --- | --- |
| `investigador` | Reúne evidencia y procedencia. | Leer, listar, buscar memoria, convertir documento |
| `redactor` | Produce borradores respaldados. | Leer, proponer archivo |
| `revisor` | Comprueba la entrega final. | Leer, validar JSON |
| `planificador` | Desglosa tareas y prioridades. | Leer, validar JSON, buscar memoria |
| `tutor` | Enseña y guía práctica. | Leer, listar |
| `desarrollador` | Analiza software y propone cambios. | Leer, listar, validar JSON, proponer archivo |
| `analista-financiero` | Calcula presupuestos y economía unitaria. | Leer, listar, sumar importes, economía unitaria |
| `evaluador` | Aplica rúbricas académicas. | Leer, validar JSON, convertir documento |
| `memoria` | Recupera y guarda contexto autorizado. | Buscar y guardar memoria |
| `arquitecto-agentes` | Diseña responsabilidades y delegaciones. | Leer, listar, validar JSON, buscar memoria |
| `auditor-seguridad` | Elabora modelos de amenazas basados en evidencia. | Leer, listar, consultar integración, proponer archivo |
| `operador-integraciones` | Consulta conectores permitidos. | Consultar integración, validar JSON |
| `evaluador-agentes` | Compara versiones con una rúbrica previa. | Leer, listar, validar JSON, buscar memoria |
| `adaptador-harness` | Prepara mapas portables entre runtimes. | Leer, listar, validar JSON, proponer archivo |
| `evolucionador-agentes` | Corrige fallos concretos con cambios acotados. | Leer, listar, validar JSON, buscar memoria |

El catálogo registra herramientas por ID; los esquemas de entrada y la política de ejecución pertenecen al contrato del runtime y pueden variar por harness. Una herramienta declarada no demuestra que el host la ofrezca o que una integración esté autenticada.

## Skills y responsables secundarios

| Skill | Secundario responsable |
| --- | --- |
| `analisis-riesgos` | `auditor-seguridad` |
| `analista-financiero` | `analista-financiero` |
| `coordinar` | `arquitecto-agentes` |
| `daily-planning` | `planificador` |
| `desarrollador` | `desarrollador` |
| `exam-grading` | `evaluador` |
| `investigar` | `investigador` |
| `planificar` | `planificador` |
| `redactar` | `redactor` |
| `revisar` | `revisor` |
| `socratic-tutor` | `tutor` |
| `tutor` | `tutor` |
| `weekly-review` | `memoria` |
| `agent-evaluation` | `evaluador-agentes` |
| `harness-adaptation` | `adaptador-harness` |
| `agent-evolution` | `evolucionador-agentes` |

Las instrucciones detalladas de cada agente y skill se encuentran bajo `agents/<role>/<id>/AGENT.md` y `skills/<id>/SKILL.md`. Los recursos de skills, incluida la plantilla de análisis de riesgos y su licencia, también permanecen dentro de su carpeta de skill.
