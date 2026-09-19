# Rama `services` — ejemplos de `C:/ProgramData/opencode` + alta nssm

Borradores sanitizados de lo que vive en `C:/ProgramData/opencode`.
Todo placeholder: `***` = secreto/valor local,
`tu-dominio*.ngrok-free.dev` = dominio ngrok reservado,
`tu@email.com` = email de la cuenta OAuth.
NUNCA copiar aquí valores reales. Los ficheros reales JAMÁS se versionan
(ver `.gitignore` de esta rama).

## Requisitos

- Windows con PowerShell (el alta y el arranque/parada exigen elevación:
  PowerShell como administrador, UAC).
- `nssm.exe` accesible en `PATH` (alta de los 4 servicios Windows).
- **3 cuentas ngrok separadas** (ver sección siguiente): una por túnel.
  Cada cuenta aporta su `authtoken` (solo vive en la máquina, nunca en el
  repo) y su dominio reservado `tu-dominio*.ngrok-free.dev`.
- Servidor ntfy self-host: `ntfy.exe` + `server.yml` (servicio
  `ServidorNtfy`).
- Puertos coherentes con la rama `config` (`.env.example`):
  `OPENCODE_SERVER_PORT` (servidor explícito) y
  `OPENCODE_NTFY_RELAY_PORT` (relay de preguntas).

## Las 3 cuentas ngrok (una por túnel)

El plan gratuito admite un túnel por agente/cuenta, y cada túnel corre
como un servicio nssm independiente con su propio `*.yml` y su propio
`authtoken`. Por eso se necesitan 3 cuentas (email + dominio reservado
+ `authtoken` por túnel):

| Túnel (servicio nssm) | Fichero ejemplo | Qué expone | Auth en el borde |
|---|---|---|---|
| `TunnelNgrokOpencode` | `examples/ngrok-opencode.yml` | Servidor explícito (`addr` = `OPENCODE_SERVER_PORT`) | `oauth` Google (`allow_emails` con tu email) |
| `TunnelNgrokNtfy` | `examples/ngrok-ntfy.yml` | Servidor ntfy self-host (`addr` = MISMO puerto que `listen-http` en `server.yml`) | ninguna extra |
| `TunnelNgrokCuestionario` | `examples/ngrok-cuestionario.yml` | Relay de preguntas/respuestas (`addr` = `OPENCODE_NTFY_RELAY_PORT`) | `basic_auth` (`usuario:password`, OBLIGATORIA al exponer el relay) |

Si una cuenta pierde su dominio o rota su `authtoken`, solo cae ese túnel:
re-copiar el `*.yml` real correspondiente y reiniciar solo su servicio.
Nunca versionar `authtoken`, dominios reales ni emails reales.

## Variables de entorno de los servicios

Cada túnel ngrok se autentica con el `authtoken` de SU cuenta (3 distintos,
uno por cuenta) configurado como variable de entorno del servicio nssm
(`AppEnvironmentExtra`), nunca en el `*.yml`:

| Servicio nssm | Variable | Valor |
|---|---|---|
| `TunnelNgrokOpencode` | `NGROK_AUTHTOKEN` | `***` (authtoken de la cuenta 1) |
| `TunnelNgrokNtfy` | `NGROK_AUTHTOKEN` | `***` (authtoken de la cuenta 2) |
| `TunnelNgrokCuestionario` | `NGROK_AUTHTOKEN` | `***` (authtoken de la cuenta 3) |
| `ServidorNtfy` | — | ninguna |

Lo pone `examples/nssm-register.ps1` durante el alta. Para consultar el de
un servicio ya creado: `nssm get <Servicio> AppEnvironmentExtra` en una
consola (los valores solo viven en la máquina, jamás en el repo).

## Qué copiar a `C:/ProgramData/opencode`

| Fichero en `examples/` | Destino real | Qué sustituir |
|---|---|---|
| `examples/server.yml` | `C:/ProgramData/opencode/server.yml` | `listen-http` (`HOST:PUERTO` local), `cache-file`, `auth-default-access`, `auth-file` (rutas/secretos locales) |
| `examples/ngrok-opencode.yml` | `C:/ProgramData/opencode/ngrok-opencode.yml` | `domain` (reservado), `allow_emails` (email real), `addr` = puerto del `serve` explícito |
| `examples/ngrok-ntfy.yml` | `C:/ProgramData/opencode/ngrok-ntfy.yml` | `domain` (reservado), `addr` = MISMO puerto que `listen-http` en `server.yml` |
| `examples/ngrok-cuestionario.yml` | `C:/ProgramData/opencode/ngrok-cuestionario.yml` | `domain` (reservado), `basic_auth` (`usuario:password` reales), `addr` = `OPENCODE_NTFY_RELAY_PORT` |
| `examples/nssm-register.ps1` | ejecutar (no copiar) | nada: las rutas ya apuntan a `C:/ProgramData/opencode` |

Coherencia de puertos exigida: `addr` del túnel opencode = `OPENCODE_SERVER_PORT`,
`addr` del túnel cuestionario = `OPENCODE_NTFY_RELAY_PORT`,
`addr` del túnel ntfy = puerto de `listen-http` en `server.yml`.

## Binarios (descargar fuera del repo, NUNCA versionar)

- `ngrok.exe` (~33 MB, https://ngrok.com) y `ntfy.exe` (~74 MB,
  https://ntfy.sh) en `C:/ProgramData/opencode`.
  Ignorados vía `*.exe`.
- `cache.db` / `user.db` los crea ntfy en marcha; ignorados vía `*.db`.
- `node_modules/` + `package-lock.json`/`bun.lock` son locales
  (`npm i` los regenera) y no pertenecen a esta rama.

## Orden de servicios

Arranque: `ServidorNtfy` -> `TunnelNgrokNtfy` -> `TunnelNgrokOpencode` -> `TunnelNgrokCuestionario`.
Parada (inverso, lo hace `hooks/tunnel/tunnel-stop.ps1` de la rama `config`):
`TunnelNgrokCuestionario` -> `TunnelNgrokOpencode` -> `TunnelNgrokNtfy` -> `ServidorNtfy`.

Alta inicial (una vez, con los `*.yml` reales ya copiados):

```powershell
.\examples\nssm-register.ps1   # PowerShell ELEVADO (UAC)
```

## Nota UAC

Arrancar/parar túneles exige elevación (`-Verb RunAs` en
`hooks/tunnel/tunnel-start.ps1` y `tunnel-stop.ps1` de la rama `config`):
sin admin los 4 servicios no arrancan y `opencode-wrapper.ps1` aborta.
En CI sin admin el flujo real no es probable: mockear
`Start-Service`/`Stop-Service`.

## Nota de seguridad (capas del relay)

El relay Node (`plugins/ntfy.js`, rama `config`) NO valida `Authorization`
entrante por decisión documentada: la auth entrante la aplica ngrok en el
borde vía `basic_auth` en `ngrok-cuestionario.yml` (diálogo nativo del
móvil) + URLs de capacidad de un solo uso (`/question/:id`, `/form/:id`
con TTL `OPENCODE_NTFY_QUESTION_TTL_MS` y olvido tras responder: `410
expired_or_already_answered`). `basic_auth` en el borde es OBLIGATORIO en
cuanto el relay se exponga: sin él, cualquiera con la URL pública podría
leer preguntas pendientes o inyectar respuestas. Añadir un chequeo Basic en
Node rompería el flujo móvil actual (las acciones `view` y el `fetch` del
HTML inline no envían cabecera `Authorization`): solo como defensa en
profundidad futura con cambio UX coordinado.
