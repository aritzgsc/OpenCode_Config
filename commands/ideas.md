---
description: Descubrimiento de producto conversacional. El orquestador hace de relevo entre tú y tech-product (preguntas, respuestas y sugerencias); al cerrar, tech-product actualiza README.md y el pipeline arranca automáticamente.
agent: orchestrator
---

Abre una sesión de DESCUBRIMIENTO DE PRODUCTO. El usuario quiere pensar en
voz alta con `@tech-product` antes de comprometer el pipeline completo.

Semilla inicial del usuario (puede estar vacía): `$ARGUMENTS`

## El bucle de conversación

Actúas como RELEVO entre el usuario y `tech-product`. En cada ronda:

1. Invoca `tech-product` (herramienta `task`) en MODO CONVERSACIÓN con:
   - El `README.md` actual si existe (puede no existir: las ideas sobre
     papel en blanco también son válidas).
   - El historial COMPLETO de la conversación hasta el momento (preguntas,
     respuestas del usuario y sugerencias previas), para que no repita ni
     olvide nada.
   - La semilla inicial, si la hay, en la primera ronda.
2. Lee su línea de control:
   - `MODO: PREGUNTAS` o `MODO: LISTO_PARA_CIERRE` → transmite su mensaje
     al usuario TAL CUAL (sus preguntas, sugerencias y síntesis son suyas:
     no las reescribas ni respondas por él) y espera la respuesta del
     usuario. Añade la respuesta al historial y vuelve al paso 1.
   - `MODO: CIERRE` → el README quedó escrito; pasa al arranque automático.
3. El usuario cierra el bucle cuando quiera ("listo", "adelante", "genera el
   README", "al lío"...). En ese momento invoca a `tech-product`
   ordenándole expresamente `MODO: CIERRE` con el historial completo: debe
   escribir o actualizar `README.md` incorporando TODO lo conversado.

Reglas del bucle:

- No impongas un número máximo de rondas. Si las respuestas del usuario ya
  dan para un brief sólido, puedes sugerir amablemente el cierre (una vez
  por ronda como mucho), pero la decisión es suya.
- Si el usuario abandona ("para", "déjalo"), detén el bucle sin tocar el
  README y confirma que no se ha cambiado nada.
- Nada de lo conversado es vinculante hasta que `tech-product` lo vuelca en
  `README.md` en el cierre.

## Arranque automático del pipeline

En cuanto el cierre confirme que `README.md` está escrito/actualizado,
continúa SIN pedir confirmación adicional (ese es el contrato de `/ideas`):

1. Verifica `README.md` según tu protocolo de verificación.
2. Invoca `architect` → `ARCHITECTURE.md` (actualización incremental si ya
   existía).
3. Invoca `developer` → implementación + expertos en paralelo →
   `CHANGELOG.md`.
4. Invoca `testing-expert`.
5. Invoca `qa-reviewer` → `NEXT_STEPS.md` con veredicto.
6. PARA: resume el resultado y sugiere `/commit` para cerrar en git y
   `/next` para continuar.
