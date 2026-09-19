---
description: Iteración incremental. El orquestador delega directamente en developer con el NEXT_STEPS.md de la iteración anterior y el pipeline continúa igual (expertos en paralelo → testing → QA).
agent: orchestrator
---

Arranca una iteración INCREMENTAL del pipeline: se salta la definición de
producto y arquitectura porque ambas ya existen.

> Si lo que quieres es ejecutar algo puntual que NO está en la checklist de
> `NEXT_STEPS.md` (una petición concreta y fuera de plan que sí necesita
> pasar por los expertos), usa `/do` en su lugar: el resto del pipeline es
> idéntico a partir de `developer`. Si en cambio es un bug simple y acotado
> que no necesita revisión especializada ni testing, usa `/fix`: es más
> rápido y ligero que ambos. Y si lo que quieres es que el sistema encadene
> muchas iteraciones como esta por su cuenta, sin preguntarte entre cada
> una, hasta vaciar toda la checklist, usa `/loop`.

## 0. Precondiciones

- Debe existir `NEXT_STEPS.md` en la raíz. Si no existe, PARA y explica que
  primero hay que completar una iteración con `/init` (proyecto nuevo) o
  `/ideas` (redefinir el brief).
- Deben existir también `README.md` y `ARCHITECTURE.md`. Si falta alguno,
  PARA y sugiere `/ideas`.

## 1. Alcance de la iteración

Entrada del usuario (puede estar vacía): `$ARGUMENTS`

- Si trae contenido: úsalo como alcance (por ejemplo "los dos P1", "el
  riesgo de seguridad", o una feature concreta de la checklist).
- Si está vacía: lee `NEXT_STEPS.md` y selecciona un corte coherente — los
  ítems de mayor prioridad que formen una iteración razonable. Anuncia en
  2-3 líneas qué vas a abordar y qué queda fuera, y continúa sin esperar
  confirmación.

## 2. Delegación directa en developer

Invoca `developer` (herramienta `task`) con:

- `README.md` y `ARCHITECTURE.md` como contexto vigente.
- `NEXT_STEPS.md` completo y el alcance elegido en el paso 1.
- Recordatorio de su válvula de escape: si el trabajo exige un cambio
  arquitectónico mayor, debe bloquearse con `MOTIVO: REQUIERE_ARQUITECTO`.
  Si eso ocurre, invoca primero a `architect` para una actualización acotada
  de `ARCHITECTURE.md` y después reanuda con `developer`.

## 3. Resto del pipeline (idéntico a /init)

Desde aquí la secuencia es la habitual, sin atajos:

1. `developer` implementa el núcleo, delega EN PARALELO a `frontend-expert`
   y `backend-expert`, converge y actualiza `CHANGELOG.md` (entrada NUEVA al
   final, sin tocar las anteriores).
2. `testing-expert` crea y ejecuta los tests contra el resultado
   convergente. Si algo queda `ROTO`, `developer` lo corrige en `MODO: FIX`
   (con el diagnóstico exacto como encargo, sin repetir la ronda de
   expertos) y `testing-expert` vuelve a verificar — hasta 3 intentos antes
   de continuar de todas formas con el último resultado, sin ocultarlo.
3. `qa-reviewer` escribe el nuevo `NEXT_STEPS.md`, arrastrando los
   pendientes no abordados de la iteración anterior, y emite veredicto a
   partir de leer (nunca ejecuta tests ni bash él mismo). Aplica la
   política de remediación única definida en `agents/orchestrator.md`
   si el veredicto es BLOQUEADO con causas corregibles sin decisión humana.

Al terminar, PARA: resume el resultado, señala los artefactos actualizados y
sugiere `/commit` para cerrar la iteración en git y `/next` para la
siguiente.
