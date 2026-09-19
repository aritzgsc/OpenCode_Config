---
name: ui-ux-heuristics
description: Heurísticas de usabilidad de Nielsen y checklist básico de accesibilidad WCAG para auditar UI/UX. Úsala desde @frontend-expert al revisar código o markup de interfaz en FASE 2.
license: MIT
compatibility: opencode
metadata:
  used-by: frontend-expert
---

## Las 10 heurísticas de Nielsen (aplicadas a código/markup)

1. Visibilidad del estado del sistema — ¿hay feedback ante acciones
   (loading, éxito, error)?
2. Coherencia entre el sistema y el mundo real — lenguaje/iconos
   familiares.
3. Control y libertad del usuario — ¿hay forma de deshacer/cancelar?
4. Consistencia y estándares — mismos patrones para las mismas acciones
   en toda la interfaz.
5. Prevención de errores — validación antes de que el error ocurra, no
   solo mensaje después.
6. Reconocer antes que recordar — no exigir memorizar información entre
   pantallas.
7. Flexibilidad y eficiencia de uso — atajos para usuarios avanzados sin
   penalizar a los nuevos.
8. Diseño estético y minimalista — sin ruido visual/información
   irrelevante.
9. Ayudar a reconocer y recuperarse de errores — mensajes de error
   concretos, no genéricos ("algo salió mal").
10. Ayuda y documentación — accesible cuando hace falta, sin ser
    obligatoria.

## Checklist WCAG mínimo

- Contraste de color suficiente (texto vs fondo).
- Toda imagen informativa tiene `alt` significativo (no vacío ni
  "imagen").
- Navegable por teclado (foco visible, orden lógico, sin trampas de
  foco).
- Labels asociados correctamente a inputs de formulario.
- Jerarquía semántica de encabezados (no saltar de h1 a h4).

## Formato de hallazgos

Cada hallazgo: qué heurística/criterio incumple + dónde + prioridad
(bloqueante/importante/mejora menor). Prioriza lo bloqueante para
usuarios reales sobre preferencias estéticas subjetivas.
