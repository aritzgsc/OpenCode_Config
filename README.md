# Entorno opencode 2.x (Windows)

## Problema
Trabajar con opencode en Windows con un único punto de verdad es frágil por defecto: si se mezclan el background service (`serve --service`) y un servidor explícito (`serve --port`), los plugins se instancian dos veces y las respuestas remotas (por ejemplo, desde el móvil) pueden llegar al servidor equivocado y perderse. Además, exponer el servidor y las notificaciones a internet exige túneles, credenciales y servicios del sistema que no deben filtrarse nunca a un repositorio público. Sin una configuración compartida y sanitizada, cada máquina se configura a mano y publicar esa configuración en GitHub es un riesgo de fuga de secretos.

## Usuarios y casos de uso
- **Desarrollador/a en Windows (usuario principal):** arranca todo el entorno con un solo comando (`opencode-wrapper.ps1`), que levanta los túneles, un único servidor explícito y la TUI conectada con `--server`. Trabaja en cualquier proyecto con el pipeline de agentes (`/init`, `/ideas`, `/status`, `/review`, `/documentate`).
- **Desarrollador/a en movilidad:** recibe una notificación ntfy en el móvil cuando opencode le hace una pregunta, y responde desde el móvil; el relay del plugin `ntfy.js` la entrega al servidor explícito de su máquina.
- **Persona que clona el repo (configuración inicial):** copia `.env.example` a `.env` y los ejemplos de `examples/` (rama `services`) a `C:/ProgramData/opencode` con sus valores reales locales, da de alta los 4 servicios Windows con `nssm-register.ps1` y arranca con `opencode-wrapper.ps1`. No necesita adivinar puertos, rutas ni orden de servicios: el README y los ejemplos le dicen qué sustituir en cada fichero.

## Alcance de esta iteración
### Entra
- Servidor único explícito: `opencode-wrapper.ps1` levanta `serve --port ...` y la TUI con `--server ...`; detiene el background service previo para evitar duplicados. Al salir, detiene servidor y túneles (bloque `finally`).
- Configuración compartida vía `.env` local (puerto, usuario/password del servidor, ntfy, relay, rate-limit) con plantilla pública `.env.example` (19 claves) con placeholders.
- Relay ntfy (`plugins/ntfy.js`): notifica preguntas al móvil y expone un endpoint local (`OPENCODE_NTFY_RELAY_PORT`) con páginas de respuesta de un solo uso (`/question/:id`, `/form/:id`, TTL `OPENCODE_NTFY_QUESTION_TTL_MS`, olvido tras responder). Persistencia de pendientes en `logs/ntfy_pending.json`, log en `logs/opencode_ntfy.log`.
- Guardia rate-limit (`plugins/deactivated/rate-limit-guard.js` + `hooks/deactivated/rate_limit/`): detecta 429/cuota y ejecuta la acción correctora; desactivada por defecto en esta iteración.
- Servicios Windows (nssm, 4 servicios): `ServidorNtfy` (binario `ntfy.exe` self-host con `server.yml`) + 3 túneles ngrok independientes (`TunnelNgrokOpencode`, `TunnelNgrokNtfy`, `TunnelNgrokCuestionario`), uno por dominio reservado. Arranque con `hooks/tunnel/tunnel-start.ps1` (orden: `ServidorNtfy` → `TunnelNgrokNtfy` → `TunnelNgrokOpencode` → `TunnelNgrokCuestionario`), parada inversa con `tunnel-stop.ps1`.
- Qué expone cada túnel (a nivel producto): `ngrok-opencode.yml` publica el servidor explícito (auth OAuth Google por email); `ngrok-ntfy.yml` publica el servidor ntfy self-host (mismo puerto que `listen-http` en `server.yml`); `ngrok-cuestionario.yml` publica el relay de preguntas/respuestas (auth en el borde vía `basic_auth` de ngrok, obligatoria al exponer el relay).
- Coherencia de puertos exigida y documentada: `addr` del túnel opencode = `OPENCODE_SERVER_PORT`; `addr` del túnel cuestionario = `OPENCODE_NTFY_RELAY_PORT`; `addr` del túnel ntfy = puerto de `listen-http` en `server.yml`.
- Configuración base versionada y sanitizada: `opencode.jsonc` (modelo por defecto, `experimental.subagent_depth: 2`, MCP Playwright), `cli.json` (keybinds, tema, sesión), `AGENTS.md` (pipeline de agentes), `agents/` (9 ficheros), `commands/` (10), `skills/` (8).
- Servicios del sistema documentados con ejemplos sanitizados: lo que vive en `C:/ProgramData/opencode` (`server.yml`, `ngrok-*.yml`, binarios `ngrok.exe`/`ntfy.exe`, `cache.db`/`user.db`) se publica solo como ejemplo con placeholders, nunca con valores reales.
- Estrategia de ramas: `config` para la configuración sanitizada de `~/.config/opencode` (+ `.env.example`), `services` para los ejemplos de `C:/ProgramData/opencode` (`examples/server.yml`, `examples/ngrok-*.yml`) + instalación nssm (`examples/nssm-register.ps1`, ejecutar elevado una sola vez) + `README-services.md` (tabla qué copiar a dónde y qué sustituir).

### No entra (explícito)
- Valores reales de `.env` ni de `service.json` (passwords, tokens, topics ntfy, URLs ngrok reales, emails personales): nunca se versionan ni se pegan en el README. Tampoco dominios `*.ngrok-free.dev` reales ni `basic_auth` real en los ejemplos: solo `tu-dominio*.ngrok-free.dev`, `tu@email.com`, `***`.
- Ficheros reales de `C:/ProgramData/opencode` (`server.yml`, `ngrok-*.yml` con valores), binarios ni bases de datos reales (`ngrok.exe`, `ntfy.exe`, `cache.db`, `user.db`).
- Activación por defecto de la guardia rate-limit (queda en `plugins/deactivated/` y `hooks/deactivated/` hasta validarla).
- Soporte para macOS/Linux (rutas, wrapper y servicios descritos aquí son Windows).
- Cambios de producto sobre los agentes o comandos: solo se documenta lo que ya existe.

## Criterios de éxito
- Una persona que clona el repo entiende en menos de 5 minutos qué instala, qué copia como `.env` y qué comando arranca el entorno, sin encontrar ningún secreto real en el repo.
- Esa misma persona sabe configurar los servicios: qué ejemplo copiar a `C:/ProgramData/opencode`, qué placeholder sustituir en cada uno (tabla en `README-services.md`) y que debe ejecutar `nssm-register.ps1` elevado una sola vez.
- `git log --all --full-history -- .env service.json` no devuelve ningún fichero de secretos, y un escaneo de `***`, tokens o URLs `*.ngrok-free.dev` reales da cero resultados.
- Arrancar `opencode-wrapper.ps1` en una máquina configurada levanta un solo servidor en el puerto de `.env` y la TUI se conecta sin error; al salir, puerto y túneles quedan detenidos.
- Recibir y responder una pregunta de opencode desde el móvil funciona cuando los servicios ntfy/ngrok están en marcha.

## Restricciones conocidas
- Solo Windows: wrapper en PowerShell, servicios Windows con nssm, rutas `~/.config/opencode` y `C:/ProgramData/opencode`.
- Requisitos: Windows con PowerShell; Node o Bun para plugins; opencode `2.0.8` (`@opencode/plugin 2.0.8`); nssm para los 4 servicios; **3 cuentas ngrok separadas** (una por túnel: opencode, ntfy y cuestionario, cada una con su dominio reservado `tu-dominio*.ngrok-free.dev`); servidor ntfy self-host (`ntfy.exe` + `server.yml`); Playwright MCP (`npx -y @playwright/mcp@latest`); cuenta Google para el OAuth del túnel opencode (`allow_emails`).
- El arranque/parada de túneles requiere elevación de administrador (UAC): el wrapper invoca `tunnel-start.ps1`/`tunnel-stop.ps1` con `-Verb RunAs`; sin admin aborta. El alta inicial con `nssm-register.ps1` también exige PowerShell elevado.
- Lo público debe usar placeholders: `***` para secretos, `tu-dominio*.ngrok-free.dev` para dominios, `tu@email.com` para emails. Nunca `.env` real, solo `.env.example`; nunca `*.yml` reales de `C:/ProgramData/opencode`, solo `examples/`.
- `.env`, `service.json`, `logs/`, binarios (`*.exe`) y bases de datos (`*.db`) están ignorados y nunca se versionan.

## Supuestos
- El lector parte de una instalación funcional (Node/Bun, opencode 2.0.8, nssm, ngrok, ntfy) o la instala siguiendo la guía de la rama correspondiente; este README no es un instalador paso a paso.
- `.env.example` existe en la rama `config` con todas las claves necesarias (`OPENCODE_SERVER_HOST/PORT/USERNAME/PASSWORD`, `OPENCODE_NTFY_URL/TOPIC/USER/PASSWORD`, `OPENCODE_NTFY_RELAY_PORT/PUBLIC_URL/BASIC_AUTH_*`, `OPENCODE_NTFY_QUESTION_TTL_MS`, `OPENCODE_RATE_LIMIT_*`, etc.) y cada valor es un placeholder.
- La rama `services` contiene ejemplos de `server.yml` y `ngrok-*.yml` con placeholders, `nssm-register.ps1` y `README-services.md` con la tabla de correspondencia ejemplo → destino real; los comandos nssm no contienen credenciales reales.
- La guardia rate-limit sigue desactivada hasta que se valide su comportamiento en la versión 2.x actual.
