# Catálogo propio y exportación a harnesses

Decisión confirmada por Vicente el 17 de noviembre de 2026.

AI conserva la fuente canónica de las capacidades que Vicente usa con modelos de lenguaje. Puede elegir un harness distinto para ejecutarlas y mantener sus archivos de trabajo.

| Parte | Responsabilidad |
| --- | --- |
| agents | Identidad, especialidad y delegación del orquestador, primarios y secundarios |
| skills | Procedimientos autocontenidos y sus recursos |
| tools | Implementaciones y puentes de invocación |
| integrations | Adaptadores de servicios y protocolos |
| workflows | Secuencias reproducibles con entradas y dependencias |
| plugins | Agrupaciones de capacidades que se pueden activar |
| registry | IDs, descripciones, contratos y relaciones |
| config | Ajustes de ejemplo sin credenciales |
| adapters | Traducciones explícitas a formatos de harness |
| runtime | Ejecución opcional del catálogo |
| tests y test | Verificación del comportamiento y de la portabilidad |

Cada exportación identifica sus archivos y qué funciones del destino quedan habilitadas. Las diferencias de permisos, memoria, delegación y herramientas se documentan en el adaptador correspondiente. Las políticas declaradas deben comprobarse en el ejecutor que las aplique.

Las adaptaciones de proyectos externos se guardan en el propio repositorio con los recursos requeridos y su procedencia. Las actualizaciones se evalúan como cambios del catálogo, con pruebas y revisión antes de sustituir una versión.
