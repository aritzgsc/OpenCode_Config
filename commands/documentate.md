---
description: "Sincroniza README.md y ARCHITECTURE.md con el estado real del código y con la conversación en curso. No delega en un agente propio de documentación: invoca a los dueños canónicos de cada fichero (tech-product y architect) en modo retrospectivo o de sincronización, según corresponda — en paralelo cuando ambos documentos ya existen, en secuencia cuando alguno hay que bootstrapearlo desde cero."
agent: orchestrator
---

El usuario quiere refrescar la documentación persistente del proyecto sin
pasar por una iteración completa del pipeline. Esto NO es `/init` ni `/next`:
no toca código, no toca `CHANGELOG.md` ni `NEXT_STEPS.md`, y no continúa el
pipeline más allá de los dos documentos.

**Por qué pasa por ti y no por un agente de documentación aparte**:
`README.md` y `ARCHITECTURE.md` tienen dueño único — `tech-product` y
`architect` respectivamente — en cualquier comando y en cualquier modo. Un
agente distinto escribiendo estos ficheros por su cuenta (aunque sea "solo
para sincronizar") rompería ese contrato y, con él, el protocolo de
verificación del resto del pipeline. Por eso `/documentate` reutiliza a los
mismos dos agentes, simplemente en un modo distinto al de diseño hacia
adelante.

Estado actual del repositorio (contexto automático):

!`git status --short 2>/dev/null || echo "Este directorio no es un repositorio git, o git no está disponible."`

!`git log --oneline -15 2>/dev/null`

## 1. Alcance

Entrada del usuario (opcional, foco específico): `$ARGUMENTS`

- Si trae contenido: úsalo para acotar el enfoque (p. ej. "céntrate en el
  módulo de auth", "actualiza solo el stack tecnológico").
- Si está vacía: sincronización integral de ambos documentos.

## 2. Comprueba qué modo le toca a cada documento

- `README.md` existe → le toca `MODO: SINCRONIZACIÓN` a `tech-product`. No
  existe → le toca `MODO: ANÁLISIS RETROSPECTIVO`.
- `ARCHITECTURE.md` existe → le toca `MODO: SINCRONIZACIÓN` a `architect`.
  No existe → le toca `MODO: ANÁLISIS RETROSPECTIVO`.

Esto decide cómo ejecutas el paso siguiente.

## 3. Ejecución

### Caso habitual — los dos documentos ya existen (ambos en SINCRONIZACIÓN)

Invoca `tech-product` y `architect` (`task`) **EN PARALELO**, en la misma
tanda de trabajo. No hay colisión posible: cada uno escribe un fichero
distinto, y ninguno de los dos depende de que el otro termine — cada uno
sincroniza su documento contra el código real y la conversación en curso,
no contra el documento del otro.

- A `tech-product`: el `README.md` actual, el historial de esta
  conversación y el alcance de `$ARGUMENTS`.
- A `architect`: el `ARCHITECTURE.md` actual, el `README.md` **tal como
  está en este momento** (puede que `tech-product` lo esté actualizando en
  paralelo — es contexto de referencia, no una entrada que deba esperar:
  la fuente primaria de `architect` para detectar deriva es el código
  real, no el README), el historial de esta conversación y el alcance de
  `$ARGUMENTS`.

### Caso de bootstrap — alguno de los dos NO existe

NO los paralelices aquí: hay una dependencia real. `architect` en `MODO:
ANÁLISIS RETROSPECTIVO` necesita partir de un `README.md` que exista — no
puede reconstruir arquitectura desde cero sin nada que ancle el contexto de
producto. Sigue el orden secuencial de siempre:

1. Invoca `tech-product` primero (en el modo que le toque según el paso 2).
   Verifica `README.md` con el protocolo habitual. Si `ESTADO: BLOQUEADO`,
   PARA y explica el bloqueo.
2. Invoca `architect` después (en el modo que le toque), entregándole el
   `README.md` resultante del paso anterior — preexistente o recién
   generado.

## 4. Verificación y coherencia

Verifica ambos artefactos con el protocolo habitual. Si alguno terminó con
`ESTADO: BLOQUEADO`, PARA y explica el bloqueo.

Si ejecutaste el caso paralelo, haz además una comprobación rápida (no una
relectura exhaustiva): lee ambos documentos finales y confirma que no se
contradicen de forma evidente entre sí — por ejemplo, que `architect` no
haya quedado anclado a un caso de uso que `tech-product` acaba de retirar
del alcance. Si encuentras algo así, no lo arregles tú por tu cuenta:
anótalo en el resumen final para que el usuario lo revise, o si el
desajuste es significativo, sugiérele volver a ejecutar `/documentate`.

## 5. Cierre

PARA aquí. No invoques a `developer`, `testing-expert` ni `qa-reviewer`: no
es una iteración, es una puesta al día de documentación.

Resume al usuario:

- Qué se generó por primera vez (bootstrap retrospectivo) y qué se
  sincronizó (ya existía).
- Los puntos clave que cambiaron en cada documento — no reproduzcas el
  fichero completo, interpreta y resume.
- Si algún documento quedó marcado como bootstrap retrospectivo, dilo
  explícitamente: no está validado por el usuario, y conviene revisarlo con
  `/ideas` (para el README) cuando haya ocasión.
- Si la comprobación de coherencia del paso 4 encontró algo, dilo aquí.
- Recuerda cerrar con `/commit` si quiere consolidar los cambios en git.
