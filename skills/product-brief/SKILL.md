---
name: product-brief
description: Plantilla de estructura para README.md como brief de producto — problema, usuarios, alcance, criterios de éxito. Úsala desde @tech-product al redactar el README inicial de un proyecto o feature.
license: MIT
compatibility: opencode
metadata:
  used-by: tech-product
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
