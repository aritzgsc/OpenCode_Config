---
name: test-strategy
description: Estrategia de testing para @testing-expert — pirámide unit/integración/E2E, prioridad de cobertura guiada por CHANGELOG, protocolo de re-verificación y E2E en navegador con Playwright (scripts incluidos). Úsala al validar lo producido en FASE 2.
license: MIT
compatibility: opencode
metadata:
  used-by: testing-expert
  sources:
    - anthropics/skills@webapp-testing
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
2. Sección **Puntos que testing debe verificar** del `CHANGELOG.md` —
   cúbrela punto por punto y declara qué pasó con cada uno.
3. Hallazgos "bloqueante"/"crítico" de `@backend-expert` y
   `@frontend-expert`.
4. Edge cases de lógica nueva compleja.
5. El resto.

## E2E en navegador con Playwright

Si hay app navegable, usa Playwright MCP si está habilitado; si no,
Playwright nativo con este patrón (ver `examples/`):

1. **Reconocimiento y luego acción**: navega, espera `networkidle`
   (CRÍTICO en apps dinámicas antes de inspeccionar el DOM), captura o
   inspecciona, identifica selectores del estado renderizado, actúa.
2. **Servidores gestionados como caja negra**: `scripts/with_server.py`
   levanta backend+frontend, espera los puertos y ejecuta tu script —
   úsalo directamente sin leer su código salvo que algo falle:
   ```bash
   python scripts/with_server.py --server "npm run dev" --port 5173 -- python tu_test.py
   ```
   Ejecútalo siempre con `--help` primero. Chromium en headless, cierra
   el navegador al terminar, selectores descriptivos (`text=`, `role=`).
3. **Antes de reportar `ROTO`, confirma reproducibilidad**: re-ejecuta
   SOLO el test fallido una segunda vez. Si persiste, es real; si
   desaparece, regístralo como inestable en `RIESGOS` (nombre + "falló
   una vez y pasó al repetirlo") y evalúa con normalidad. No aplica a
   fallos de build/lint/typecheck.
4. Si no hay runner E2E disponible, regístralo como "no probado — sin
   runner E2E". No inventes resultados de navegador.

## Qué reportar

- Qué se probó y con qué resultado (comandos exactos).
- Qué NO se probó y por qué (falta de tiempo, dependencia externa no
  disponible en este entorno, etc.) — no dejar cobertura ambigua sin
  decirlo.
- Si algo falla por una decisión de diseño (no un bug de
  implementación), no lo arregles tú: repórtalo para que `@qa-reviewer`
  lo refleje en `NEXT_STEPS.md`.

## Reglas del pipeline (no negociables)

- Eres el ÚNICO agente que crea y ejecuta tests. NO corrijas nada tú
  mismo: diagnostica con precisión para `@developer`.
- En re-verificación tras una corrección: ejecuta primero los tests que
  fallaban y después la suite completa (o el subconjunto afectado) antes
  de declarar `OK`.
- Si la skill `test-driven-development` está disponible: cada test de
  regresión nuevo debe pasar su ciclo rojo-verde (falla sin el fix, pasa
  con el fix) y afirmar comportamiento real, no implementación. Un test
  que pasa a la primera sin haberlo visto fallar no prueba nada.
