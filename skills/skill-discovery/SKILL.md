---
name: skill-discovery
description: Descubre e instala skills del ecosistema abierto (npx skills) cuando el stack del proyecto pide conocimiento que no existe en local ni en global. Úsala desde @orchestrator o @developer en FASE 2 cuando el router find-skills no encuentre skill relevante. Basada en vercel-labs/skills@find-skills.
license: MIT
compatibility: opencode
metadata:
  used-by: orchestrator, developer
  sources:
    - vercel-labs/skills@find-skills
---

## Cuándo usarme

Cuando el router `find-skills` (pipeline) no encuentra ninguna skill
relevante para el stack de esta iteración y sospechas que el ecosistema
abierto sí la tiene (React, testing, deploy, docs, review, diseño...).
Complementa al router, no lo sustituye: primero el router, después esto.

## Procedimiento

1. **Entiende qué falta**: dominio (p. ej. React), tarea concreta
   (p. ej. optimizar rendimiento) y si es lo bastante común como para
   que exista una skill.
2. **Mira el leaderboard primero**: https://skills.sh/ — las más
   instaladas suelen ser las más probadas. Referencias fiables:
   `vercel-labs/agent-skills` (React, Next.js, diseño web),
   `anthropics/skills` (diseño frontend, testing web con Playwright).
3. **Busca** si el leaderboard no cubre la necesidad:
   ```bash
   npx skills find <query>
   ```
   Keywords específicas ("react testing" mejor que "testing"); prueba
   sinónimos si no hay resultados.
4. **Verifica calidad antes de recomendar** — no propongas por el mero
   hecho de aparecer en resultados:
   - Instalaciones: prefiere 1K+; cautela bajo 100.
   - Fuente: oficiales (`vercel-labs`, `anthropics`, `microsoft`) antes
     que autores desconocidos.
   - Riesgo: revisa el informe de seguridad de la instalación
     (Gen/Socket/Snyk). Con `risk: critical` o High Risk, NO instalar:
     reportarlo y seguir sin la skill.
5. **Instala a nivel de proyecto** cuando la skill sea específica del
   stack de este proyecto (queda reutilizable para la siguiente
   iteración):
   ```bash
   npx skills add <owner/repo@skill> -a opencode -y
   ```
   Solo `-g` (global) si aporta valor a todos los proyectos: las skills
   globales consumen contexto en todas las sesiones.
6. **Si no existe nada**: dilo explícitamente, ayuda con capacidades
   generales y sugiere crear una skill local en
   `.opencode/skills/<nombre>/SKILL.md` si la necesidad se va a repetir.
   Si la skill `skill-creator` está disponible, úsala como método para
   redactarla (intento, trigger, formato de salida) y para mejorar las
   existentes.

## Ya disponibles en este entorno (no reinstalar)

**Pipeline (`.config/opencode/skills`, adaptadas al pipeline):**
`ui-ux-heuristics`, `test-strategy`, `security-checker`, `product-brief`,
`code-auditor`, `architecture-designer`, `qa-release-checklist`,
`find-skills` (router), `skill-discovery` (esta).

**Ecosistema (`npx skills`, tal cual del autor):**
- Vercel: `vercel-react-best-practices`, `web-design-guidelines`,
  `writing-guidelines`, `find-skills`
- Anthropic: `frontend-design`, `webapp-testing`, `skill-creator`
- Matt Pocock: `code-review`, `diagnosing-bugs`, `grill-me`, `grilling`
- obra/superpowers: `brainstorming`, `systematic-debugging`,
  `verification-before-completion`, `writing-plans`,
  `receiving-code-review`, `test-driven-development`,
  `finishing-a-development-branch`
- Otros: `backend-development`, `api-security-testing`,
  `production-code-audit` (NO usar: riesgo crítico, ver nota abajo)

**No instalar / no cablear aunque aparezcan en búsquedas:**
- `production-code-audit` (sickn33): marcada `risk: critical` por el
  propio autor y High Risk en la evaluación — el pipeline ya cubre su
  contenido con `code-auditor` + expertos.

## Nota de namespaces

Las skills de `obra/superpowers` se referencian entre sí con prefijo
(`superpowers:test-driven-development`). En este entorno la instalación
es plana: ese nombre equivale a la skill `test-driven-development` tal
cual. Lo mismo para cualquier `superpowers:<x>` → `<x>`.
