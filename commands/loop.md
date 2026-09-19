---
description: Bucle autónomo que encadena ciclos completos de implementación, testing, QA, documentación y commit sin pedir aprobación entre pasos, hasta cumplir el objetivo del proyecto o hasta que salte alguno de sus frenos de seguridad. Es el modo con menos interacción de todo el sistema — y el que más se apoya en que el resto de agentes estén haciendo bien su trabajo, porque nadie va a revisar cada paso por ti.
agent: orchestrator
---

Arranca el modo más autónomo del pipeline. No es una iteración: es una
secuencia de iteraciones que se encadenan solas, cada una validada,
documentada y comiteada antes de pasar a la siguiente, hasta que el
proyecto cumple su objetivo o hasta que algo exige tu criterio y el loop
se detiene a esperarte.

**Esto no es magia ni sustituye la disciplina del resto del pipeline** —
la aprovecha. Cada ciclo sigue exactamente las mismas reglas que `/next`,
`/fix` y `/documentate` seguirían si los ejecutaras tú a mano, uno detrás
de otro. Lo único que cambia es que nadie te pregunta entre medias.

## 0. Precondiciones

- Deben existir `README.md`, `ARCHITECTURE.md` y `NEXT_STEPS.md`. Si falta
  alguno, **PARA** y sugiere `/init` (proyecto nuevo) o, si ya hay código
  pero nunca hubo una iteración real, un `/next` manual primero — `/loop`
  necesita una checklist real de la que partir, no solo un bootstrap
  retrospectivo sin validar.
- Confirma que hay un repositorio git limpio o con cambios entendibles
  (`git status`). Si el working tree ya tiene cambios sin commitear que no
  vienen de esta sesión, avísalo antes de empezar: el primer `commit` en
  `MODO: AUTÓNOMO` los incluiría también.

## 1. Objetivo y parámetros

Entrada del usuario: `$ARGUMENTS`. Puede contener un token `max=N`
(ejemplo: `max=20`) en cualquier posición — extráelo como el tope de
ciclos, y trata el resto del texto (sin ese token) como el objetivo.

- Si queda texto tras quitar `max=N`: es el objetivo explícito de todo el
  loop, igual que en `/do`. Pásaselo a `qa-reviewer` en cada ciclo para
  que su checklist en `NEXT_STEPS.md` se alinee a él en vez de al criterio
  genérico.
- Si no queda texto: el objetivo es vaciar la checklist de `NEXT_STEPS.md`
  cumpliendo los **Criterios de éxito** de `README.md`.
- Tope de ciclos: el `N` de `max=N` si se dio, si no, **12** por defecto.

Anuncia en 2-3 líneas el objetivo, el tope de ciclos y que no volverás a
preguntar hasta terminar o toparte con algo que sí lo requiera. No esperes
confirmación para empezar.

## 2. El ciclo (se repite hasta la condición de fin o un freno)

Cada ciclo es, en esencia, un `/next` completo más limpieza de cierre. Ni
FASE 3 ni FASE 4 relajan sus topes de remediación dentro de `/loop` — son
los mismos que en cualquier iteración manual. Lo único distinto aquí es
que nadie te pregunta entre pasos.

1. **Selección de alcance**: si `NEXT_STEPS.md` tiene ítems pendientes,
   toma el de mayor prioridad (igual que `/next`). Si está vacío pero el
   objetivo explícito del loop aún no está satisfecho, pide a
   `qa-reviewer` (o determina tú mismo con lo que ya sabes del proyecto)
   cuál es el siguiente paso razonable hacia ese objetivo.
2. **Implementación**: `developer` en `MODO: IMPLEMENTACIÓN` (con
   `frontend-expert`/`backend-expert` obligatorios y en paralelo, como
   siempre) → convergencia y `CHANGELOG.md`.
   - Si `developer` se bloquea con `MOTIVO: REQUIERE_ARQUITECTO`: intercala
     `architect` para una actualización acotada y reanuda con `developer`.
     Esto NO cuenta como freno, es parte normal del ciclo.
   - Si `developer` se bloquea con `MOTIVO: REQUIERE_PRODUCTO`: este ítem
     concreto no se puede resolver solo. Si hay otros ítems pendientes en
     `NEXT_STEPS.md`, sáltalo y sigue con otro en este mismo ciclo — pero
     antes, ANOTA el ítem saltado (con la ambigüedad exacta que reportó
     `developer`) para incluirlo literalmente en el prompt de `qa-reviewer`
     en el paso 4 de este mismo ciclo. Sin este registro, el ítem
     desaparece del backlog sin que nadie se entere, o un ciclo futuro
     vuelve a tropezar con la misma ambigüedad. Si no hay más ítems, o el
     objetivo explícito del loop ERA ese ítem ambiguo, esto es un freno —
     ver paso 5.
3. **Testing y remediación técnica (FASE 3)**: `testing-expert` crea y
   ejecuta los tests que correspondan contra el resultado convergido. Si
   `ESTADO: ROTO`: `developer` en `MODO: FIX`, usando el diagnóstico de
   `testing-expert` literalmente como encargo (no lo reinterpretes) →
   `testing-expert` re-verifica. Repite hasta `OK`, con tope de **3
   intentos** — el mismo tope que fuera de `/loop`, `/loop` no lo amplía.
   El `ROTO` inicial es el disparador, no cuenta como intento: cada par
   `developer (corrección) → testing-expert (re-verificación)` sí cuenta
   como uno. `MOTIVO: REQUIERE_ARQUITECTO` no cuenta contra el tope (igual
   que en el paso 2); `MOTIVO: FUERA_DE_ALCANCE_DE_FIX` escala a `MODO:
   IMPLEMENTACIÓN` completo y sí cuenta contra el tope. Si se agotan los 3
   intentos sin `OK`, continúa igualmente al paso 4 — lleva el último
   informe `ROTO` tal cual, sin suavizarlo.
4. **QA (FASE 4)**: `qa-reviewer` lee todo lo anterior — nunca ejecuta
   tests ni bash — y da veredicto. Si en el paso 2 saltaste algún ítem por
   `REQUIERE_PRODUCTO`, inclúyelo literalmente en su prompt: debe quedar
   en "Pendiente / no cubierto" de `NEXT_STEPS.md` con una nota del tipo
   `[requiere aclaración de producto — ver /ideas]`, no desaparecer sin
   más. Si `BLOQUEADO` por un hueco de alcance
   "corregible sin decisión humana": un único intento de remediación
   (`developer` en `MODO: FIX` → `testing-expert` re-verifica siempre →
   `qa-reviewer`) — mismo tope de UN intento que fuera de `/loop`. Si
   "requiere decisión humana" (lo que incluye, por defecto, un `ESTADO:
   ROTO` que sobrevivió al tope del paso 3 — `qa-reviewer` debe tratarlo
   así salvo razón concreta en contra): esto es un freno — ver paso 5.
5. **Comprobación de frenos** (antes de seguir, en este orden):
   - ¿Se alcanzó el tope de ciclos? → PARA (ver cierre).
   - ¿Hay un bloqueo "requiere decisión humana" (del paso 3 o del 4) o un
     `MOTIVO: REQUIERE_PRODUCTO` sin más ítems a los que saltar? → PARA
     (ver cierre).
   - ¿El veredicto y los bloqueos de este ciclo son, en el fondo, los
     mismos que los del ciclo anterior (no la redacción literal, la
     sustancia)? → estancamiento, PARA (ver cierre).
   - Si nada de esto salta, continúa.
6. **Documentación** (solo si el ciclo no quedó bloqueado): invoca
   `tech-product` y `architect` **en paralelo**, cada uno en
   `MODO: SINCRONIZACIÓN`, exactamente como en `commands/documentate.md`
   cuando ambos documentos ya existen (es el caso normal a estas alturas
   de cualquier proyecto real).
7. **Commit** (solo si el paso anterior no encontró nada bloqueante):
   invoca `committer` en `MODO: AUTÓNOMO`. Si comitea, sigue. Si termina
   `ESTADO: BLOQUEADO`, esto es un freno — ver paso 5 (trátalo igual que
   un bloqueo "requiere decisión humana": PARA el loop entero).
8. **Log de progreso**: un resumen breve en el chat — qué se hizo este
   ciclo, veredicto, ciclo N de M. Es un log, no una pregunta: no esperes
   respuesta, continúa directamente con el siguiente ciclo.
9. **Condición de fin**: si `NEXT_STEPS.md` no tiene más ítems pendientes
   Y el veredicto de este ciclo fue `LISTO` o `LISTO_CON_OBSERVACIONES` Y
   (si había un objetivo explícito) ese objetivo está satisfecho: el loop
   terminó con éxito, ve al cierre. Si no, vuelve al paso 1.

Si en algún momento el contexto de la conversación se acerca a su límite y
no puedes garantizar seguir con la misma disciplina, trátalo también como
un freno: cierra el ciclo actual de forma limpia (no lo dejes a medias) y
para ahí, aunque no hayas llegado al tope de ciclos.

## 3. Cierre

Independientemente de por qué se detuvo el loop (objetivo cumplido, tope
de ciclos, freno de decisión humana, estancamiento, límite de contexto),
termina siempre con un resumen completo:

- Cuántos ciclos se ejecutaron y qué se completó en cada uno (a alto
  nivel — el detalle real vive en `CHANGELOG.md` y en el historial de
  commits, no lo repitas aquí).
- El motivo exacto de la parada. Si fue un freno, sé explícito sobre qué
  necesita tu decisión y por qué el sistema no la tomó por su cuenta.
- El estado de `NEXT_STEPS.md`: qué queda pendiente, si algo.
- Si hubo commits automáticos, dilo con claridad: cuántos y un resumen de
  qué cubren — el usuario no ha visto ninguno hasta este momento.
- El siguiente paso natural: `/loop` de nuevo (si se detuvo por un freno
  ya resuelto por el usuario, o por el tope de ciclos y aún queda
  trabajo), `/next` o `/do` para continuar a mano, o nada más si el
  objetivo se cumplió del todo.
