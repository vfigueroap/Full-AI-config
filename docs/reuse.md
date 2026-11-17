# Revisión de referencias locales

Revisión de las fuentes y commits registrados en el inventario local; los clones de investigación se mantienen fuera de este repositorio. No se descargó software durante esta revisión. Las copias exactas, commits y licencias se listan en [THIRD_PARTY.md](../THIRD_PARTY.md); el resumen funcional está en [aportes.md](aportes.md).

| Archivo fuente | Qué aporta | Adaptación aplicada a instrucciones locales |
| --- | --- | --- |
| Agency Agents `specialized/agents-orchestrator.md` | Fases explícitas, handoffs y gates de calidad. | Se toma el principio de delegar con entradas y aceptación; se descartan ciclos automáticos, QA visual, reintentos y capacidades no implementadas. |
| Agency Agents `finance/finance-financial-analyst.md` | Cálculos por moneda y separar hechos de supuestos. | Reutilizado por `analista-financiero`; nombres de herramientas se ajustan a los existentes y a los contratos declarativos nuevos. |
| Agency Agents `research/research-synthesist.md` | Síntesis verificable con fuentes y límites. | `investigador` cita procedencia sin presuponer un buscador web runtime. |
| Jane Street `socratic-tutor/SKILL.md` | Tutoría interactiva por preguntas, intención explícita y comprobación de aprendizaje. | `skills/socratic-tutor/SKILL.md` está adaptada a castellano; no promete progreso persistente o sesiones largas. |
| ECC `agents/planner.md` | Planes accionables, dependencias, riesgos y criterios de aceptación. | `planificador` conserva pasos breves y observables; omite formatos largos y herramientas del host ajenas a este CLI. |
| ECC `skills/verification-loop/SKILL.md` | Verificación basada en evidencia y límites del entorno. | El revisor exige evidencia real; no se importan comandos ni pasos de build/lint/test automáticos. |
| Founder Skill `skills/founder-cfo/unit_economics.py` | Cálculo reproducible de contribución, margen, punto de equilibrio, caja, payback y escenarios. | Copia MIT invocada por `economia_unitaria({datos})`; usa solo las cifras dadas, Python estándar y entrada JSON temporal. |
| Microsoft MarkItDown | Conversión de archivos locales a Markdown. | `convertir_documento({ruta})` llama `python -m markitdown` solo si está instalado; no instala dependencias automáticamente. El acceso se limita a material explícito, rutas regulares, extensiones permitidas, 25 MiB, 30 segundos y 128 KiB de salida. |

## Alcance de los manifiestos

Los manifiestos describen agentes, skills, tools, integraciones, plugins y workflows. `tools/capacidades.mjs` conecta memoria y propuestas; `integrations/api/index.mjs` implementa HTTP GET, conversión local si MarkItDown está instalado, cálculo mediante Founder Skill y lectura limitada de recursos MCP por stdio. Las integraciones HTTP siguen apagadas por defecto. Solo consultan host configurado por operador y prefijos permitidos. Supabase usa Bearer + `apikey`, Immich `x-api-key` y Nextcloud Basic con usuario y contraseña de aplicación. Se exige HTTPS fuera de loopback; errores del proveedor no se pasan al modelo. MCP lee recursos de texto por alias explícito, no ejecuta herramientas remotas.

## Ejemplos que definen los esquemas

Los inputs pasan únicamente los campos requeridos y ningún campo adicional:

```json
{"leer_texto":{"ruta":"notas.txt"},"listar_archivos":{"ruta":""},"validar_json":{"texto":"{\"ok\":true}"},"sumar_importes":{"importes":["12000","-2500"]}}
```

```json
{"buscar_memoria":{"consulta":"decisión de arquitectura"},"guardar_memoria":{"clave":"decision-api","texto":"Se eligió HTTP por ..."},"proponer_archivo":{"ruta":"plan.md","contenido":"Borrador"},"consultar_integracion":{"integracion":"nextcloud","ruta":"remote.php/dav/files/usuario/informe.md"},"convertir_documento":{"ruta":"guia.pdf"},"economia_unitaria":{"datos":{"business":"Tienda","unit":"unidad","price":100,"variable":[{"label":"insumo","cost":60}],"fixed_monthly":[{"label":"arriendo","cost":500}],"startup":[],"days_per_month":30,"plan_per_day":20}}}
```

Los ejemplos definen la forma de llamada. El conversor y el cálculo son locales; el conversor requiere MarkItDown y dependencias opcionales según el formato. Los conectores externos requieren credenciales y configuración propias; permanecen deshabilitados en el registro.
