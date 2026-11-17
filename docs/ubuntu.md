# Ejecutar el catálogo con Node en Ubuntu

El runtime opcional lee las mismas definiciones que los adaptadores. Necesita un modelo configurado por el usuario.

## Empezar en Ubuntu

Necesitas Git, Node.js 26 o posterior y un servidor de modelos compatible con Chat Completions que devuelva JSON. El núcleo usa la biblioteca estándar de Node y SQLite con FTS5. Python 3 solo se utiliza en las herramientas opcionales de economía y documentos.

1. Clona el repositorio portable en `~/AI`: `git clone https://github.com/vfigueroap/Full-AI-config.git ~/AI`.
2. Entra en `~/AI`, ejecuta `node --version` y `node ia.mjs catalogo`. La consulta del catálogo funciona sin modelo.
3. Ejecuta `cp .env.example .env && chmod 600 .env`. Edita `.env` y configura `LLM_BASE_URL` y `LLM_MODEL` con el endpoint y el identificador exacto del modelo de especialistas. Para dar al coordinador principal otro modelo, define `LLM_COORDINATOR_MODEL`. Un servidor remoto con clave requiere HTTPS. Usa `LLM_API_KEY` si el proveedor lo exige.
4. Genera un token con `openssl rand -hex 32` y guarda ese valor en `AI_API_TOKEN`. Para que el asistente consulte tus documentos, indica una carpeta dedicada en `AI_MATERIAL_DIR`.
5. Ejecuta `node ia.mjs servir`. En otra terminal, desde la misma copia del repositorio, envía tu primera petición.

```sh
node ia.mjs pedir "Organiza mi semana. Estudio cálculo el martes y entrego el informe el viernes."
node ia.mjs trabajos
node ia.mjs trabajos ID_DEL_ENCARGO
```

El último comando muestra la respuesta, el estado y los agentes que intervinieron. Para preparar archivos, pide un nombre sencillo, por ejemplo `plan-semanal.md`. Revisa la ruta y el contenido con `node ia.mjs aprobaciones` y ejecuta `node ia.mjs aprobar ID` o `node ia.mjs rechazar ID`. Los archivos aprobados se crean dentro de `data/artifacts/`. Un contenido distinto conserva el archivo anterior y produce un error de conflicto.

## Servicio al arrancar el HP

La unidad incluida espera la copia en `~/AI`. Comprueba que el gestor de servicios del usuario encuentre Node 26. Si usas un gestor de versiones, sustituye `/usr/bin/env node` en la unidad instalada por la ruta absoluta que devuelve `command -v node`. Detén la instancia manual antes de iniciar el servicio.

```sh
mkdir -p ~/.config/systemd/user
cp deploy/ai.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ai.service
systemctl --user status ai.service
journalctl --user -u ai.service -n 30
```

Para mantener el servicio después de cerrar sesión y arrancarlo durante el inicio de Ubuntu, habilita la persistencia del gestor del usuario con `loginctl enable-linger "$USER"`. El servidor del modelo también debe estar disponible. Un encargo que estaba en ejecución cuando el proceso se interrumpió vuelve a estar disponible al vencer su reserva, de hasta cinco minutos. El motor limita a tres las recuperaciones por intentos totales. Un fallo normal del proveedor queda registrado y se puede volver a enviar como un nuevo encargo.

## Memoria y rutinas

```sh
node ia.mjs memoria guardar idioma "Prefiero las respuestas en español."
node ia.mjs ingerir rubrica.md --material /ruta/a/material
node ia.mjs memoria buscar "rúbrica"
node ia.mjs memoria historial usuario:idioma
node ia.mjs memoria olvidar usuario:idioma
node ia.mjs programar revision "Prepara mi revisión semanal" --flujo weekly-review --cada 604800
node ia.mjs programaciones
node ia.mjs desprogramar revision
```

Las rutinas usan intervalos en segundos. El primer turno vence al registrarlas. La API admite el campo `proxima` como instante Unix en milisegundos para fijar el inicio. Tras una desconexión, el worker encola una sola ejecución atrasada y avanza a la siguiente fecha. La búsqueda de documentos usa texto con procedencia y coincidencia léxica. El servicio envía al modelo el contexto recuperado y el material solicitado. El archivo opcional `config/settings.json` permite ajustar el idioma y la zona horaria a partir de `config/settings.example.json`. El almacenamiento privado reside en `AI_DATA_DIR` y se excluye de Git. Para hacer una copia en reposo, detén el servicio, copia el directorio completo y vuelve a iniciarlo.

## API para automatizar

El servicio escucha de forma predeterminada en `127.0.0.1:8787`. Desde otro equipo puedes usar `ssh -L 8787:127.0.0.1:8787 usuario@tu-hp`. Usa el valor de `AI_API_TOKEN` en la cabecera de todas las peticiones.

```sh
curl -H "Authorization: Bearer $AI_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"objetivo":"Prepara mi revisión semanal","flujo":"weekly-review","idempotencyKey":"semana-47"}' \
  http://127.0.0.1:8787/jobs
```

| Operación | Solicitud |
| --- | --- |
| Comprobar el servicio | `GET /health` |
| Encolar y consultar | `POST /jobs`, `GET /jobs`, `GET /jobs/ID` |
| Revisar y resolver una propuesta | `GET /approvals`, `POST /approvals/ID` con `{"decision":"approve"}` o `{"decision":"reject"}` |
| Consultar o añadir memoria | `GET /memory?q=examen`, `POST /memory` con `{"clave":"idioma","texto":"Español"}` |
| Programar un encargo | `POST /schedules` con `id`, `objetivo`, `cadaSegundos` y opcionalmente `flujo` y `proxima` |
| Consultar rutinas | `GET /schedules` |
