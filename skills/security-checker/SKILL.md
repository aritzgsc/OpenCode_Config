---
name: security-checker
description: Auditoría de seguridad para @backend-expert — validación de entradas, auth/autorización, OWASP API Top 10 2023 (BOLA, mass assignment, auth a nivel de función), exposición de datos y dependencias. Úsala al auditar el código producido en FASE 2.
license: MIT
compatibility: opencode
metadata:
  used-by: backend-expert
  sources:
    - usestrix/strix@api-security-testing
    - mrgoonie/claudekit-skills@backend-development
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

**Autorización a nivel de API (OWASP API Top 10 2023 — lo que más rompe)**
- **API1 BOLA/IDOR**: ¿un usuario puede acceder al objeto de otro
  cambiando un ID? La prueba mental exige dos identidades de distinto
  tenant: acceder con el token B a un objeto del tenant A debe fallar.
  Todo acceso por ID debe comprobar propiedad, no solo existencia.
- **API3 Propiedad de objeto**: ¿las respuestas devuelven solo los
  campos necesarios (nada de serializar el modelo entero)? ¿los
  PATCH/PUT aceptan solo campos permitidos (whitelist, nunca
  `req.body` directo — mass assignment)?
- **API5 Función**: ¿las rutas admin/internas rechazan tokens de
  privilegio bajo? Probar con el token menos privilegiado, no con el
  de admin.
- **API4 Consumo**: ¿paginación en listados, límites en uploads/payloads,
  profundidad/complexity acotada si hay GraphQL?

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

## Pentesting dinámico (opcional, solo a petición)

Si el proyecto expone una API propia y el usuario pide un pentest
activo, la skill `api-security-testing` (Strix) automatiza enumeración
desde OpenAPI/Postman y explotación de estas mismas clases OWASP con
PoC. Requiere binario `strix` + credenciales de prueba y **solo contra
APIs propias o con autorización explícita** — nunca escanear APIs
ajenas. Sin esa petición o sin el tooling, la revisión estática de
arriba es suficiente y obligatoria.

## Profundidad por stack

Si la skill `backend-development` está disponible, consulta sus
referencias según el tema (`backend-security.md` para OWASP Top 10,
`backend-authentication.md` para OAuth 2.1/JWT/RBAC, `backend-api-design.md`
para patrones REST/GraphQL/gRPC). Son material de consulta, no sustituto
de esta checklist.

## Formato de hallazgos

Cada hallazgo: severidad (crítica/alta/media/baja) + ubicación concreta +
por qué es un problema + qué haría falta para explotarlo. Sin ubicación
concreta, un hallazgo no es accionable. Lo que `@testing-expert` deba
cubrir y no sea obvio desde tu diff, anótalo en `RIESGOS_Y_DUDAS`.
