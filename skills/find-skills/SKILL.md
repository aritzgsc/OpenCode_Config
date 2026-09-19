---
name: find-skills
description: Detecta el stack tecnológico real del proyecto a partir de ARCHITECTURE.md y determina qué skills (globales o locales del proyecto) son relevantes para developer, frontend-expert y backend-expert antes de arrancar FASE 2. Úsala solo desde @orchestrator, justo después de que exista ARCHITECTURE.md.
license: MIT
compatibility: opencode
metadata:
  used-by: orchestrator
  phase: transicion-fase-1-a-2
---

## Qué hago

Te doy un procedimiento fijo para decidir qué skills cargar en FASE 2:

1. Lee `ARCHITECTURE.md` y extrae: lenguaje(s), framework(s) principal(es),
   base de datos, infraestructura/despliegue, y cualquier librería
   mencionada explícitamente como decisión de diseño.
2. Lista las skills disponibles con las herramientas `list`/`glob` en:
   - `~/.config/opencode/skills/*/SKILL.md` (globales, siempre
     disponibles)
   - `.opencode/skills/*/SKILL.md` (locales de este proyecto, si existen)
3. Cruza el stack detectado contra la `description` de cada skill
   encontrada. No cargues el contenido completo de una skill que no vaya
   a usarse — respeta la carga perezosa: solo anota su nombre para
   mencionarlo.
4. Devuelve (a quien te haya invocado, `@orchestrator`) una lista breve
   tipo:
   - developer: [skill-x, skill-y]
   - frontend-expert: [skill-z]
   - backend-expert: [skill-w]

   Si no hay ninguna skill de proyecto relevante además de las globales
   fijas (`code-auditor`, `ui-ux-heuristics`, `security-checker`), dilo
   explícitamente en vez de forzar una recomendación.

## Cuándo usarme

Justo después de que `ARCHITECTURE.md` exista y antes de invocar a
`developer`, `frontend-expert` y `backend-expert` en FASE 2. No antes (no
hay stack aún que analizar) ni después (ya es tarde para incluirlo en el
prompt de invocación).

## Nota sobre skills de proyecto

Si este proyecto necesita una skill que no existe todavía ni en global ni
en local, sugiere crearla en `.opencode/skills/<nombre>/SKILL.md` en vez
de intentar improvisar el conocimiento inline — así queda reutilizable
para la siguiente iteración del pipeline sobre el mismo proyecto. Si la
necesidad es genérica del stack (React, testing, deploy...) y podría
existir en el ecosistema abierto, usa la skill `skill-discovery` para
buscarla e instalarla con el mismo criterio.
