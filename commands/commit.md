---
description: Cierra el trabajo en git. committer inspecciona los cambios, propone un commit (título y descripción según las convenciones del repo), acepta tus sugerencias y solo lo ejecuta tras tu aprobación explícita.
agent: committer
subagent: false
---

El usuario quiere consolidar cambios en git. Ejecuta tu flujo obligatorio
tal como define tu propia configuración de agente.

## Contexto automático del repositorio

!`git status --short 2>/dev/null || echo "Este directorio no es un repositorio git, o git no está disponible."`

Rama actual: !`git branch --show-current 2>/dev/null`

Últimos commits (para inferir las convenciones del repo):

!`git log --oneline -10 2>/dev/null`

Si el estado de arriba no muestra ningún cambio, avisa al usuario de que
no hay nada que consolidar y no propongas ningún commit.

## Pasos

1. Ejecuta `git diff` (staged y unstaged) con tu herramienta de bash para
   ver el cambio completo — no se incluye arriba automáticamente para no
   saturar el contexto con diffs grandes.
2. Revisión de seguridad: secretos, `.env`, binarios o rutas sospechosas.
3. Presenta la PROPUESTA de commit (ficheros, título, descripción) y
   DETENTE a esperar la respuesta del usuario.
4. Refina con sus sugerencias tantas veces como haga falta.
5. Ejecuta staging selectivo + commit SOLO tras aprobación explícita.

Contexto adicional del usuario (puede estar vacío): $ARGUMENTS
Úsalo como orientación (por ejemplo "solo el módulo de auth", "en inglés",
"divídelo en dos commits").

Recuerda tus prohibiciones absolutas: sin push, sin amend, sin force, sin
rebase, sin reset --hard, sin cambios de rama ni tags, sin `git add -A`
salvo petición expresa, y NUNCA un commit sin aprobación explícita previa
de la propuesta exacta.