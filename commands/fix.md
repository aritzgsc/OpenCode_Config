---
description: "Corrección directa de uno o varios bugs simples y acotados, saltándose el pipeline completo — orchestrator delega directamente en developer (MODO FIX), que trabaja en solitario, sin frontend-expert/backend-expert, sin testing-expert y sin qa-reviewer. No es apto para features nuevas ni para cambios con implicaciones de seguridad, UX o arquitectura: developer puede rechazar el encargo si excede ese alcance."
agent: orchestrator
---

Arranca el modo más ligero del pipeline: una corrección puntual de bug(s),
sin las barreras de revisión especializada, testing ni QA que sí aplican al
resto de comandos. Existe precisamente para no pagar el coste completo del
pipeline en algo que no lo necesita — pero úsalo con criterio: si dudas de
si el encargo es realmente "simple", probablemente no lo sea, y `/do` es la
opción más segura.

## 0. Precondiciones

- **La entrada del usuario es OBLIGATORIA**: comprueba `$ARGUMENTS`. Si está
  vacío, no se proporciona o solo contiene espacios, **PARA inmediatamente**
  e informa de que `/fix` requiere una descripción del bug o bugs a
  corregir (ejemplo: `/fix El botón de login no responde en móvil cuando el
  email tiene mayúsculas`).
- Deben existir `README.md` y `ARCHITECTURE.md` en la raíz. Si falta alguno,
  **PARA** y sugiere `/init` o `/ideas` — `developer` necesita ese contexto
  incluso para un fix pequeño.

## 1. Alcance

Entrada del usuario (OBLIGATORIA): `$ARGUMENTS`

Anuncia en 1-2 líneas qué vas a corregir y continúa sin esperar
confirmación.

## 2. Delegación directa en developer (MODO FIX)

Invoca `developer` (herramienta `task`) indicando explícitamente
`MODO: FIX` en el prompt, con:

- `README.md` y `ARCHITECTURE.md` como contexto de lectura.
- La descripción de los bugs, literal, como el encargo a corregir.
- Recuerda que las reglas completas de `MODO FIX` viven en su propio
  fichero (`agents/developer.md`): no las repitas por extenso, basta con
  indicar el modo. En síntesis, lo que debe cumplir: sin delegación en
  expertos, corrección mínima y quirúrgica, comprobaciones baratas propias,
  test de regresión si el bug no tenía uno, y la válvula de escape
  `MOTIVO: FUERA_DE_ALCANCE_DE_FIX` si el encargo resulta ser más de lo que
  parecía.

## 3. Cierre (sin testing-expert ni qa-reviewer)

Este modo termina en `developer`. NO invoques `testing-expert` ni
`qa-reviewer`: `/fix` no tiene FASE 3 ni FASE 4.

- Si `developer` terminó con `ESTADO: BLOQUEADO` y
  `MOTIVO: FUERA_DE_ALCANCE_DE_FIX`: no reintentes en este mismo modo.
  Explica al usuario, citando el motivo que dio `developer`, por qué el
  encargo excede lo que `/fix` cubre, y sugiere `/do` o `/next` — ambos sí
  pasan por los expertos.
- Si `developer` terminó con `ESTADO: BLOQUEADO` y
  `MOTIVO: REQUIERE_ARQUITECTO`: esto no es un fallo de `/fix`, es la
  válvula de escape normal. Invoca a `architect` para una actualización
  acotada de `ARCHITECTURE.md` y reanuda con `developer` en `MODO: FIX`.
- Si todo fue bien, verifica que `CHANGELOG.md` tiene la nueva entrada de
  fix y PARA: resume el o los bugs corregidos, señala los ficheros de
  código tocados y sugiere `/commit`. Sé explícito con el usuario: este
  cambio no pasó por la validación completa del pipeline (sin
  `testing-expert` ni `qa-reviewer`), solo por la revisión del propio
  `developer` — si el fix era más delicado de lo que parecía, mejor
  recomendar un `/review` posterior antes de dar el trabajo por cerrado.
