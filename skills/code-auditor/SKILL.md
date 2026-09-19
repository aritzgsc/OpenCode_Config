---
name: code-auditor
description: Checklist de autorrevisión de código antes de darlo por terminado — nombres, manejo de errores, edge cases, TODOs y mínimo de production-readiness. Úsala desde @developer sobre su propio código justo antes de entregarlo.
license: MIT
compatibility: opencode
metadata:
  used-by: developer
---

## Checklist de autorrevisión

**Correctitud**
- ¿Maneja explícitamente los casos límite obvios (vacío, nulo, cero,
  colección de un solo elemento, concurrencia si aplica)?
- ¿Los errores se propagan o se registran de forma que sean depurables,
  en vez de tragarse en silencio?

**Legibilidad**
- ¿Los nombres de variables/funciones dicen qué hacen sin necesitar el
  comentario de al lado?
- ¿Hay lógica duplicada que debería extraerse?

**Production-readiness mínimo**
- ¿Cero secretos, credenciales o código de depuración olvidados?
- ¿Los errores se registran con contexto útil y sin datos sensibles?
- Si expone un servicio: ¿tiene forma de saber si está vivo (health
  check) y de limitar el abuso (tamaños, rate) o está documentado por
  qué no lo necesita?

**Consistencia con ARCHITECTURE.md**
- ¿Sigue la estructura de carpetas y patrones que definió `@architect`?
- Si te desviaste del diseño en algún punto, ¿lo dejaste anotado para que
  `@testing-expert` y `@qa-reviewer` lo vean?

**Antes de entregar**
- ¿Quedan `TODO`/`FIXME`/código comentado que debería resolverse o al
  menos mencionarse explícitamente en el resumen final?
- ¿El proyecto compila/arranca/pasa un smoke test mínimo?

## Cuándo usarme

Justo antes de devolver el control a `@orchestrator`, no al principio de
la tarea — esto es una pasada final, no una guía de cómo escribir el
código.
