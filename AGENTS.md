# Reglas globales

Estas reglas se aplican a TODAS las sesiones de OpenCode, en cualquier
proyecto, por encima de lo que diga el `AGENTS.md` local de cada proyecto
(que manda en lo específico de ese proyecto).

## Pipeline de agentes

Este entorno global implementa un pipeline con un orquestador y especialistas:

```text
tech-product (README.md)
      └─► architect (ARCHITECTURE.md)
                └─► developer (implementación principal)
                         ├─► frontend-expert   ─┐
                         └─► backend-expert    ─┤  paralelo
                                                └─► developer (revisión final + CHANGELOG.md)
                                                              └─► testing-expert
                                                                    └─► qa-reviewer (NEXT_STEPS.md)
```

La delegación anidada es intencionada: `@orchestrator` delega a `@developer`,
y `@developer` delega obligatoriamente a `@frontend-expert` y
`@backend-expert`. El límite global `experimental.subagent_depth: 2` permite exactamente
esa profundidad.

- Para arrancar el pipeline completo en un proyecto: `/init`.
- Para una tarea puntual que no necesita todo el pipeline, sigue usando
  `build` o `plan`, o invoca directamente un agente concreto con `@nombre`.
- `@frontend-expert` y `@backend-expert` modifican el código producido por
  `@developer`; no son auditores de solo lectura.
- Los dos expertos deben ejecutarse en paralelo una vez que `@developer`
  haya terminado la implementación principal.
- `@developer` no continúa a testing hasta haber esperado a los dos expertos,
  revisado todos los cambios y realizado una última auditoría sobre el
  código completo.
- Esa auditoría final se documenta en `CHANGELOG.md`.
- Después entra `@testing-expert`, que puede modificar tests y código solo si
  una corrección pequeña y necesaria para que los tests representen el
  comportamiento esperado no altera decisiones arquitectónicas; las
  decisiones de diseño deben volver a `@developer`.
- Finalmente `@qa-reviewer` produce `NEXT_STEPS.md` y el pipeline se detiene
  hasta recibir feedback humano explícito.

## Rate-limit guard

El plugin global `~/.config/opencode/plugins/rate-limit-guard.js` se carga
automáticamente por OpenCode al arrancar. No hace falta añadirlo a
`opencode.jsonc`. Su responsabilidad es secundaria: detectar señales de
rate-limit en los eventos V2 (`session.retry.scheduled`,
`session.step.failed` / `session.execution.failed` / `session.tool.failed`
con `error.status === 429` o `error.type === "provider.quota"`, más
`session.status` con `type: retry` como compat) y lanzar
`hooks/rate_limit/rate_limit_handler.bat`, que pide un circuito nuevo a Tor
(`rotate_tor.ps1` → `AUTHENTICATE` + `SIGNAL NEWNYM` contra el ControlPort).
OpenCode sigue siendo quien controla sus propios reintentos.

La rotación solo se ejecuta cuando el wrapper está activo
(`OPENCODE_TOR_RATE_LIMIT_ROTATION_ENABLED=true`, fijada solo en el entorno
del wrapper); fuera del wrapper el plugin queda en modo observación.
Hay cooldown entre rotaciones, y `Ctrl+R` (AutoHotkey,
`hooks/rate_limit/rotar_ip.ahk`) permite una rotación manual.
`SIGNAL NEWNYM` pide circuitos nuevos pero no garantiza una IP de salida
distinta (Tor puede reutilizar el mismo relay de salida).

## MCP y plugins externos

- MCP locales/remotos se declaran en `opencode.jsonc` bajo `mcp`.
- Los plugins locales globales van en `~/.config/opencode/plugins/` y se
  cargan automáticamente.
- Los plugins externos publicados en npm se añaden mediante la opción
  `plugins`.
- Evita habilitar MCP globales de gran tamaño salvo que aporten valor a
  todos los proyectos: sus herramientas consumen contexto.

## Estilo de trabajo

- Directo y conciso. Sin relleno ni confirmaciones innecesarias.
- Ante ambigüedad razonable, toma la decisión más sensata y sigue.
- Al revisar o auditar código, prioriza feedback honesto y accionable.
- No inventes validaciones: todo resultado debe distinguir entre probado,
  no probado y bloqueado por el entorno.
