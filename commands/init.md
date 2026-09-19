---
description: Bootstrap del proyecto (AGENTS.md) y arranque del pipeline completo con @orchestrator. Solo para la primera iteración o una redefinición total.
agent: orchestrator
---

Este es el arranque del pipeline multi-agente para este proyecto.

## 0. Guarda de re-inicialización

Comprueba si ya existen `README.md` o `ARCHITECTURE.md` generados por una
iteración anterior del pipeline. Si existen, NO los sobreescribas: informa
al usuario de que el proyecto ya fue inicializado y sugiere las vías
correctas — `/ideas` para redefinir el producto conversando, `/next` para
continuar con lo pendiente. Solo continúa con este bootstrap si el usuario
confirma explícitamente que quiere reinicializar.

## 1. Bootstrap de AGENTS.md

Comprueba si existe `AGENTS.md` en la raíz del proyecto.

- Si NO existe: analiza el repositorio (lenguaje, gestor de paquetes,
  framework, comandos de build/lint/test, estructura no evidente por los
  nombres de fichero, convenciones visibles, otras fuentes de reglas ya
  presentes como `.cursor/rules`, `.github/copilot-instructions.md` o
  `CLAUDE.md`) y créalo con esa información, siguiendo el mismo criterio
  que usa el `/init` nativo de OpenCode.
- Si YA existe: no lo reescribas por completo. Solo amplíalo si le falta
  contenido relevante que hayas detectado.

En ambos casos, asegúrate de que `AGENTS.md` incluye este bloque (añádelo si
falta; no lo dupliques si ya está):

```md
## Pipeline de agentes (@orchestrator)

Este proyecto usa el pipeline global definido en `~/.config/opencode/agents/`.
Ficheros dinámicos que el pipeline lee y escribe en la raíz del proyecto:

- @README.md — brief de producto (dueño único: @tech-product, en cualquier modo)
- @ARCHITECTURE.md — diseño técnico (dueño único: @architect, en cualquier modo)
- @CHANGELOG.md — auditoría acumulativa de cada iteración (la escribe @developer)
- @NEXT_STEPS.md — veredicto de QA y checklist de la siguiente iteración (lo escribe @qa-reviewer)

Comandos del pipeline:

- /init — bootstrap + primera iteración completa
- /ideas — descubrimiento conversacional con @tech-product que actualiza el
  README y arranca el pipeline automáticamente
- /next — iteración incremental: @developer trabaja desde la checklist de
  NEXT_STEPS.md (o un alcance acotado por argumento) y el pipeline continúa
  igual (expertos → testing → QA)
- /do — iteración incremental dirigida por un prompt explícito y obligatorio
  del usuario, fuera de la checklist; mismo pipeline que /next a partir de
  @developer
- /fix — corrección directa de uno o varios bugs simples y acotados: se
  salta el pipeline entero salvo @developer (sin expertos, sin testing, sin
  QA). No usar para features ni para nada con implicaciones de seguridad,
  UX o arquitectura — @developer puede rechazar el encargo si lo detecta
- /loop — bucle autónomo: encadena ciclos de implementación + testing + QA
  + documentación + commit SIN pedir aprobación entre pasos, hasta cumplir
  el objetivo o toparse con un freno (decisión humana, ambigüedad de
  producto, estancamiento, tope de ciclos). Hace commits por su cuenta —
  revisa el resultado con /status o `git log` al terminar
- /status — resumen de solo lectura del estado del pipeline; si faltan
  artefactos, los reconstruye antes por análisis retrospectivo
- /review — auditoría puntual de @qa-reviewer sobre el git diff actual, sin
  cerrar iteración ni tocar NEXT_STEPS.md
- /documentate — sincroniza @README.md y @ARCHITECTURE.md con el código real
  y la conversación en curso, vía @tech-product y @architect; no toca código
  ni continúa el pipeline
- /commit — @committer propone un commit (título + descripción), lo refina
  con sugerencias y solo lo ejecuta tras aprobación explícita

CRITICAL: carga estos ficheros con la herramienta read solo cuando la tarea
concreta los necesite (carga perezosa), no de forma preventiva. Trátalos
como instrucciones obligatorias una vez cargados.
```

## 2. Arranque de FASE 1

Una vez `AGENTS.md` está listo, arranca la FASE 1 del pipeline: invoca al
subagente `tech-product` (herramienta `task`) para que entreviste al usuario
sobre el objetivo del proyecto/feature y produzca `README.md`.

A partir de aquí sigue exactamente la secuencia de fases descrita en
`agents/orchestrator.md`.

## Contrato del pipeline

La secuencia es obligatoria:

1. `tech-product` → `README.md`
2. `architect` → `ARCHITECTURE.md`
3. `developer` → implementación principal
4. `developer` delega obligatoriamente y en paralelo:
   - `frontend-expert`
   - `backend-expert`
5. `developer` espera a ambos expertos, revisa todos sus cambios y produce
   o actualiza `CHANGELOG.md` con la auditoría final. Ni `developer` ni los
   expertos ejecutan tests (solo build/lint/typecheck): eso es tarea
   exclusiva del siguiente paso.
6. `testing-expert` crea y ejecuta los tests. Si algo queda roto, corrige
   `developer` en `MODO: FIX` (con el diagnóstico exacto como encargo) y
   `testing-expert` vuelve a verificar — hasta 3 intentos.
7. `qa-reviewer` → `NEXT_STEPS.md`. Ya no evalúa fallos técnicos (se
   resolvieron o se agotó el intento en el paso 6): juzga si lo construido
   cumple lo pedido, a partir de LEER (nunca ejecuta tests ni bash) y, si
   hay una app navegable con Playwright MCP disponible, de observarla
   visualmente — eso no es testing, es la misma clase de verificación que
   haría leyendo, aplicada a lo que se ve en pantalla.

No saltes del paso 3 al testing aunque la implementación principal parezca
sencilla. Los dos expertos de FASE 2 son una barrera obligatoria de revisión
y mejora antes de testing. Las únicas excepciones son `/fix` (llega solo
hasta `developer`, sin expertos, sin testing, sin QA, para bugs acotados) y
las remediaciones de los pasos 6 y 7 (usan `MODO: FIX` en `developer`, sin
repetir la ronda de expertos) — son propiedades explícitas de esos flujos,
no atajos disponibles en cualquier otro. `/loop` no añade una excepción
nueva: encadena varias iteraciones completas de esta misma secuencia, una
detrás de otra, sin pedir aprobación entre ellas, y con los mismos topes de
remediación que cualquier iteración manual.

Al terminar la iteración, sugiere al usuario cerrarla con `/commit` y
continuar con `/next`, `/do`, `/ideas` o, si quiere que el sistema siga
solo varias iteraciones más, `/loop`.
