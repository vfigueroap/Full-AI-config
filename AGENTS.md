# Desarrollo de Full-AI-config

Lee MEMORY.md y docs/decisions/0001-portabilidad.md antes de cambiar la arquitectura.

Este repositorio es el catálogo personal portable de Vicente. Agentes, skills, herramientas, complementos, workflows y ajustes le pertenecen y se mantienen en archivos revisables. El usuario debe poder trasladarlos a Hermes, Codex, OpenClaw u otro harness conservando su trabajo.

Las definiciones canónicas están en registry y remiten a agentes y recursos en carpetas propias. Los adaptadores traducen esas definiciones al formato del destino. Los formatos particulares se generan en exports, con sus instrucciones de instalación. runtime/node es una implementación opcional que consume el mismo catálogo.

La jerarquía canónica tiene tres niveles. El orquestador delega a primarios, cada primario delega a secundarios y los secundarios aplican skills y herramientas. Toda skill registrada debe tener al menos un secundario responsable y todos los agentes deben ser alcanzables desde el orquestador. El validador y las pruebas deben detectar referencias rotas, skills huérfanas y delegaciones fuera de esos niveles.

Los recursos que una skill necesita viajan dentro de su carpeta. Los contratos de herramientas describen sus entradas y efectos. Un adaptador debe informar qué admite el destino y qué configuración requiere. Conserva el origen de las piezas adaptadas y comprueba su comportamiento al integrarlas.

Los datos privados de ejecución, credenciales y configuraciones personales activas se excluyen del control de versiones y de los paquetes exportados. Mantén las pruebas del runtime y añade comprobaciones de portabilidad cuando cambies rutas o contratos. Al finalizar actualiza MEMORY.md con decisiones, pruebas y límites comprobados.
