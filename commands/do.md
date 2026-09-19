---
description: Iteración incremental dirigida por el prompt del usuario, para trabajo ad-hoc fuera de la checklist de NEXT_STEPS.md que sí necesita pasar por los expertos, testing y QA. El orquestador delega en developer con las instrucciones recibidas, leyendo README y ARCHITECTURE como contexto vigente (nunca los edita). Para continuar la checklist priorizada usa /next; para un bug simple y acotado que no necesita el pipeline completo, usa /fix, más rápido y ligero; para refrescar documentación usa /documentate.
agent: orchestrator
---

Arranca una iteración DIRIGIDA por las instrucciones explícitas del usuario: se salta la planificación automática de `NEXT_STEPS.md` para ejecutarse directamente según la especificación recibida, manteniendo la coherencia técnica del proyecto.

> Si lo que tienes entre manos es un bug simple y acotado que no necesita
> revisión especializada ni testing, usa `/fix` en su lugar: es más rápido
> porque se salta también a los expertos, a `testing-expert` y a
> `qa-reviewer`. `/do` sigue pasando por el pipeline completo a partir de
> `developer` — resérvalo para trabajo que sí lo necesita. Si en cambio
> quieres que el sistema persiga un objetivo amplio por varias iteraciones
> seguidas sin preguntarte entre medias, usa `/loop` con ese objetivo como
> argumento — `/do` es para UNA petición puntual, no para una serie.

## 0. Precondiciones

- **La entrada del usuario es OBLIGATORIA**: Comprueba el argumento recibido. Si está vacío, no se proporciona o solo contiene espacios, **PARA inmediatamente** e informa al usuario de que `/do` requiere obligatoriamente un prompt estructurado con las instrucciones explícitas de la tarea a realizar (ejemplo: `/do Añadir autenticación JWT en el endpoint de login y actualizar tests`).
- Deben existir `README.md` y `ARCHITECTURE.md` en la raíz. Si falta alguno, **PARA** y sugiere `/init` (proyecto nuevo) o `/ideas` (definición conversacional).

## 1. Alcance de la iteración

Entrada del usuario (OBLIGATORIA): `$ARGUMENTS`

- Carga y lee detenidamente `README.md` y `ARCHITECTURE.md` como contexto base indispensable para no perder el alineamiento técnico ni funcional del proyecto.
- Utiliza la entrada proporcionada como la especificación técnica estricta de la iteración.
- Anuncia en 2-3 líneas qué vas a abordar en base a esta entrada y qué elementos del sistema se verán involucrados, y continúa sin esperar confirmación.

## 2. Delegación directa en developer

Invoca `developer` (herramienta `task`) con:

- `README.md` y `ARCHITECTURE.md` como contexto vigente cargado.
- Las instrucciones explícitas recibidas en la entrada del usuario como alcance y especificación de trabajo.
- Recordatorio de sus reglas de pipeline e interacción:
  - Debe implementar primero la lógica central y el código base necesario.
  - Una vez finalizada su parte de código, debe invocar **EN PARALELO** a `frontend-expert` y `backend-expert` para la revisión y adaptación de sus respectivas capas.
  - Debe documentar en `CHANGELOG.md` cualquier desviación respecto a `ARCHITECTURE.md`, como en cualquier otra iteración: eso es lo que le corresponde a `developer`, no editar el propio `ARCHITECTURE.md`.
  - Válvula de escape: si el trabajo exige un cambio arquitectónico mayor no previsto, debe bloquearse emitiendo `MOTIVO: REQUIERE_ARQUITECTO`. Si esto ocurre, invoca primero a `architect` para una actualización acotada de `ARCHITECTURE.md` y después reanuda con `developer`.

**Límite importante**: `developer` NUNCA edita `README.md` ni `ARCHITECTURE.md`, tampoco en `/do` — esos ficheros tienen dueño único (`tech-product` y `architect`) en todo el sistema, sin excepción. Si el prompt del usuario resulta implicar redefinir el producto (no solo construir algo dentro del alcance ya definido), eso no es trabajo de `/do`: PARA, explícaselo y sugiere `/ideas`. Si lo que hace falta es documentar el resultado ya construido, sugiere `/documentate` al cerrar, no lo hagas tú aquí.

## 3. Resto del pipeline (idéntico a /next)

Desde aquí la secuencia es la habitual del pipeline sin omitir pasos:

1. `developer` implementa el núcleo, delega **EN PARALELO** a `frontend-expert` y `backend-expert`, converge los cambios y actualiza `CHANGELOG.md` (añadiendo una entrada NUEVA al final, sin modificar las anteriores).
2. `testing-expert` crea y ejecuta los tests contra el resultado convergente. Si algo queda `ROTO`, `developer` lo corrige en `MODO: FIX` (con el diagnóstico exacto como encargo, sin repetir la ronda de expertos) y `testing-expert` vuelve a verificar — hasta 3 intentos antes de continuar de todas formas con el último resultado, sin ocultarlo.
3. `qa-reviewer` escribe el nuevo `NEXT_STEPS.md`, integrando lo abordado en esta sesión con los ítems pendientes anteriores, y emite el veredicto a partir de leer (nunca ejecuta tests ni bash él mismo). Aplica la política de remediación única definida en `agents/orchestrator.md` si el veredicto es `BLOQUEADO` con causas corregibles sin decisión humana.

Al terminar, PARA: resume el resultado, señala los artefactos de código actualizados y sugiere `/commit` para cerrar la iteración en git, `/next` o `/do` para continuar con trabajo técnico, y `/documentate` si el cambio dejó `README.md` o `ARCHITECTURE.md` desalineados con el código.