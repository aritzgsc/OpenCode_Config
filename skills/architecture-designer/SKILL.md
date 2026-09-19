---
name: architecture-designer
description: Checklist estructurado para diseñar ARCHITECTURE.md de forma consistente — stack, componentes, trade-offs, riesgos y convenciones. Úsala desde @architect al redactar la arquitectura de un proyecto o feature nueva.
license: MIT
compatibility: opencode
metadata:
  used-by: architect
---

## Checklist antes de escribir ARCHITECTURE.md

**Stack**
- ¿Por qué este lenguaje/framework y no otro razonable? (una frase basta,
  pero tiene que ser una razón real, no "es el que mejor conozco")
- ¿La base de datos elegida encaja con el patrón de acceso a datos
  esperado (lecturas vs escrituras, consistencia necesaria, volumen)?

**Componentes**
- ¿Cada componente tiene una responsabilidad clara y no solapada con
  otro?
- ¿Dónde están los límites (boundaries) entre capas/módulos?

**Trade-offs**
- Por cada decisión no trivial: ¿qué alternativa se descartó y por qué?
- ¿Qué se está sacrificando (rendimiento, simplicidad, coste, velocidad de
  desarrollo) a cambio de qué beneficio?

**Riesgos técnicos**
- Concurrencia/race conditions si hay estado compartido o async.
- Puntos de fallo único (single point of failure).
- Aspectos que `@backend-expert` debería mirar con lupa (auth, datos
  sensibles, entradas externas).
- Aspectos que `@testing-expert` debería priorizar (lógica compleja,
  rutas críticas de negocio).

**Convenciones**
- Estructura de carpetas esperada.
- Patrones a seguir (y a evitar) explícitamente, para que `@developer` no
  tenga que adivinar.

## Formato de salida

Usa encabezados Markdown por sección (Stack, Componentes, Decisiones y
trade-offs, Riesgos, Convenciones). No hace falta prosa larga: listas
concretas valen más que párrafos genéricos.
