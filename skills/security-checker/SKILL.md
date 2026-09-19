---
name: security-checker
description: Checklist de auditoría de seguridad — validación de entradas, autenticación/autorización, exposición de datos, dependencias. Úsala desde @backend-expert al auditar el código producido en FASE 2.
license: MIT
compatibility: opencode
metadata:
  used-by: backend-expert
---

## Áreas a cubrir

**Entradas no confiables**
- ¿Toda entrada de usuario/red se valida y sanitiza antes de usarse (SQL,
  comandos de shell, rutas de fichero, deserialización)?
- ¿Hay límites de tamaño/rate en endpoints expuestos?

**Autenticación y autorización**
- ¿Cada operación sensible comprueba identidad Y permisos, no solo
  identidad?
- ¿Hay rutas que deberían requerir auth y no la requieren?

**Datos sensibles**
- ¿Hay secretos/credenciales hardcodeados o en el histórico de git?
- ¿Los datos sensibles se registran (logs) sin querer?
- ¿El transporte es cifrado donde corresponde?

**Dependencias**
- Si el stack lo permite, ejecuta (con aprobación de bash) el scanner
  correspondiente: `npm audit`, `pip-audit`, `cargo audit`,
  `govulncheck`, etc.
- Señala dependencias con vulnerabilidades conocidas Y su severidad real
  (no todas las CVEs son explotables en el contexto de este proyecto).

## Formato de hallazgos

Cada hallazgo: severidad (crítica/alta/media/baja) + ubicación concreta +
por qué es un problema + qué haría falta para explotarlo. Sin ubicación
concreta, un hallazgo no es accionable.
