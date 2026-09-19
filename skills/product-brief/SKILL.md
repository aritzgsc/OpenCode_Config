---
name: product-brief
description: Plantilla de estructura para README.md como brief de producto — problema, usuarios, alcance, criterios de éxito — más pase de prosa con las writing guidelines de Vercel. Úsala desde @tech-product al redactar el README inicial de un proyecto o feature.
license: MIT
compatibility: opencode
metadata:
  used-by: tech-product
  sources:
    - vercel-labs/agent-skills@writing-guidelines
---

## Estructura recomendada de README.md

```
# <Nombre del proyecto/feature>

## Problema
¿Qué situación real motiva esto? ¿Qué pasa si no se hace?

## Usuarios / casos de uso
¿Quién lo usa y para qué, en 1-2 escenarios concretos?

## Alcance
### Incluye
- ...
### NO incluye (explícitamente, en esta iteración)
- ...

## Criterios de éxito
¿Cómo se sabe que funcionó? Preferible medible ("reduce el tiempo de X en
Y%") sobre vago ("mejora la experiencia").

## Restricciones conocidas
Plazos, integraciones obligatorias, limitaciones técnicas o de negocio ya
conocidas antes de diseñar la arquitectura.
```

## Cómo usarla

Rellena cada sección con contenido concreto del proyecto real — esta
plantilla es la estructura, no el contenido. Si una sección no aplica,
dilo explícitamente ("Sin restricciones conocidas") en vez de omitirla.

## Pase de prosa (antes de entregar el README)

Un brief se lee, así que la prosa importa. Si la skill
`writing-guidelines` está disponible, o con red para traerla:

```
https://raw.githubusercontent.com/vercel-labs/writing-guidelines/main/command.md
```

aplica sus reglas al README: voz activa, un trabajo por frase, nada de
relleno corporativo ("mejorar la experiencia") sin decir cómo, para quién
y cómo se mide. Sin red, aplica el mínimo: frases cortas, verbos
concretos, cero adjetivos vacíos.
