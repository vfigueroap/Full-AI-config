# Full-AI-config

El repositorio personal de IA de Vicente. Guarda agentes, habilidades, herramientas, complementos y configuraciones en archivos propios y permite preparar una copia para Hermes, Codex, OpenClaw u otro harness.

El catálogo conserva IDs y relaciones estables. Cada adaptador prepara el formato del destino. Las diferencias de delegación, memoria y permisos quedan documentadas junto a la exportación.

## Usar el repositorio

```sh
git clone https://github.com/vfigueroap/Full-AI-config.git AI
cd AI
node scripts/validate.mjs
node ia.mjs catalogo
```

Para ejecutar los scripts necesitas Node.js 26 o posterior. Los archivos Markdown y JSON se pueden consultar y copiar directamente. El comando de validación comprueba referencias, responsables de skills y niveles de delegación.

## Preparar una exportación

Cada comando crea una carpeta nueva. Modifica las fuentes canónicas y genera una nueva exportación cuando cambies de configuración.

```sh
node scripts/export.mjs --target portable --out exports/portable
node scripts/export.mjs --target codex --out exports/codex
node scripts/export.mjs --target hermes --out exports/hermes
node scripts/export.mjs --target openclaw --out exports/openclaw
node scripts/export.mjs --target plugin --out exports/plugin
```

Consulta la guía generada para instalar el paquete en el destino. Las exportaciones conservan un manifiesto de archivos y hashes para comprobar qué versión estás trasladando. El destino determina qué controles aplica sobre delegación, herramientas y permisos.

## Organización

```text
AI/
  agents/
    orchestrator/       Coordinación general
    primary/            Responsables de dominios
    secondary/          Especialistas que aplican skills
  skills/               SKILL.md y recursos de cada habilidad
  tools/                Funciones, CLI y servidor MCP
  integrations/         Adaptadores API y cliente MCP
  workflows/            Procesos declarados por separado
  plugins/              Agrupaciones de capacidades
  registry/             Catálogos, contratos y relaciones
  config/               Configuración de ejemplo
  adapters/             Reglas y guías de cada harness
  runtime/node/         Ejecutor de referencia
  scripts/              Validación, exportación y evaluación
  evals/                Casos portables para comparar cambios
  test/                 Pruebas del código
  docs/                 Decisiones y guías
  third_party/          Recursos incorporados y procedencia
```

El orquestador delega a agentes primarios. Cada primario encarga tareas a sus secundarios. Todas las skills registradas tienen al menos un secundario responsable. La tabla completa se mantiene en [el catálogo de agentes y skills](docs/catalogo.md).

## Herramientas portables

`tools/server.mjs` ofrece las herramientas autorizadas de un secundario mediante MCP por stdio. Configura `AI_AGENT_ID` con su ID y `AI_MATERIAL_DIR` con la carpeta de material que podrá consultar. Los datos persistentes del puente van a `AI_DATA_DIR`.

`tools/run.mjs` permite invocar una herramienta desde la terminal con el agente que la tiene asignada. Las propuestas de archivos siguen el mecanismo de aprobación del runtime. Consulta las guías de adaptadores para conectar estas herramientas al harness.

El runtime opcional también puede procesar encargos, conservar memoria en SQLite y ejecutar rutinas desde un HP con Ubuntu. [Guía de ejecución continua](docs/ubuntu.md).

## Mejorar el catálogo

Añade una skill autocontenida y asígnala a un secundario. Declara el primario responsable y sus delegados. Registra los contratos de herramientas y los recursos necesarios. Valida la exportación y compara las trazas de los casos del catálogo antes de sustituir tu configuración.

```sh
node scripts/validate.mjs
node --test "test/*.test.mjs"
node scripts/evaluate.mjs TRAZAS.json
```

La prueba de economía unitaria usa Python 3. El adaptador documental requiere MarkItDown y los extras del formato que utilices. El OCR de PNG y JPEG usa Tesseract con idioma español. La configuración privada queda en variables de entorno o archivos locales excluidos de Git.

[Decisión de portabilidad](docs/decisions/0001-portabilidad.md) · [Memoria del proyecto](MEMORY.md) · [Aportes de tus favoritos](docs/aportes.md) · [Inventario de 60 repositorios](docs/favoritos.json) · [Evaluación entre harnesses](evals/README.md)
