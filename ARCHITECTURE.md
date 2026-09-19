# Arquitectura — Entorno opencode 2.x Windows publicable

## Contexto y objetivo
Entorno opencode 2.x en Windows con un único punto de verdad: un solo servidor explícito (`serve --port`) + TUI conectada (`--server`), relay móvil vía plugin `ntfy.js` y túneles ngrok como servicios Windows. Objetivo de esta iteración: publicar la configuración en GitHub de forma segura en dos ramas (`config` y `services`) sin filtrar ningún secreto (`.env`, `service.json`, `*.db`, binarios, emails/dominios reales). Este documento se sincroniza desde el código real: conexiones entre los 9 agentes del pipeline, flujo `wrapper → serve → TUI`, flujo ntfy pregunta→móvil→relay→replies, servicios nssm + requisito de 3 cuentas ngrok separadas, y ejemplos de servicios para quien clone. Este documento fija el CÓMO técnico para que `@developer` lo ejecute sin adivinar.

## Stack tecnológico y justificación
- **opencode `2.0.8` + `@opencode/plugin 2.0.8` (`package.json`, `type: module`)** — PORQUÉ: versión real instalada; el loader V2 exige `export default { id, setup }` sin imports con scope (`@opencode/plugin` no resuelve desde `plugins/`).
- **Node o Bun para plugins (`ntfy.js`, `rate-limit-guard.js`) + `node-notifier ^10.0.1`** — PORQUÉ: runtime ya requerido por opencode y por MCP Playwright; solo `node:` builtins + paquetes sin scope para no romper el loader.
- **PowerShell 5.1+/7 (`opencode-wrapper.ps1`, `hooks/tunnel/*.ps1`, `examples/nssm-register.ps1`)** — PORQUÉ: único shell nativo con `Get-NetTCPConnection` / `Stop-Service` / `Start-Service` / UAC (`-Verb RunAs`) en Windows.
- **nssm (servicios `ServidorNtfy`, `TunnelNgrokNtfy`, `TunnelNgrokOpencode`, `TunnelNgrokCuestionario`)** — PORQUÉ: los túneles deben sobrevivir al cierre de la TUI y arrancar/parar con privilegios; tareas programadas no dan control `Start/Stop-Service` tan simple.
- **ngrok (3 ficheros `ngrok-*.yml` + `ngrok.exe` en `C:/ProgramData/opencode`; 3 cuentas separadas, una por túnel)** — PORQUÉ: expone `serve`, ntfy y relay con dominios estables + `oauth`/`basic_auth`; el plan gratuito admite un túnel/agente por cuenta, de ahí una cuenta por cada uno de los 3 túneles (ver Decisiones).
- **ntfy self-host (`ntfy.exe` + `server.yml` en `C:/ProgramData/opencode`)** — PORQUÉ: push al móvil sin Firebase/APNS propios; el plugin ya publica `question/form/permission` y sirve HTML de respuesta.
- **Playwright MCP (`npx -y @playwright/mcp@latest`, `opencode.jsonc:mcp.servers.playwright`, `disabled: false`)** — PORQUÉ: contexto de navegador global para todas las sesiones; coste de contexto asumido por decisión de producto.
- **`experimental.subagent_depth: 2` (`opencode.jsonc`)** — PORQUÉ: mínimo que permite la delegación anidada `@orchestrator → @developer → (@frontend-expert + @backend-expert)`; el `subagent_depth` top-level está aceptado pero sin efecto en V2.
- **`cli.json` (keybinds `session.redo: none`, `theme.mode: dark`, `session.thinking: show`, `session.markdown: rendered`)** — PORQUÉ: hereda `tui.jsonc` V1 migrado; `redo` desactivado para control manual del rate-limit.
- **Modelo global `opencode/muse-spark-1.3-contributor-free#xhigh` + providers Antigravity (`opencode.jsonc:providers.google`)** — PORQUÉ: default real que heredan los agentes sin `model` propio en su frontmatter; variantes `low/medium/high/max` por agente/comando.

> No se propone migración de stack: el repo ya tiene stack y el README no la exige.

## Componentes y responsabilidades
### Runtime (cómo funciona todo en marcha)
| Componente | Responsabilidad única | Se comunica con |
|---|---|---|
| `opencode-wrapper.ps1` (orquestador de runtime) | Levantar 1 solo servidor explícito + TUI, garantizar puerto libre y limpieza al salir (`Stop-PortListener` + `Wait-OpenCodeServer` + `finally`) | `.env`, `hooks/tunnel/*.ps1`, `opencode serve`, `logs/wrapper_tui_stderr.log` |
| Servidor explícito `opencode serve --port $PORT` | Dueño único de sesiones y de instancias de plugins (relay ntfy) | TUI (`--server`), plugin `ntfy.js` (replies HTTP `POST /api/session/.../reply`), `OPENCODE_SERVER_USERNAME/PASSWORD` |
| TUI `opencode --server $URL` | Interfaz local; no levanta background service | Servidor explícito (`GET /api/info` con Basic para `Wait-OpenCodeServer`) |
| `plugins/ntfy.js` (`export default { id: "ntfy", setup }`) | (a) Publicar `permission.asked` / `question.asked` / `form.created` a ntfy; (b) servir relay HTTP local (`node:http createServer`) con formularios HTML para responder desde el móvil; (c) reinyectar la respuesta al servidor único | `.env` (ver Contratos), `logs/opencode_ntfy.log`, `logs/ntfy_pending.json`, `hooks/opencode_icon.png`, API ntfy, API `serve` |
| `plugins/deactivated/rate-limit-guard.js` + `hooks/deactivated/rate_limit/` | Detectar `429/quota/resource_exhausted` en eventos V2 y lanzar `rate_limit_handler.bat`; DESACTIVADO en esta iteración | `.env` (`OPENCODE_RATE_LIMIT_*`), `hooks/rate_limit/rate_limit_handler.bat` (cuando se active) |
| `hooks/tunnel/tunnel-start.ps1` / `tunnel-stop.ps1` | Arrancar/parar los 4 servicios Windows en orden (stop inverso: túneles → `ServidorNtfy`) | `nssm` + `C:/ProgramData/opencode/*.yml` |
| Servicios nssm (`ServidorNtfy`, `TunnelNgrokNtfy`, `TunnelNgrokOpencode`, `TunnelNgrokCuestionario`) | Persistencia sistema de ntfy + 3 túneles ngrok (uno por cuenta ngrok) | Binarios + `*.yml` en `C:/ProgramData/opencode` |
| `opencode.jsonc` / `cli.json` / `AGENTS.md` / `agents/` (9) / `commands/` (10) / `skills/` (8) | Configuración base versionable + pipeline de agentes (sin secretos) | Todas las sesiones opencode |
| `.env` (local, jamás versionado) / `.env.example` (plantilla pública) | Única fuente de configuración compartida wrapper ↔ plugins | Wrapper (parser `KEY=valor`, comillas, `#`) y `cfg(k,d)=process.env[k] ?? __ENV[k] ?? d` en ambos plugins |
| `examples/` (rama `services`: `server.yml`, `ngrok-opencode.yml`, `ngrok-ntfy.yml`, `ngrok-cuestionario.yml`, `nssm-register.ps1`) + `README-services.md` | Plantillas sanitizadas de `C:/ProgramData/opencode` para quien clone (solo placeholders) | `C:/ProgramData/opencode` real (copia + sustitución local), `nssm install` elevado |

### Agentes: cómo se conectan entre sí
El pipeline vive en `AGENTS.md` + `agents/*.md` y lo coordina `@orchestrator`. Nadie escribe en el fichero de otro: el único canal entre fases son los artefactos en disco.

```
tech-product (README.md)
      └─► architect (ARCHITECTURE.md)
                └─► developer (implementación principal + registro interno de cambios)
                         ├─► frontend-expert ─┐  (paralelo, delegación OBLIGATORIA de developer)
                         └─► backend-expert ──┘
                                              └─► testing-expert (suite + informe OK/ROTO)
                                                    └─► qa-reviewer (veredicto y siguientes pasos)
                                                          └─► committer (/commit o /loop autónomo)
```

| Agente | Responsabilidad única | Lee | Escribe | Se conecta con (vía orchestrator o delegación) |
|---|---|---|---|---|
| `orchestrator` (primary, `subagent: deny` salvo lista) | COORDINAR, no ejecutar: invoca por `task`, verifica cada artefacto en disco, aplica FASES 1-4 y frenos de `/loop` | Todos los artefactos | Solo `AGENTS.md` (bootstrap `/init`) + anotaciones de gestión | Invoca a `tech-product`, `architect`, `developer`, `testing-expert`, `qa-reviewer`, `committer` (solo en `/loop` autónomo) — NUNCA directo a `frontend/backend-expert` |
| `tech-product` (subagent, `subagent: deny`) | Único dueño de `README.md` (redacción, `/ideas`, retrospectivo, sincronización) | Repo real, `README.md` previo, conversación | `README.md` | Lo lee `architect`, `developer`, `testing-expert`, `qa-reviewer` |
| `architect` (subagent, `subagent: deny`) | Único dueño de `ARCHITECTURE.md` (diseño, retrospectivo, sincronización) | `README.md` + `ARCHITECTURE.md` previo + código real | `ARCHITECTURE.md` | Lo leen `developer`, expertos (vía `developer`), `testing-expert`, `qa-reviewer` |
| `developer` (subagent; único con `subagent: allow frontend-expert, backend-expert`) | Implementación principal (ETAPA A) → delegación paralela obligatoria (ETAPA B) → convergencia + registro interno de cambios (ETAPA C); en `MODO: FIX` trabaja solo | `README.md`, `ARCHITECTURE.md`, alcance (lista de siguientes pasos / prompt) | Código + registro interno de cambios | Delega EN PARALELO a `frontend-expert` + `backend-expert` con ámbitos anti-colisión; recibe remediación de `testing-expert`/`qa-reviewer` vía `orchestrator`; válvulas `REQUIERE_ARQUITECTO` / `REQUIERE_PRODUCTO` / `FUERA_DE_ALCANCE_DE_FIX` |
| `frontend-expert` (subagent, `subagent: deny`) | MODIFICAR (no solo informar) presentación/cliente: estados, a11y, consistencia, errores API, validación cliente, rendimiento | `README.md`, contratos de `ARCHITECTURE.md`, briefing de `developer` | Código cliente en su ámbito | Solo invocado por `developer`; paralelo con `backend-expert`; escala conflictos de contratos compartidos a `developer` |
| `backend-expert` (subagent, `subagent: deny`) | MODIFICAR (no solo informar) servidor/datos con la SEGURIDAD como eje (OWASP API Top 10 + `security-checker`); lee **Riesgos técnicos** primero | `ARCHITECTURE.md` (Riesgos + Contratos), briefing de `developer` | Código servidor/datos en su ámbito | Solo invocado por `developer`; paralelo con `frontend-expert`; `CONFLICTOS_ARQUITECTÓNICOS` → `developer` |
| `testing-expert` (subagent, `subagent: deny`) | ÚNICO que crea/ejecuta tests; valida el convergido final (o re-verifica tras cada fix); informe `OK/ROTO` con diagnóstico literal reutilizable | `README.md`, `ARCHITECTURE.md`, registro interno de cambios (**Puntos que testing debe verificar** primero) + diff real | Tests + informe | Invocado por `orchestrator`; su `ROTO` es el encargo literal de `developer MODO: FIX` (tope 3 intentos FASE 3); nunca corrige él mismo |
| `qa-reviewer` (subagent, `subagent: deny`) | Cierra con la lista de siguientes pasos (veredicto `LISTO` / `LISTO_CON_OBSERVACIONES` / `BLOQUEADO`); NO ejecuta tests ni bash (solo observación visual con Playwright si aporta) | `README.md`, `ARCHITECTURE.md`, registro interno de cambios, informe FINAL de `testing-expert`, lista anterior | lista de siguientes pasos (sobrescribe; viva) | Invocado por `orchestrator`; su checklist es la entrada de `/next`; su `BLOQUEADO` corregible → 1 intento `developer FIX` + re-test |
| `committer` (mode `all`, `subagent: deny`) | Convertir trabajo en commits limpios; `MODO: NORMAL` (propone y espera aprobación) vs `MODO: AUTÓNOMO` (solo `/loop`, ejecuta si limpio) | `git status/diff/log`, convenciones del repo, registro interno de cambios (coherencia en autónomo) | Commits (`git add` selectivo + `git commit`; NUNCA `push/--amend/rebase/reset --hard/tags`) | Invocado por usuario (`/commit`) o por `orchestrator` solo dentro de `/loop` |

Reglas de conexión que `@developer` no debe saltarse: `orchestrator` jamás invoca a los expertos (propiedad de `developer`); `developer` jamás toca `README.md`/`ARCHITECTURE.md` (válvula `REQUIERE_ARQUITECTO`); `testing-expert` jamás es saltado aunque el cambio parezca trivial (salvo `/fix` puro); a `qa-reviewer` nunca se le oculta un `ROTO` persistente; `committer` nunca hace `push` sin petición expresa. Comandos que arrancan el grafo: `/init` (completo), `/ideas` (conversación→cierre), `/next`/`/do` (desde checklist o prompt), `/fix` (solo `developer FIX`, sin expertos/testing/QA), `/loop` (ciclos autónomos con `/documentate`+`/commit` internos), `/status`/`/review`/`/documentate` (lectura o refresco puntual, sin iteración).

## Contratos y flujo de datos
### 1. Contrato `.env` → `.env.example` (solo KEYS, valores sanitizados)
Claves reales detectadas (19, ordenadas). `.env.example` debe contener EXACTAMENTE estas claves, cada valor un placeholder — nunca un valor real:

| KEY | Tipo | Placeholder en `.env.example` |
|---|---|---|
| `OPENCODE_SERVER_HOST` | host bind | `127.0.0.1` |
| `OPENCODE_SERVER_PORT` | puerto serve | `58941` |
| `OPENCODE_SERVER_URL` | url pública serve (vía ngrok) | `https://tu-dominio.ngrok-free.dev` |
| `OPENCODE_SERVER_USERNAME` | auth serve V2 | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | secreto | `***` |
| `OPENCODE_NTFY_URL` | url base ntfy | `https://tu-dominio-ntfy.ngrok-free.dev` |
| `OPENCODE_NTFY_TOPIC` | secreto | `***` |
| `OPENCODE_NTFY_USER` | secreto | `***` |
| `OPENCODE_NTFY_PASSWORD` | secreto | `***` |
| `OPENCODE_NTFY_RELAY_PORT` | puerto relay local | `58942` |
| `OPENCODE_NTFY_RELAY_PUBLIC_URL` | url pública relay (vía ngrok) | `https://tu-dominio-cuestionario.ngrok-free.dev` |
| `OPENCODE_NTFY_RELAY_BASIC_AUTH_USER` | secreto | `***` |
| `OPENCODE_NTFY_RELAY_BASIC_AUTH_PASS` | secreto | `***` |
| `OPENCODE_NTFY_QUESTION_TTL_MS` | entero ms | `3600000` |
| `OPENCODE_NTFY_IDLE_SUPPRESS_MS` | entero ms | `0` |
| `OPENCODE_RATE_LIMIT_COOLDOWN_MS` | entero ms (guardia desactivada) | `60000` |
| `OPENCODE_RATE_LIMIT_MAX_ATTEMPTS` | entero | `3` |
| `OPENCODE_RATE_LIMIT_RETRY_DELAY_MS` | entero ms | `5000` |
| `OPENCODE_RATE_LIMIT_ATTEMPT_TIMEOUT_MS` | entero ms | `20000` |

Reglas: parser mínimo `KEY=valor` (recorta espacios, acepta `"..."` / `'...'`, ignora `#` y líneas sin `=`). Prioridad `process.env > .env > default`. El wrapper exige `OPENCODE_SERVER_PASSWORD` no vacío y defaultea `HOST=127.0.0.1`, `PORT=58941`, `USERNAME=opencode`. `ntfy.js` defaultea todo a `""` / `0` y desactiva envío si faltan `NTFY_URL/TOPIC` (solo `warn` en log); sin `RELAY_PORT` no arranca el relay (`error`, sin eventos). OJO documentado en código: opencode ignora `OPENCODE_SERVER_USER`; la variable real es `OPENCODE_SERVER_USERNAME`. Deriva conocida (ver Riesgos): `ntfy.js` lee además `OPENCODE_NTFY_RELAY_BIND_ATTEMPTS` (default `6`) y `OPENCODE_NTFY_RELAY_BIND_RETRY_MS` (default `5000`) para reintentos de bind del relay; ninguna de las dos existe en `.env` ni en `.env.example` — funcionan por defaults sin configurar.

### 2. Contrato `service.json`
```json
{ "password": "***" }
```
Una sola key `password` (secreto del `serve --service` legacy). Jamás se versiona; el wrapper la sustituye en runtime por `OPENCODE_SERVER_USERNAME/PASSWORD` vía entorno. En repo público: no existe ni como ejemplo con valor real.

### 3. Flujo arranque/parada (wrapper → serve → TUI)
```
.env → Stop-PortListener($PORT) → `opencode service stop` (best-effort)
→ tunnel-start.ps1 (UAC) → `serve --port $PORT` (env USERNAME/PASSWORD)
→ poll GET $URL/api/info (Basic user:pw, 30 s) → TUI `opencode --server $URL`
→ al salir: Stop-PortListener($PORT) → tunnel-stop.ps1 (UAC)
```
`Wait-OpenCodeServer` es obligatoria: sin ella la TUI arranca antes que el servidor y muere con código 1. `OPENCODE_AUTO_MODE=true` solo si se pasa `--auto`. `stderr` TUI → `logs/wrapper_tui_stderr.log` (últimas 10 líneas en warning si exit ≠ 0). Detalle de implementación fijado en código: la TUI se lanza con `Start-Process … -Wait` (la espera es obligatoria — sin `-Wait` el `finally` mataría el servidor al instante); la parada vive SIEMPRE en `finally` (puerto + `tunnel-stop`), aunque la TUI falle. La TUI v2.0.8 rechaza `--username` (`Unrecognized flag`): la auth usa el usuario por defecto `opencode`.

### 4. Flujo ntfy (pregunta → móvil → relay → replies → servidor único)
```
evento V2 (permission.asked / question.asked / form.created)
→ buildNotification + POST ntfy ($NTFY_URL/$TOPIC, Basic $USER:$PASS, Tags/Action http)
→ push al móvil con `RELAY_PUBLIC_URL/question/:id | /form/:id` (+ POST directo /permission-reply)
→ móvil abre: GET|HEAD /question/:id | /form/:id (HTML sanitizado escapeHtml) o POST /permission-reply
→ móvil responde: POST /question/:id | /form/:id (respuesta) → relay reinyecta:
   POST $SERVER_INTERNAL/api/session/{sessionID}/question|permission|form/{requestID|formID}/reply
   (Basic $SERVER_USER:$SERVER_PASS, permission vía ctx.tool primero y fallback HTTP V2)
→ forget + cleanup TTL (QUESTION_TTL_MS) + persistencia logs/ntfy_pending.json
→ eventos de cierre (form.replied/cancelled, question.replied/rejected, session.idle/succeeded) limpian pendientes
```
Rutas del relay (contrato que `frontend/backend-expert` no deben romper): `GET|HEAD /question/:requestID`, `POST /question/:requestID`, `GET|HEAD /form/:formID`, `POST /form/:formID`, `POST /permission-reply`. `HEAD` existe porque las apps móviles (incluida ntfy) envían `HEAD` como preview antes de abrir el enlace. Respuestas caducadas/ya contestadas → `410 expired_or_already_answered` (TTL `OPENCODE_NTFY_QUESTION_TTL_MS`, default `3600000`); pendientes sin entrada → `404` con enlace de vuelta a la sesión. URL interna SIEMPRE `http://$HOST:$PORT` (nunca la URL pública ngrok). Seguridad por capas (fijado): el relay Node NO valida `Authorization` entrante por decisión documentada en código — la auth entrante la aplica **ngrok en el borde** vía `basic_auth` en `ngrok-cuestionario.yml` (diálogo nativo del móvil) + URLs de capacidad de un solo uso (ID impredecible + TTL/410 + olvido tras responder). Las credenciales `RELAY_BASIC_AUTH_*` solo viajan en SALIDA (headers de las acciones ntfy), nunca en querystring. Cuerpo del relay limitado a 1 MB (`payload demasiado grande`). Fix verificado iteración 2: doble-barra anti-XSS en el JS inline del cuestionario (`JSON.stringify(fieldKeys/multiKeys).replace(/</g, "\\u003c")`, líneas 481-482 de `ntfy.js`) + `escapeHtml` en todo string interpolado en `renderQuestionnaireHtml/renderFormHtml` + `toHeaderSafeString` ASCII-only en headers ntfy + `Basic` nunca en querystring.

### 5. Servicios (ServidorNtfy + 3 túneles ngrok vía nssm, relay ntfy móvil)
Orden fijado en `hooks/tunnel/*.ps1` — arranque `ServidorNtfy → TunnelNgrokNtfy → TunnelNgrokOpencode → TunnelNgrokCuestionario`; parada en inverso (`TunnelNgrokCuestionario → TunnelNgrokOpencode → TunnelNgrokNtfy → ServidorNtfy`). Ambos scripts exigen elevación (los invoca el wrapper con `-Verb RunAs`); el `start` hace `Stop-Service` previo idempotente para dejar estado conocido. Coherencia de puertos exigida entre `.env` y `C:/ProgramData/opencode`: `addr` túnel opencode = `OPENCODE_SERVER_PORT` (`58941`), `addr` túnel cuestionario = `OPENCODE_NTFY_RELAY_PORT` (`58942`), `addr` túnel ntfy = puerto de `listen-http` en `server.yml`. **Requisito de 3 cuentas ngrok separadas**: cada túnel corre como un agente ngrok propio (un servicio nssm por `*.yml`); el plan gratuito admite un túnel por cuenta, así que se necesita una cuenta (email + dominio reservado) por túnel — `ngrok-opencode.yml` (con `oauth google allow_emails`), `ngrok-ntfy.yml` (sin auth extra) y `ngrok-cuestionario.yml` (con `basic_auth usuario:password`, capa de auth entrante del relay). Los `authtoken` de cada cuenta viven solo en la máquina (nunca en el repo ni en `examples/`).

### 6. Ejemplos para quien clone (rama `services`, todo placeholders)
Borradores reales en `%TEMP%/opencode/services-draft` (pendientes de publicar como rama `services`): `README-services.md` + `examples/server.yml`, `examples/ngrok-opencode.yml`, `examples/ngrok-ntfy.yml`, `examples/ngrok-cuestionario.yml`, `examples/nssm-register.ps1`. Tabla de clonado (fijada en `README-services.md`):

| Fichero en `examples/` | Destino real | Qué sustituir |
|---|---|---|
| `examples/server.yml` | `C:/ProgramData/opencode/server.yml` | `listen-http` (`HOST:PUERTO` local), `cache-file`, `auth-default-access`, `auth-file` |
| `examples/ngrok-opencode.yml` | `C:/ProgramData/opencode/ngrok-opencode.yml` | `domain` reservado, `allow_emails` real, `addr` = `OPENCODE_SERVER_PORT` |
| `examples/ngrok-ntfy.yml` | `C:/ProgramData/opencode/ngrok-ntfy.yml` | `domain` reservado, `addr` = MISMO puerto que `listen-http` en `server.yml` |
| `examples/ngrok-cuestionario.yml` | `C:/ProgramData/opencode/ngrok-cuestionario.yml` | `domain` reservado, `basic_auth` real, `addr` = `OPENCODE_NTFY_RELAY_PORT` |
| `examples/nssm-register.ps1` | ejecutar elevado (no copiar) | nada: las rutas ya apuntan a `C:/ProgramData/opencode` |

Binarios (`ngrok.exe` ~33 MB, `ntfy.exe` ~74 MB) se descargan fuera del repo; `cache.db`/`user.db` los crea ntfy en marcha. Placeholders obligatorios en todo lo público: `***`, `tu-dominio*.ngrok-free.dev`, `tu@email.com`.

### 7. Contenido rama `config` vs rama `services`
- **Rama `config`** = espejo sanitizado de `~/.config/opencode`: `README.md`, `ARCHITECTURE.md`, `opencode.jsonc`, `cli.json`, `AGENTS.md`, `opencode-wrapper.ps1`, `plugins/ntfy.js` (sin secretos en defaults), `plugins/deactivated/rate-limit-guard.js`, `hooks/tunnel/*.ps1`, `hooks/opencode_icon.png`, `hooks/deactivated/` (mismo árbol), `agents/` (9), `commands/` (10), `skills/` (8), `.env.example` (19 keys con placeholders), `.gitignore` endurecido. NUNCA: `.env`, `service.json`, `*.db`, `*.exe`, `*.log`, `antigravity-accounts.json*`.
- **Rama `services`** = ejemplos de `C:/ProgramData/opencode` + alta nssm, todo con placeholders:
  - `examples/server.yml` (keys `listen-http`, `cache-file`, `auth-default-access`, `auth-file` → valores `***` / rutas genéricas).
  - `examples/ngrok-opencode.yml`, `ngrok-ntfy.yml`, `ngrok-cuestionario.yml` (keys `version`, `tunnels.<nombre>.proto/addr/domain`, `oauth.provider/allow_emails` o `basic_auth` → `tu-dominio.ngrok-free.dev`, `tu@email.com`, `***`).
  - `examples/nssm-register.ps1` (plantilla, ver Convenciones) + `README-services.md` (qué copiar a `C:/ProgramData/opencode`, qué binarios descargar fuera del repo).
  - NUNCA: `ngrok.exe`, `ntfy.exe`, `cache.db`, `user.db`, `*.yml` con dominios/emails reales.

## Decisiones de diseño y trade-offs
| Decisión | Alternativas descartadas | Motivo | Consecuencias |
|---|---|---|---|
| Servidor único explícito + `service stop` best-effort al arrancar | Mantener `serve --service` en paralelo / doble servidor | Dos servidores duplican instancias de plugins; la respuesta del móvil llega al servidor equivocado y se pierde (fallo observado que motiva el README) | El wrapper es punto único de fallo; si el `stop` falla se continúa igual; obliga a `Wait-OpenCodeServer` + `Stop-PortListener` + `-Wait` en la TUI |
| `.env` local + `.env.example` público (19 keys) como única verdad | Hardcodear puerto/creds en `*.ps1`/`*.js` / usar `service.json` versionado | Un solo fichero edita wrapper y plugins a la vez; permite publicar sin secretos | Parser duplicado en 3 sitios (wrapper + 2 plugins); deriva si alguien añade una key en un solo parser (caso real: `RELAY_BIND_*` solo en `ntfy.js`, ver Riesgos) |
| Plugins autocargados desde `plugins/` sin entrada en `opencode.jsonc` | Declarar plugins en `opencode.jsonc:plugins` / MCP remoto | Convención V2: todo `*.js` con `export default { id, setup }` carga solo; evita resolver `@opencode/plugin` con scope (falla con `Cannot find package`) | Solo `node:` builtins + deps sin scope; `node-notifier` + `@opencode/plugin` van en `package.json` raíz, no importados con scope desde plugins |
| Túneles como servicios nssm ordenados (`start: ServidorNtfy → 3 túneles`; `stop` inverso) | Túneles efímeros en foreground / tareas programadas / Cloudflare Tunnel | Supervivencia fuera de la TUI + `Start/Stop-Service` simple + `oauth/basic_auth` ngrok ya configurado | Requiere UAC en cada arranque/parada; 4 servicios a mantener; dominios ngrok-free rotan si no son reservados |
| 3 cuentas ngrok separadas (una por túnel) | Una sola cuenta con 3 túneles simultáneos / un solo túnel multiplexado | El plan gratuito admite un agente/túnel por cuenta; cada túnel corre como servicio nssm independiente con su propio `*.yml` y `authtoken` | 3 emails + 3 dominios reservados que mantener; `basic_auth`/`oauth` se configuran por túnel; quien clone debe crear sus 3 cuentas y reservar sus 3 dominios |
| Auth entrante del relay en el borde ngrok (`basic_auth`), no en Node | Validar `Authorization` en `relayRequestListener` | Las acciones `view` y el `fetch` del HTML inline del móvil no envían cabecera `Authorization`; exigirla en Node rompería el flujo móvil actual | El relay Node confía en ID impredecible + TTL/410; `basic_auth` en el borde es OBLIGATORIO en cuanto el relay se exponga; endurecer Node solo como defensa en profundidad futura con cambio UX coordinado |
| Dos ramas `config` / `services` en vez de monorepo con carpetas | Una sola rama con `config/` + `services/` / repo privado | `config` se clona a `~/.config/opencode` y `services` a `C:/ProgramData/opencode`; evita mezclar secretos de sistema con dotfiles y permite permisos/audiencias distintas | Hay que mantener 2 `.gitignore`/`README` coherentes; riesgo de publicar un `*.yml` real en la rama equivocada |
| Guardia rate-limit DESACTIVADA (`plugins/deactivated/`, `hooks/deactivated/`) | Activarla por defecto en iteración 1 | Sin validar contra V2 `2.0.8` (`session.retry.scheduled`, `session.step/ execution/tool.failed` 429, `session.status retry`) + handler `rotar_ip.ahk`/`rotate_ip_adb.bat` invasivo | Se conserva el código y sus 4 keys `OPENCODE_RATE_LIMIT_*`; no consume eventos hasta validación |
| Relay HTTP propio (`node:http`) con HTML inline en vez de framework | `express/fastify` / webhook externo | Cero dependencias nuevas, control total del HTML móvil (escapeHtml, `fieldset/legend`, TTL, persistencia `ntfy_pending.json`) | Más código a mano (~38 KB `ntfy.js` + fix XSS líneas 481-482); hay que auditar XSS/respuestas con lupa |
| `.gitignore` endurecido + escaneo `git log --all --full-history -- .env service.json` | `.gitignore` actual de 10 líneas | El actual no cubre `service.json`, `*.db`, `*.exe`, `*.log`, `*.yml` reales ni `antigravity-*`; esta iteración existe para cerrar esas fugas | Lista más larga que mantener; ver diseño en Convenciones |
| Pipeline con delegación anidada y artefactos como único canal (`subagent_depth: 2`, 9 agentes, 10 comandos, 8 skills) | Pipeline plano (orchestrator invoca expertos directo) / chat sin artefactos | Especialización con anti-colisión (frontend vs backend en paralelo) y memoria acumulativa (registro interno + lista de siguientes pasos); `2` es el mínimo que permite `orchestrator → developer → expertos` | `developer` es cuello de botella obligado; `orchestrator` debe verificar cada artefacto en disco; `/fix` es la única vía sin expertos/testing/QA |

## Riesgos técnicos
- **ALTA — Fuga de secretos al publicar (`.env` 19 keys con passwords/topics/tokens, `service.json:{password}`, `OPENCODE_*_PASSWORD` en entorno/logs).** `ntfy.js:logToFile(debug, evento)` y `opencode_ntfy.log` (~50 MB observado) vuelcan payloads; `wrapper_tui_stderr.log` puede ecoar la URL. Mitigación: `.gitignore` endurecido + `.env.example` solo placeholders + prohibición de `console.log(process.env)` + rotar todo secreto que haya tocado git.
- **ALTA — Dominios/emails reales en `C:/ProgramData/opencode/ngrok-*.yml` (observado: `allow_emails` con email personal, `basic_auth` con usuario real, `domain: *.ngrok-free.dev` reales).** Publicar un `*.yml` sin sanitizar doxea identidad y abre el túnel a fuerza bruta. Mitigación: en rama `services` solo `examples/` con `tu-dominio.ngrok-free.dev` / `tu@email.com` / `***`; escaneo `*.ngrok-free.dev` + `@gmail.com` debe dar 0.
- **ALTA — `defaults` con valores reales en `ntfy.js` / `rate-limit-guard.js`.** Hoy defaultean a `""`/`0` (correcto); si `@developer` pone un topic/password real como segundo arg de `cfg(k, default)` queda versionado para siempre. Mitigación: lint/grep `cfg("OPENCODE` debe mostrar siempre `""` como default; ningún literal `***` real tampoco.
- **ALTA — `user.db` / `cache.db` (`C:/ProgramData/opencode`, `cache.db` ~1.8 MB observado) + `antigravity-accounts.json*` versionados por descuido.** Contienen sesiones/tokens/cache ntfy. Mitigación: `.gitignore` explícito `*.db`, `cache-file`, `auth-file`, `antigravity-*`; en `services` solo rutas genéricas.
- **ALTA (contradicción README↔código, no resuelta aquí) — `README.md` §Alcance dice "un túnel para opencode y otro para ntfy" (2 túneles), pero el código real opera 3 túneles (`TunnelNgrokOpencode`, `TunnelNgrokNtfy`, `TunnelNgrokCuestionario`) + `ServidorNtfy` = 4 servicios.** Quien clone con solo 2 túneles deja el relay (`RELAY_PUBLIC_URL`) sin exponer y el flujo móvil no funciona. Mitigación: documentado aquí y en handoff; debe decidir el usuario si vuelve a `/ideas` (corregir README a 3 túneles) — `@architect` no lo resuelve solo.
- **MEDIA — `logs/` (`opencode_ntfy.log`, `ntfy_pending.json` con `questions/forms`, `rate_limit_handler.log`) vuelca `.env` y PII de sesiones.** `savePendingToDisk/loadPendingFromDisk` persiste IDs de sesión/preguntas. Mitigación: `logs/` entero ignorado en ambas ramas; TTL `QUESTION_TTL_MS` corto; `cleanupExpiredQuestions` siempre activo.
- **MEDIA — Condición de carrera puerto/servidor único (`Stop-PortListener` mata por `OwningProcess`, `Wait-OpenCodeServer` 30 s).** Otro proceso en el mismo puerto muere sin aviso; si el servidor tarda >30 s la TUI muere (exit 1). Mitigación: no quitar el `poll /api/info` ni el `-Wait`; documentar `PORT` libre; `tunnel-stop` siempre en `finally`.
- **MEDIA — UAC obligatoria (`-Verb RunAs` en `tunnel-start/stop`).** Sin elevación los 4 servicios no arrancan y el wrapper aborta; CI sin admin no puede probar el flujo real. Mitigación: `@testing-expert` mockea `Start-Service`; criterio de aceptación manual en máquina con admin.
- **MEDIA — XSS/inyección en HTML del relay (`renderQuestionnaireHtml/renderFormHtml`, `escapeHtml`, `relayAuthHeaders/serverAuthHeaders`).** Entradas `question.header/options`, `form.fields` vienen del modelo/atacante móvil; fix doble-barra (líneas 481-482) verificado en iteración 2 pero el JS inline sigue siendo superficie manual. Mitigación: `escapeHtml` en todo string interpolado; `toHeaderSafeString` ASCII-only en headers ntfy; `Basic` nunca en querystring; re-auditar en cada cambio del relay.
- **MEDIA — 3 cuentas ngrok: deriva de dominios/`authtoken` y caducidad del plan gratuito.** Cada cuenta tiene su email, dominio reservado y `authtoken` local; si una cuenta pierde el dominio o rota el token, solo ese túnel cae (opencode, ntfy o cuestionario) con síntoma distinto. Mitigación: tabla de qué `*.yml` corresponde a qué cuenta; tras rotar un token, re-copiar el `*.yml` real y reiniciar solo su servicio; nunca versionar `authtoken`.
- **BAJA — Deriva de parsers `.env` (3 implementaciones: wrapper + 2 plugins) + keys `OPENCODE_NTFY_RELAY_BIND_ATTEMPTS/RETRY_MS` sin entrada en `.env`/`.env.example`.** Comillas/`#`/`=` en passwords rompen un parser y no otro; las 2 keys BIND solo existen como defaults en código (`6` / `5000`). Mitigación: test único de parser con passwords con `=`, espacios y comillas; o bien añadir las 2 keys a `.env.example` (pasaría a 21) o documentar que son solo-defaults; no añadir un cuarto parser.
- **BAJA — Deriva `.gitignore`: este documento fijaba una línea `.gitignore` (auto-ignorado) que el `.gitignore` real no contiene (16 líneas reales vs 17 documentadas).** Sin esa línea, un ajuste local del `.gitignore` ensucia el diff. Mitigación: decidir (humano) si se adopta el auto-ignorado o se corrige el documento; no tocar código en esta sincronización.
- **BAJA — `ngrok.exe` (~33 MB) / `ntfy.exe` (~74 MB) + `node_modules/` colados en git.** Hinchan el repo y pueden llevar config embebida. Mitigación: ignorar `*.exe`, `node_modules/`, `package-lock.json`/`bun.lock` según decisión de ramas (ver Convenciones).

## Convenciones de proyecto
- **Estructura esperada rama `config`:** `README.md`, `ARCHITECTURE.md`, `opencode.jsonc`, `cli.json`, `AGENTS.md`, `opencode-wrapper.ps1`, `.env.example`, `.gitignore`, `plugins/ntfy.js`, `plugins/deactivated/rate-limit-guard.js`, `hooks/tunnel/tunnel-start.ps1`, `hooks/tunnel/tunnel-stop.ps1`, `hooks/opencode_icon.png`, `hooks/deactivated/rate_limit/*`, `agents/*.md` (9: `orchestrator`, `tech-product`, `architect`, `developer`, `frontend-expert`, `backend-expert`, `testing-expert`, `qa-reviewer`, `committer`), `commands/*.md` (10: `commit`, `do`, `documentate`, `fix`, `ideas`, `init`, `loop`, `next`, `review`, `status`), `skills/*/` (8: `architecture-designer`, `code-auditor`, `find-skills`, `product-brief`, `qa-release-checklist`, `security-checker`, `test-strategy`, `ui-ux-heuristics`). Sin `logs/`, sin `node_modules/`, sin `deactivate/logs/`.
- **Estructura esperada rama `services`:** `README-services.md`, `examples/server.yml`, `examples/ngrok-opencode.yml`, `examples/ngrok-ntfy.yml`, `examples/ngrok-cuestionario.yml`, `examples/nssm-register.ps1`, `.gitignore` (ignora `*.db`, `*.exe`, `*.yml` reales fuera de `examples/`).
- **Diseño `.gitignore` rama `config` (fijado):**
  ```gitignore
  node_modules/
  package.json
  package-lock.json
  bun.lock
  .env
  service.json
  *.db
  *.log
  logs/
  *.exe
  ngrok-*.yml
  server.yml
  antigravity-accounts.json
  antigravity-accounts.json.*.tmp
  antigravity-signature-cache.json
  antigravity-logs/
  .gitignore
  ```
  Nota: `package.json/lock` se ignoran porque son locales (`npm i` los regenera); si `@developer` decide versionarlos, quitar esas 3 líneas y registrarlo en el registro interno. `.gitignore` auto-ignorado para que cada máquina lo adapte sin ensuciar el diff (decisión heredada, se conserva; deriva: el `.gitignore` real aún no contiene esa línea — ver Riesgos).
- **Diseño `.gitignore` rama `services` (fijado):** `*.db`, `*.exe`, `ngrok.exe`, `ntfy.exe`, `cache.db`, `user.db`, `server.yml`, `ngrok-*.yml` (solo `examples/` se versiona), `*.log`.
- **Diseño `examples/nssm-register.ps1` (plantilla con placeholders, fijado):**
  ```powershell
  nssm install ServidorNtfy "C:\ProgramData\opencode\ntfy.exe" "serve --config C:\ProgramData\opencode\server.yml"
  nssm install TunnelNgrokOpencode "C:\ProgramData\opencode\ngrok.exe" "start --config C:\ProgramData\opencode\ngrok-opencode.yml opencode-tunnel"
  nssm install TunnelNgrokNtfy "C:\ProgramData\opencode\ngrok.exe" "start --config C:\ProgramData\opencode\ngrok-ntfy.yml ntfy-tunnel"
  nssm install TunnelNgrokCuestionario "C:\ProgramData\opencode\ngrok.exe" "start --config C:\ProgramData\opencode\ngrok-cuestionario.yml cuestionario-tunnel"
  # Dominios/emails reales NUNCA aquí: ver examples/ngrok-*.yml con tu-dominio.ngrok-free.dev y tu@email.com
  ```
- **Patrones a seguir:** `export default { id, setup }` en plugins; `cfg(k,"")` con default vacío; `escapeHtml` en todo HTML del relay + `replace(/</g, "\\u003c")` en JS inline serializado; `Basic` en headers, nunca en URL; `Stop-Service`/`Start-Service` por nombre exacto (`ServidorNtfy`, `TunnelNgrokNtfy`, `TunnelNgrokOpencode`, `TunnelNgrokCuestionario`); arranque `ServidorNtfy → 3 túneles`, parada inversa; placeholders `***`, `tu-dominio*.ngrok-free.dev`, `tu@email.com` en todo lo público; artefactos como único canal entre agentes (nunca fiarse solo del texto de respuesta).
- **Patrones a evitar:** importar `@opencode/plugin` con scope desde `plugins/`; añadir dependencias con scope; poner secretos en defaults de `cfg()`; loguear `process.env` / `__ENV` / eventos completos en `info`; versionar `.env`, `service.json`, `*.db`, `*.exe`, `*.log`, `*.yml` reales; activar la guardia rate-limit fuera de `deactivated/` sin validación; invocar a `frontend/backend-expert` desde `orchestrator`; tocar `README.md`/`ARCHITECTURE.md` desde `developer`; endurecer auth entrante en Node sin coordinar el cambio UX móvil.

## Plan de implementación sugerido
1. Endurecer `.gitignore` (`config` y plantilla `services`) + verificar `git status --ignored` no muestra `.env`/`service.json`/`*.db`/`*.log`/`*.exe`.
2. Crear `.env.example` con las 19 keys y placeholders de Contratos §1; borrar cualquier `.env` con valores reales del índice si ya entró. (Hecho en iteración 2; en esta sincronización solo re-verificar.)
3. Auditar `plugins/ntfy.js`: confirmar defaults `""`/`0`, `escapeHtml` en las 3 rutas HTML, fix doble-barra líneas 481-482, `Basic` solo en headers, `OPENCODE_SERVER_INTERNAL` siempre `http://HOST:PORT`; decidir destino de `RELAY_BIND_*` (añadir a `.env.example` o fijar como solo-defaults).
4. Congelar `plugins/deactivated/rate-limit-guard.js` + `hooks/deactivated/rate_limit/` (sin mover a activo); documentar keys `OPENCODE_RATE_LIMIT_*` en `.env.example` aunque estén desactivadas.
5. Publicar `examples/` rama `services` desde `%TEMP%/opencode/services-draft`: `server.yml` + 3 `ngrok-*.yml` sanitizados + `nssm-register.ps1` + `README-services.md` con placeholders; comprobar que el escaneo de dominios/emails solo devuelve `tu-dominio*` / `tu@email.com`.
6. Corregir con decisión humana la contradicción de los 2 túneles del README (llevarlo a 3 + `ServidorNtfy`) y la deriva de la línea `.gitignore` auto-ignorado.
7. Escaneo final pre-push: `git log --all --full-history -- .env service.json` vacío + `grep -rE "\*\*\*|tu-dominio|tu@email" ` coherente + 0 dominios/emails reales; `opencode-wrapper.ps1 -WhatIf` / arranque manual verifica `GET /api/info 200` y `Stop-PortListener` en `finally`.
8. Inicializar git local + crear ramas `config`/`services` con contenidos disjuntos (§7); NO automatizado en este diseño — lo ejecuta `@developer` con aprobación humana.

## Criterios de aceptación técnicos
- [ ] `git log --all --full-history -- .env service.json` devuelve vacío; `git ls-files | grep -E "\.env$|service\.json|\.db$|\.exe$|\.log$|ngrok-.*\.yml$|server\.yml$"` devuelve vacío en ambas ramas.
- [ ] `grep -rE "[a-z0-9-]+\.ngrok-free\.dev" --exclude="*.log"` solo matchea `tu-dominio*.ngrok-free.dev`; `grep -rE "[a-zA-Z0-9._%+-]+@[a-z]+\.[a-z]+" --include="*.yml" --include="*.example"` solo matchea `tu@email.com`.
- [ ] `grep -r "cfg(\"OPENCODE" plugins/` muestra defaults `""` o `0`; ningún literal de topic/password/dominio real en `*.js`/`*.ps1`/`*.bat`.
- [ ] `.env.example` tiene las 19 keys de Contratos §1 (diff de keys contra `.env` local = 0, diff de valores ≠ 0).
- [ ] En máquina con admin: `opencode-wrapper.ps1` levanta 1 solo `serve` en `$PORT` (`GET /api/info` 200 con Basic), la TUI conecta con `--server`, y al salir `Get-NetTCPConnection -LocalPort $PORT` queda vacío + los 4 servicios en `Stopped`.
- [ ] Con servicios en marcha: pregunta de prueba → push ntfy al móvil → respuesta desde `RELAY_PUBLIC_URL/question/:id` → `POST /api/session/.../reply` 200 y `ntfy_pending.json` vuelve a `{"questions":[],"forms":[]}` tras TTL/cierre.
- [ ] `node --check plugins/ntfy.js` y `node --check plugins/deactivated/rate-limit-guard.js` OK; `powershell -NoProfile -Command "Get-Content opencode-wrapper.ps1 | Out-Null"` sin errores de sintaxis.
- [ ] Los 3 túneles ngrok levantan cada uno con su cuenta (`ServidorNtfy → TunnelNgrokNtfy → TunnelNgrokOpencode → TunnelNgrokCuestionario` en `Running`); `addr` de cada `ngrok-*.yml` coincide con su puerto (`OPENCODE_SERVER_PORT` / `listen-http` / `OPENCODE_NTFY_RELAY_PORT`).
- [ ] `examples/` + `README-services.md` publicados en rama `services` solo con placeholders (`***`, `tu-dominio*.ngrok-free.dev`, `tu@email.com`); quien clone puede copiar a `C:/ProgramData/opencode`, registrar con `nssm-register.ps1` elevado y arrancar sin encontrar ningún secreto real.
