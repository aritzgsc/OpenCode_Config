---
description: Auditoría rápida de @qa-reviewer sobre el git diff actual (staged y unstaged), antes de decidir si haces /commit o cambias de rama. Si README.md o ARCHITECTURE.md no existen, los reconstruye primero por análisis retrospectivo del código. orchestrator delega en un modo puntual de solo lectura que no toca NEXT_STEPS.md ni exige el resto del pipeline.
agent: orchestrator
---
El usuario quiere una segunda opinión de `qa-reviewer` sobre lo que hay en el working tree AHORA MISMO, antes de comprometerse con un `/commit` o un cambio de rama. Esto NO es el cierre de iteración habitual de `qa-reviewer`: es una consulta puntual y conversacional.

**Por qué pasa por ti y no invoca a `qa-reviewer` directamente**: `qa-reviewer` es `mode: subagent` — solo puede recibir trabajo a través de `task`, igual que en el pipeline normal. Tú ya tienes permiso `task` sobre él (`"qa-reviewer": allow`), así que esta delegación no requiere tocar su configuración.

## 1\. Reconocimiento (tú, de solo lectura)
- `git status` y `git diff` (staged y unstaged). Si no hay cambios, dilo y PARA: no hay nada que auditar.
- Comprueba si existen `README.md` y `ARCHITECTURE.md`.

Contexto adicional del usuario (puede estar vacío): `$ARGUMENTS`. Úsalo para acotar el alcance (p. ej. "solo el módulo de auth", "céntrate en seguridad").

## 2\. Bootstrap retrospectivo (solo si falta README.md o ARCHITECTURE.md)
`qa-reviewer` necesita ese contexto para auditar con criterio, así que — a diferencia de la versión anterior de este comando — aquí ya no son opcionales. Antes de delegar en `qa-reviewer`:

Avisa al usuario en una línea de que vas a reconstruir el contexto que falta antes de auditar el diff.

1. Si falta `README.md`: invoca `tech-product` (`task`) con `MODO: ANÁLISIS RETROSPECTIVO`. Verifica.
1. Si falta `ARCHITECTURE.md`: invoca `architect` (`task`) con `MODO: ANÁLISIS RETROSPECTIVO`, entregándole el `README.md` (preexistente o recién generado). Verifica.

Si alguna de estas invocaciones termina con `ESTADO: BLOQUEADO`, PARA y explica el bloqueo — no audites el diff sin ese contexto si `qa-reviewer` lo necesitaba para algo concreto.

`NEXT_STEPS.md` NO forma parte de esta comprobación: esta auditoría no lo lee ni lo necesita, a diferencia de `/status`.

## 3\. Delegación en `qa-reviewer` (`task`, MODO AUDITORÍA RÁPIDA)
Tu prompt a `qa-reviewer` DEBE dejar explícito que este es un modo distinto de su cierre de iteración habitual:

- **Entrégale** el diff completo (staged + unstaged), `README.md`/`ARCHITECTURE.md` (garantizados por el punto 2) y el alcance de `$ARGUMENTS`.
- **Deja explícito, literalmente**: "MODO: AUDITORÍA RÁPIDA — no escribas ni sobrescribas `NEXT_STEPS.md`, no exijas el informe de `testing-expert` ni un `CHANGELOG.md` de esta tanda. Aplica tu mismo criterio (seguridad, contratos, riesgos, calidad) y tu mismo vocabulario de veredicto, pero al diff actual, no a una iteración cerrada. Responde en el chat, no en un fichero."
- Si `README.md` o `ARCHITECTURE.md` se generaron en el punto 2, dile también que son bootstrap retrospectivo (no validados por el usuario), para que module su confianza en ese contexto igual que lo haría con cualquier supuesto sin confirmar.
- **Pídele que devuelva**: un veredicto (`LISTO` | `LISTO_CON_OBSERVACIONES` | `BLOQUEADO`), hallazgos concretos con fichero/línea cuando aplique y, si es `BLOQUEADO`, qué es corregible sin decisión humana y qué no — el mismo criterio que usaría en `NEXT_STEPS.md`.

## 4\. Transmisión
Transmite la respuesta de `qa-reviewer` tal cual (es su auditoría: no la reescribas ni la suavices). Si el punto 2 generó algún documento, dilo explícitamente antes del veredicto. Cierra tú con una línea que traduzca el veredicto a la decisión que el usuario tiene delante: ¿conviene `/commit` ya, o merece la pena corregir algo antes?

No invoques a ningún otro agente ni continúes el pipeline: `/review` es una consulta puntual, no una fase.
