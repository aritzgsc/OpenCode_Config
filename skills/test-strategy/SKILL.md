---
name: test-strategy
description: Guía para decidir qué tipo de test (unitario, integración, end-to-end) aplica a cada cambio y qué constituye cobertura suficiente. Úsala desde @testing-expert al validar lo producido en FASE 2.
license: MIT
compatibility: opencode
metadata:
  used-by: testing-expert
---

## Qué tipo de test para qué

- **Unitario**: lógica de negocio pura, funciones con entradas/salidas
  claras, edge cases (vacío, límites, errores esperados).
- **Integración**: interacción entre componentes propios (p. ej. capa de
  datos + lógica de negocio) o con dependencias externas mockeadas.
- **End-to-end**: solo para los flujos críticos de negocio identificados
  en `README.md`/`ARCHITECTURE.md` — no todo necesita un E2E, es caro de
  mantener.

## Prioridad de cobertura (si el tiempo es limitado)

1. Rutas críticas de negocio (las que, si fallan, rompen el propósito
   principal del proyecto).
2. Hallazgos "bloqueante"/"crítico" de `@backend-expert` y
   `@frontend-expert`.
3. Edge cases de lógica nueva compleja.
4. El resto.

## Qué reportar

- Qué se probó y con qué resultado.
- Qué NO se probó y por qué (falta de tiempo, dependencia externa no
  disponible en este entorno, etc.) — no dejar cobertura ambigua sin
  decirlo.
- Si algo falla por una decisión de diseño (no un bug de
  implementación), no lo arregles tú: repórtalo para que `@qa-reviewer`
  lo refleje en `NEXT_STEPS.md`.
