---
name: qa-release-checklist
description: Checklist final de convergencia para redactar NEXT_STEPS.md — completado, pendiente, riesgos abiertos y siguientes pasos accionables. Úsala desde @qa-reviewer al cerrar una iteración del pipeline.
license: MIT
compatibility: opencode
metadata:
  used-by: qa-reviewer
---

## Antes de escribir NEXT_STEPS.md, confirma que tienes

- El resultado de `@testing-expert` (qué se probó, qué no).
- Los hallazgos de `@frontend-expert` y `@backend-expert`, con su
  prioridad.
- Cualquier desviación que `@developer` haya anotado respecto a
  `ARCHITECTURE.md`.

## Estructura de NEXT_STEPS.md

```
# Next Steps — <fecha o nombre de iteración>

## Resumen ejecutivo
(3-5 líneas)

## Completado
- ...

## Pendiente / fuera de alcance
- ...

## Riesgos abiertos
- [severidad] descripción — origen (backend-expert/frontend-expert/testing-expert)

## Checklist accionable (por prioridad)
1. ...
2. ...
```

## Reglas

- No inventes cobertura ni mitigaciones que no ocurrieron.
- Cada riesgo abierto debe tener severidad y origen trazable a qué
  agente lo detectó — así la siguiente iteración sabe dónde volver a
  mirar primero.
- La sección **Completado** debe poder leerse como notas de release:
  qué cambió, para quién y qué debe saber quien despliega. Si la skill
  `writing-guidelines` está disponible, pásale ese resumen antes de
  cerrar.
- Este documento lo lee un humano para decidir qué hacer a continuación:
  prioriza que sea accionable sobre que sea exhaustivo.
