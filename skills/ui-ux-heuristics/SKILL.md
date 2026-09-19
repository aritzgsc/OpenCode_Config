---
name: ui-ux-heuristics
description: Auditoría UI/UX para @frontend-expert — guidelines web de Vercel (vía fetch remoto), principios de diseño distintivo de Anthropic, heurísticas de Nielsen y checklist WCAG mínimo, con formato de hallazgos del pipeline. Úsala desde @frontend-expert al revisar código o markup de interfaz en FASE 2.
license: MIT
compatibility: opencode
metadata:
  used-by: frontend-expert
  sources:
    - vercel-labs/agent-skills@web-design-guidelines
    - anthropics/skills@frontend-design
---

## Paso 0 — Guidelines remotas de Vercel (si hay red)

Antes de auditar, intenta traer las reglas oficiales frescas con WebFetch:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

El documento traído contiene sus propias reglas y su formato de salida
(`file:line` escueto). Aplícalo a los ficheros de presentación que te
asignó `@developer`. Si no hay red o el fetch falla, sigue con el
checklist local de abajo — nunca bloquees la revisión por esto.

## Diseño distintivo (resumen operativo de `frontend-design`)

No entregues el "default generado": fondo crema + serif + acento
terracota, modo oscuro + un acento ácido, tarjetas SaaS idénticas con la
misma sombra, eyebrows en ALL-CAPS con tracking, `→` en cada botón.
Donde el brief fija dirección visual, síguelo al pie de la letra; donde
lo deja libre, no gastes esa libertad en un default.

- Trabaja en dos pasadas: plan corto (paleta 4-6 hex, 1-2 tipografías con
  roles, concepto de layout, principios) → revísalo contra el brief →
  luego código.
- La audacia en un solo sitio; el resto, quieto y disciplinado.
- El copy es contenido, no decoración: voz activa, un trabajo por
  elemento, errores que explican qué pasó y cómo arreglarlo, vacíos que
  invitan a actuar.
- Suelo de calidad sin anunciarlo: responsive, foco visible de teclado,
  `prefers-reduced-motion` respetado, contraste suficiente.

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

## Rendimiento de interfaz (solo si el stack es React/Next.js)

Si la skill `vercel-react-best-practices` está disponible y el proyecto
usa React, aplica sus reglas de mayor impacto al auditar: waterfalls
(`async-parallel`, Suspense), bundle (no barrel imports, `next/dynamic`
para lo pesado), re-renders (memo donde duele, nada de componentes
definidos dentro de componentes). Si no está disponible, al menos
señala re-renders innecesarios, listas grandes sin virtualizar e
imágenes sin optimizar.

## Formato de hallazgos (pipeline)

Cada hallazgo: qué heurística/criterio incumple + dónde (fichero/línea)
+ prioridad (bloqueante/importante/mejora menor). Prioriza lo bloqueante
para usuarios reales sobre preferencias estéticas subjetivas. Lo que
`@testing-expert` deba cubrir y no sea obvio desde tu diff, anótalo en
`RIESGOS_Y_DUDAS` de tu entrega — no crees ni ejecutes tests tú.

## Cuándo usarme

Desde `@frontend-expert` al revisar código o markup de interfaz en
FASE 2, dentro de su ámbito (solo ficheros de presentación/cliente).
