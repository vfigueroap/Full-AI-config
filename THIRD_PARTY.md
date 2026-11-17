# Material de terceros

La licencia `LICENSE` en la raíz cubre el código propio de este repositorio. Los recursos de terceros incorporados conservan sus licencias específicas, indicadas en esta tabla y copiadas junto a los archivos cuando corresponde. Las referencias inspiran instrucciones locales; las copias de prompts no se cargan ni ejecutan como agentes del runtime.

Las rutas `research/upstream/...` de la columna de fuente identifican el clon usado para registrar origen y commit. La copia publicada contiene los archivos necesarios en `third_party`. La licencia MIT del código propio atribuye el copyright a `vfigueroap` y los recursos incorporados mantienen sus avisos específicos.

| Fuente | Commit del clon | Licencia | Archivos copiados |
| --- | --- | --- | --- |
| `research/upstream/agency-agents` | `8ae6164602c95ca78828b148b9052460ee426885` | MIT, AgentLand Contributors | `third_party/agency-agents/LICENSE`; `specialized/agents-orchestrator.md`; `finance/finance-financial-analyst.md`; `research/research-synthesist.md` |
| `research/upstream/agent_skills` | `7c6715c29548a3b39d4a9545c698ee4fd17a7213` | MIT, Jane Street Group, LLC | `third_party/agent_skills/LICENSE.md`; `socratic-tutor/SKILL.md` |
| `research/upstream/ECC` | `3f14a103a8694e51c1df9a806217a6d0b5f7a6f7` | MIT, Affaan Mustafa | `third_party/ECC/LICENSE`; `agents/planner.md`; `skills/verification-loop/SKILL.md` |
| `research/upstream/founder-skill` | `fd9385b0cfe1b96bebce3898fbd506d73eff5a9d` | MIT, Jake Schincariol | `third_party/founder-skill/LICENSE`; `unit_economics.py`; `example.json` |
| `research/upstream/agentmemory` | `54bbb7cd351e222a7e29e68b37076e97297eba6a` | Apache-2.0 | Función adaptada `third_party/agentmemory/memory-utils.mjs`. Véase `third_party/agentmemory/ORIGEN.md`. |
| `mukul975/Anthropic-Cybersecurity-Skills` | `54a798831d2266a3ca61ce68a7acb80b81160d57` | Apache-2.0 | Plantilla original de modelado de amenazas y licencia de la skill, en `third_party/cybersecurity-skills/`. |

El agente financiero ejecuta `third_party/founder-skill/unit_economics.py` con datos JSON en un directorio temporal. Se comprueban el margen por unidad y el volumen de equilibrio con el intérprete Python.

El adaptador documental invoca el módulo instalado de MarkItDown. La revisión consultada es `ed178952a6672abdfd35b5f9e76a80b6cefc086e`, de Microsoft.

## Uso local

- El orquestador de Agency Agents inspira la delegación por responsabilidad y los handoffs. Su pipeline completo presupone agentes, herramientas y QA automáticos que este CLI aún no implementa; no se copia como instrucción ejecutable.
- El analista financiero y sintetizador de investigación de Agency Agents aportan límites sobre procedencia, supuestos y cifras. Las instrucciones locales se ajustaron a los IDs, herramientas y capacidades reales de IA modular.
- El skill socrático de Jane Street inspira tutoría por pregunta y respuesta. La adaptación local excluye niveles persistentes y comandos de estado porque el runtime no guarda sesiones.
- El planificador y el ciclo de verificación de ECC informan la descomposición y la exigencia de evidencia. La verificación local nunca afirma haber ejecutado comprobaciones no realizadas.

Las copias de prompts originales quedan separadas de `agents/` y `skills/`; no deben editarse al adaptar una instrucción. Revisa este inventario si cambia el conjunto de referencias.

## Dependencias de ejecución locales

- `../third_party/founder-skill/unit_economics.py` es llamado por `integrations/api/index.mjs` con el intérprete Python configurado; su licencia MIT está en `../third_party/founder-skill/LICENSE`. No se importó su framework de agentes.
- MarkItDown no está copiado en este árbol; `integrations/api/index.mjs` invoca `python -m markitdown` si se instala por separado. La referencia revisada declara MIT. La conversión no queda disponible solo por tener el adaptador.

Las incorporaciones funcionales y sus fuentes enlazadas están en [Aportes al asistente](docs/aportes.md).
