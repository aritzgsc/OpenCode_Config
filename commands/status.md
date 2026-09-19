---
description: Lee README.md, ARCHITECTURE.md y NEXT_STEPS.md y devuelve un resumen rápido de en qué fase está el pipeline, a qué subagente le toca actuar a continuación y qué queda pendiente. Si falta alguno de los tres, antes de resumir lo reconstruye mediante análisis retrospectivo del código (tech-product → architect → qa-reviewer).
agent: orchestrator
---
El usuario quiere una foto del estado del proyecto sin releer él mismo los artefactos. En el caso normal es una consulta de SOLO LECTURA; si faltan artefactos, es además un bootstrap puntual — pero sigue sin ser una fase del pipeline: no se abre ninguna iteración nueva.

## 1\. Comprobación
Comprueba si existen `README.md`, `ARCHITECTURE.md` y `NEXT_STEPS.md` en la raíz del proyecto.

- Si LOS TRES existen → ve directo al punto 3 (Resumen). No invoques a ningún subagente.
- Si falta alguno → punto 2 (Bootstrap retrospectivo) antes de resumir.

## 2\. Bootstrap retrospectivo (solo si falta algo)
Avisa primero al usuario en una línea: qué artefactos faltan y que vas a reconstruirlos analizando el código existente antes de poder darle el resumen — este `/status` va a tardar más de lo habitual.

Invoca, EN ESTE ORDEN (cada uno depende del anterior), solo los que falten:

1. Si falta `README.md`: invoca `tech-product` (`task`) con `MODO: ANÁLISIS RETROSPECTIVO`. Verifica que `README.md` existe al volver (protocolo de verificación habitual).
1. Si falta `ARCHITECTURE.md`: invoca `architect` (`task`) con `MODO: ANÁLISIS RETROSPECTIVO`, entregándole el `README.md` (preexistente o recién generado en el paso anterior). Verifica.
1. Si falta `NEXT_STEPS.md`: invoca `qa-reviewer` (`task`) con `MODO: ANÁLISIS RETROSPECTIVO`, entregándole `README.md` y `ARCHITECTURE.md`. NO le pidas el informe de `testing-expert`: este modo no lo necesita ni lo espera. Verifica.

Si cualquiera de estas invocaciones termina con `ESTADO: BLOQUEADO`, PARA aquí, explica el bloqueo tal cual te lo reporte el agente y no sigas al resumen con datos a medias.

## 3\. Resumen
Responde SIEMPRE con esta estructura, en el chat:

~~~ md
## Estado del pipeline

**Fase actual:** <sin inicializar | definición de producto | arquitectura lista | iteración cerrada | bloqueada>
**Último veredicto:** <LISTO | LISTO_CON_OBSERVACIONES | BLOQUEADO | NO_EVALUADO (bootstrap retrospectivo) | sin iteraciones todavía>
**Resumen:** <2-3 líneas: el Resumen ejecutivo de NEXT_STEPS.md si existe; si no, el Problema de README.md>
**A quién le toca ahora:** <subagente(s) relevantes para el siguiente paso, y por qué>
**Generado en este mismo /status:** <"ninguno" o la lista de README/ARCHITECTURE/NEXT_STEPS que acabas de crear por análisis retrospectivo — el usuario debe saber que esos no están validados por él>

**Pendiente:**
<la Checklist para la siguiente iteración de NEXT_STEPS.md, priorizada y tal cual>
~~~

## 4\. Cómo inferir cada campo
- **Fase actual**: con los tres artefactos garantizados (existentes o recién generados) → iteración cerrada, matizada por el veredicto (LISTO/LISTO_CON_OBSERVACIONES es "cerrada y disponible", BLOQUEADO es "bloqueada", NO_EVALUADO es "recién bootstrapeada, sin pasar todavía por una iteración real").
- **A quién le toca ahora**: veredicto `BLOQUEADO` con `MOTIVO: REQUIERE_ARQUITECTO` (o equivalente) → `architect`. `BLOQUEADO` por causas corregibles → `developer` (remediación). `LISTO`/`LISTO_CON_OBSERVACIONES` → ciclo normal de `/next`. `NO_EVALUADO` (bootstrap) → normalmente `/next` también, para que la primera iteración real empiece a partir de la checklist retrospectiva.
- **Pendiente**: copia la Checklist tal cual la dejó `qa-reviewer`; no la reinventes ni la resumas de más.

## Reglas
- No repitas el contenido íntegro de los ficheros: interpreta y resume. El usuario puede abrir el fichero si quiere el detalle completo.
- Si el bootstrap del punto 2 generó algún documento, dilo explícitamente en el resumen (campo "Generado en este mismo /status"): no dejes que parezcan artefactos validados por el usuario cuando son inferencia sobre el código.
- Puedes cerrar con una línea sugiriendo el comando natural siguiente (`/next`, `/ideas`, `/commit`...), pero no lo ejecutes: `/status` informa, no actúa.
