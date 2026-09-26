import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { execFile } from "node:child_process"

// Plugin V2 compatible con el loader actual.
// NO usa ADB/AHK: la rotación se realiza mediante Tor ControlPort
// a través de rate_limit_handler.bat -> rotate_tor.ps1.

const __ENV = (() => {
  const out = {}

  try {
    const raw = readFileSync(
      join(homedir(), ".config", "opencode", ".env"),
      "utf-8"
    )

    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()

      if (!t || t.startsWith("#")) continue

      const eq = t.indexOf("=")

      if (eq < 0) continue

      let v = t.slice(eq + 1).trim()

      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }

      out[t.slice(0, eq).trim()] = v
    }
  } catch {
    /* sin .env */
  }

  return out
})()

const cfg = (k, d) =>
  process.env[k] ?? __ENV[k] ?? d

// El wrapper pone esta variable a true.
// Fuera del wrapper permanece false y no se solicita NEWNYM.
const ROTATION_ENABLED =
  String(
    cfg(
      "OPENCODE_TOR_RATE_LIMIT_ROTATION_ENABLED",
      "false"
    )
  ).toLowerCase() === "true"

const COOLDOWN_MS = Number(
  cfg(
    "OPENCODE_RATE_LIMIT_COOLDOWN_MS",
    60_000
  )
)

const MAX_ATTEMPTS = Number(
  cfg(
    "OPENCODE_RATE_LIMIT_MAX_ATTEMPTS",
    2
  )
)

const RETRY_DELAY_MS = Number(
  cfg(
    "OPENCODE_RATE_LIMIT_RETRY_DELAY_MS",
    2_000
  )
)

const ATTEMPT_TIMEOUT_MS = Number(
  cfg(
    "OPENCODE_RATE_LIMIT_ATTEMPT_TIMEOUT_MS",
    15_000
  )
)

const HANDLER_BAT =
  cfg("OPENCODE_RATE_LIMIT_HANDLER", null) ??
  join(
    homedir(),
    ".config",
    "opencode",
    "hooks",
    "rate_limit",
    "rate_limit_handler.bat"
  )

let lastRun = 0
let isRotating = false

function log(level, message) {
  console.log(
    `[rate-limit-guard] [${level}] ${message}`
  )
}

function mentionsRateLimit(text) {
  const t = String(text ?? "").toLowerCase()

  return (
    t.includes("429") ||
    t.includes("rate limit") ||
    t.includes("rate_limit") ||
    t.includes("too many requests") ||
    t.includes("resource_exhausted") ||
    t.includes("resource exhausted")
  )
}

// Recoge texto de estructuras anidadas.
function collectText(value, depth = 0) {
  if (value == null || depth > 4) {
    return ""
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map((v) =>
        collectText(v, depth + 1)
      )
      .join(" ")
  }

  if (typeof value === "object") {
    return Object.values(value)
      .map((v) =>
        collectText(v, depth + 1)
      )
      .join(" ")
  }

  return ""
}

// Busca status HTTP 429 en cualquier nivel.
function hasStatus429(value, depth = 0) {
  if (value == null || depth > 4) {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((v) =>
      hasStatus429(v, depth + 1)
    )
  }

  if (typeof value === "object") {
    if (
      value.status === 429 ||
      value.statusCode === 429
    ) {
      return true
    }

    return Object.values(value).some((v) =>
      hasStatus429(v, depth + 1)
    )
  }

  return false
}

function looksLikeRateLimit(payload) {
  if (hasStatus429(payload)) {
    return true
  }

  return mentionsRateLimit(
    collectText(payload)
  )
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  )
}

function runHandlerOnce() {
  return new Promise(
    (resolve, reject) => {
      const child = execFile(
        "cmd",
        ["/c", HANDLER_BAT],
        {
          timeout: ATTEMPT_TIMEOUT_MS,
        },
        (err, stdout, stderr) => {
          if (stdout) {
            log(
              "debug",
              `handler stdout: ${String(stdout).trim()}`
            )
          }

          if (stderr) {
            log(
              "warn",
              `handler stderr: ${String(stderr).trim()}`
            )
          }

          if (err) {
            reject(err)
          } else {
            resolve()
          }
        }
      )

      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* best effort */
        }

        reject(
          new Error(
            `rate_limit_handler.bat superó ${ATTEMPT_TIMEOUT_MS}ms`
          )
        )
      }, ATTEMPT_TIMEOUT_MS + 1000)

      child.on("close", () =>
        clearTimeout(timer)
      )
    }
  )
}

async function runHandler() {
  if (!existsSync(HANDLER_BAT)) {
    throw new Error(
      `No se encuentra el archivo handler en: ${HANDLER_BAT}`
    )
  }

  return runHandlerOnce()
}

// Rotación con cooldown.
// Solo se ejecuta al detectar realmente un rate limit.
async function triggerRotation({
  reason = "auto",
}) {
  if (!ROTATION_ENABLED) {
    log(
      "debug",
      `Rotación ignorada: Tor no está habilitado por el wrapper (reason=${reason})`
    )

    return {
      success: false,
      reason: "tor no habilitado en este wrapper",
    }
  }

  const now = Date.now()

  if (
    now - lastRun <
    COOLDOWN_MS
  ) {
    const remaining =
      Math.ceil(
        (
          COOLDOWN_MS -
          (now - lastRun)
        ) / 1000
      )

    log(
      "info",
      `Rotación omitida por cooldown (${remaining}s restantes; reason=${reason})`
    )

    return {
      success: false,
      reason: `cooldown (${remaining}s)`,
    }
  }

  if (isRotating) {
    log(
      "warn",
      "Ya hay una rotación de Tor en progreso. Omitiendo..."
    )

    return {
      success: false,
      reason: "en ejecución",
    }
  }

  lastRun = now
  isRotating = true

  try {
    for (
      let attempt = 1;
      attempt <= MAX_ATTEMPTS;
      attempt++
    ) {
      log(
        "warn",
        `Solicitando nuevo circuito Tor [Origen: ${reason}] (intento ${attempt}/${MAX_ATTEMPTS})`
      )

      try {
        await runHandler()

        log(
          "info",
          `Rotación Tor completada correctamente en intento ${attempt}/${MAX_ATTEMPTS}`
        )

        return {
          success: true,
          attempt,
        }
      } catch (err) {
        log(
          "error",
          `Intento ${attempt}/${MAX_ATTEMPTS} fallido: ${
            err?.message || err
          }`
        )

        if (
          attempt <
          MAX_ATTEMPTS
        ) {
          await sleep(
            RETRY_DELAY_MS
          )
        }
      }
    }

    log(
      "error",
      `Rotación Tor fallida tras ${MAX_ATTEMPTS} intentos.`
    )

    return {
      success: false,
      reason:
        "fallaron todos los intentos",
    }
  } finally {
    isRotating = false
  }
}

export default {
  id: "rate-limit-guard",

  async setup(ctx) {
    log(
      "info",
      `Plugin cargado. Rotación Tor habilitada: ${ROTATION_ENABLED}`
    )

    if (!ROTATION_ENABLED) {
      log(
        "info",
        "Modo observación: el plugin no solicitará NEWNYM fuera del wrapper."
      )
    }

    // Suscripción a eventos OpenCode V2.
    const controller =
      new AbortController()

    void (async () => {
      try {
        for await (
          const raw of ctx.event.subscribe({
            signal:
              controller.signal,
          })
        ) {
          if (
            !raw ||
            typeof raw?.type !==
              "string"
          ) {
            continue
          }

          // OpenCode V2 usa raw.data.
          // raw.properties se mantiene por compatibilidad.
          const props =
            raw.data ??
            raw.properties ??
            {}

          const error =
            props.error

          const status =
            props.status

          /*
           * --------------------------------------------------
           * session.retry.scheduled
           * --------------------------------------------------
           *
           * Señal durable de que OpenCode ha programado
           * un retry. Solo actuamos si contiene 429/rate limit.
           */
          const isRetryScheduled =
            raw.type ===
              "session.retry.scheduled" &&
            looksLikeRateLimit(
              error ?? props
            )

          /*
           * --------------------------------------------------
           * session.status
           * --------------------------------------------------
           *
           * Compatibilidad con eventos retry efímeros.
           */
          const isRetrySignal =
            raw.type ===
              "session.status" &&
            status?.type === "retry" &&
            looksLikeRateLimit(
              status
            )

          /*
           * --------------------------------------------------
           * Eventos de fallo V2
           * --------------------------------------------------
           */
          const isFailedSignal =
            (
              raw.type ===
                "session.execution.failed" ||
              raw.type ===
                "session.step.failed" ||
              raw.type ===
                "session.tool.failed"
            ) &&
            looksLikeRateLimit(
              error ?? props
            )

          /*
           * Compatibilidad con versiones antiguas.
           */
          const isErrorSignal =
            raw.type ===
              "session.error" &&
            looksLikeRateLimit(
              error ?? props
            )

          const isRateLimit =
            isRetryScheduled ||
            isRetrySignal ||
            isFailedSignal ||
            isErrorSignal

          if (!isRateLimit) {
            /*
             * Si aparece la palabra rate-limit pero no encaja
             * en un evento 429 reconocido, registramos pero
             * NO rotamos.
             */
            if (
              mentionsRateLimit(
                collectText(props)
              )
            ) {
              log(
                "debug",
                `Mención de rate-limit no clasificada en ${raw.type}; no se rota.`
              )
            }

            continue
          }

          /*
           * Construimos una razón útil para los logs.
           */
          const reason =
            isRetryScheduled
              ? `auto_429_retry_scheduled (intento ${
                  props.attempt ?? "?"
                })`
              : isRetrySignal
                ? `auto_429_retry (intento ${
                    status?.attempt ?? "?"
                  })`
                : `auto_429_${raw.type}`

          /*
           * Aquí es donde se solicita NEWNYM.
           * El cooldown evita varias rotaciones por el mismo 429.
           */
          await triggerRotation({
            reason,
          })
        }
      } catch (err) {
        log(
          "error",
          `El stream de eventos terminó: ${
            err?.message ?? err
          }`
        )
      }
    })()

    /*
     * Limpieza al desmontar el plugin.
     */
    return () =>
      controller.abort()
  },
}