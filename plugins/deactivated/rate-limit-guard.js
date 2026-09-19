import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { execFile } from "node:child_process"
// Sin `import { Plugin } from "@opencode/plugin"`: el loader V2 no resuelve
// paquetes con scope desde plugins/ ("Cannot find package"); el objeto
// { id, setup } carga bien (igual que ntfy.js).

// --- Config desde .env: entorno > .env > defecto (parser minimo KEY=valor) --
const __ENV = (() => {
  const out = {}
  try {
    const raw = readFileSync(join(homedir(), ".config", "opencode", ".env"), "utf-8")
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const eq = t.indexOf("=")
      if (eq < 0) continue
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      out[t.slice(0, eq).trim()] = v
    }
  } catch {
    /* sin .env: se usan entorno y defectos */
  }
  return out
})()
const cfg = (k, d) => process.env[k] ?? __ENV[k] ?? d

const COOLDOWN_MS = Number(cfg("OPENCODE_RATE_LIMIT_COOLDOWN_MS", 60_000))
const MAX_ATTEMPTS = Number(cfg("OPENCODE_RATE_LIMIT_MAX_ATTEMPTS", 3))
const RETRY_DELAY_MS = Number(cfg("OPENCODE_RATE_LIMIT_RETRY_DELAY_MS", 5_000))
const ATTEMPT_TIMEOUT_MS = Number(cfg("OPENCODE_RATE_LIMIT_ATTEMPT_TIMEOUT_MS", 20_000))

// Ruta por defecto (activa): hooks/rate_limit/rate_limit_handler.bat.
// OJO: con la guardia desactivada ese fichero vive hoy en
// hooks/deactivated/rate_limit/; si se reactiva sin moverlo, runHandler()
// falla en cerrado (throw "No se encuentra...") y no se ejecuta nada.
// Se puede forzar otra con OPENCODE_RATE_LIMIT_HANDLER (fuera del contrato de 19 keys).
const HANDLER_BAT =
  cfg("OPENCODE_RATE_LIMIT_HANDLER", null) ??
  join(homedir(), ".config", "opencode", "hooks", "rate_limit", "rate_limit_handler.bat")

let lastRun = 0
let isRotating = false

function log(level, message) {
  console.log(`[rate-limit-guard] [${level}] ${message}`)
}

function mentionsRateLimit(text) {
  const t = String(text ?? "").toLowerCase()
  return (
    t.includes("429") ||
    t.includes("rate limit") ||
    t.includes("rate_limit") ||
    t.includes("too many requests") ||
    t.includes("quota") ||
    t.includes("resource_exhausted") ||
    t.includes("resource exhausted")
  )
}

// Recoge texto de estructuras anidadas (V2: data.error = { type, message, status }).
function collectText(value, depth = 0) {
  if (value == null || depth > 4) return ""
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map((v) => collectText(v, depth + 1)).join(" ")
  if (typeof value === "object") {
    return Object.values(value)
      .map((v) => collectText(v, depth + 1))
      .join(" ")
  }
  return ""
}

// Busca un status HTTP 429 en cualquier nivel (V2 usa `status`, V1 usaba `statusCode`).
function hasStatus429(value, depth = 0) {
  if (value == null || depth > 4) return false
  if (Array.isArray(value)) return value.some((v) => hasStatus429(v, depth + 1))
  if (typeof value === "object") {
    if (value.status === 429 || value.statusCode === 429) return true
    return Object.values(value).some((v) => hasStatus429(v, depth + 1))
  }
  return false
}

function looksLikeRateLimit(payload) {
  if (hasStatus429(payload)) return true
  // Cubre error.type = "provider.quota" y mensajes como
  // "Rate limit exceeded. Please try again later."
  return mentionsRateLimit(collectText(payload))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runHandlerOnce() {
  return new Promise((resolve, reject) => {
    const child = execFile("cmd", ["/c", HANDLER_BAT], { timeout: ATTEMPT_TIMEOUT_MS }, (err) => {
      if (err) reject(err)
      else resolve()
    })
    // execFile con `timeout` ya mata el proceso; este temporizador es
    // una red de seguridad con el mismo mensaje que en V1.
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* best effort */
      }
      reject(new Error(`rate_limit_handler.bat superó ${ATTEMPT_TIMEOUT_MS}ms`))
    }, ATTEMPT_TIMEOUT_MS + 1000)
    child.on("close", () => clearTimeout(timer))
  })
}

async function runHandler() {
  if (!existsSync(HANDLER_BAT)) {
    throw new Error(`No se encuentra el archivo handler en: ${HANDLER_BAT}`)
  }
  // En Windows 11 nativo se ejecuta directamente mediante cmd.exe
  return runHandlerOnce()
}

// Rotacion con cooldown + reintentos; solo el trigger manual ignora el cooldown.
async function triggerRotation({ reason = "auto", ignoreCooldown = false }) {
  const now = Date.now()

  if (!ignoreCooldown && now - lastRun < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastRun)) / 1000)
    log("info", `Rotación omitida por cooldown (${remaining}s restantes)`)
    return { success: false, reason: `cooldown (${remaining}s)` }
  }

  if (isRotating) {
    log("warn", "Ya hay una rotación de IP en progreso. Omitiendo...")
    return { success: false, reason: "en ejecución" }
  }

  lastRun = now
  isRotating = true

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      log("warn", `Iniciando rotación de IP [Origen: ${reason}] (intento ${attempt}/${MAX_ATTEMPTS})`)
      try {
        await runHandler()
        log("info", `Rotación de IP completada con éxito en intento ${attempt}/${MAX_ATTEMPTS}`)
        return { success: true, attempt }
      } catch (err) {
        log("error", `Intento ${attempt}/${MAX_ATTEMPTS} fallido: ${err.message || err}`)
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
      }
    }

    log("error", `Rotación de IP fallida tras ${MAX_ATTEMPTS} intentos.`)
    return { success: false, reason: "fallaron todos los intentos" }
  } finally {
    isRotating = false
  }
}

export default {
  id: "rate-limit-guard",
  async setup(ctx) {
    // 1. Herramienta para rotación manual en cualquier momento.
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "rotate_ip",
        description: "Rota manualmente la IP del dispositivo móvil conectado vía ADB (ignora el cooldown).",
        input: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        async execute() {
          const res = await triggerRotation({ reason: "manual_trigger", ignoreCooldown: true })
          if (res.success) {
            return { content: "Rotación de IP ejecutada correctamente." }
          }
          return { content: `Error al rotar IP: ${res.reason}. Consulta rate_limit_handler.log para más detalles.` }
        },
      })
    })

    // 2. Escucha de eventos automaticos 429 (tipos V2):
    // - session.retry.scheduled: { sessionID, attempt, error: { type, message, status? } }
    //   (senal durable de reintento).
    // - session.step.failed + session.execution.failed (llegan en pareja, mismo ms):
    //   error = { type: "provider.quota", message: "Rate limit exceeded...", status: 429 }.
    //   El segundo lo absorbe el cooldown.
    // - session.tool.failed: mismo error estructurado en fallos de herramienta.
    // - session.status con status.type === "retry" (ephemeral, compat).
    // `session.error` ya no existe en V2 (rama por compatibilidad).
    // OpenCode sigue siendo quien controla sus propios reintentos: aquí
    // solo se lanza el handler externo, sin alterar la política de retry.
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const raw of ctx.event.subscribe({ signal: controller.signal })) {
          if (!raw || typeof raw?.type !== "string") continue
          // V2 emite { type, data }; se acepta `properties` por compatibilidad.
          const event = { type: raw.type, properties: raw.data ?? raw.properties ?? {} }
          const props = event.properties ?? {}
          const status = props.status
          const error = props.error
          const isRetryScheduled =
            event.type === "session.retry.scheduled" && looksLikeRateLimit(error ?? props)
          const isRetrySignal =
            event.type === "session.status" && status?.type === "retry" && looksLikeRateLimit(status)
          const isFailedSignal =
            (event.type === "session.execution.failed" ||
              event.type === "session.step.failed" ||
              event.type === "session.tool.failed") &&
            looksLikeRateLimit(error ?? props)
          const isErrorSignal =
            event.type === "session.error" && looksLikeRateLimit(error ?? props)

          if (!isRetryScheduled && !isRetrySignal && !isFailedSignal && !isErrorSignal) {
            // Sigue habiendo mención a rate-limit pero no encaja en ninguno de los
            // patrones de arriba — lo dejamos registrado para revisar el filtro.
            if (mentionsRateLimit(collectText(props))) {
              log("debug", `Evento con mención a 429/rate limit no clasificado (${event.type})`)
            }
            continue
          }

          const reason = isRetryScheduled
            ? `auto_429_retry_scheduled (intento ${props.attempt ?? "?"})`
            : isRetrySignal
              ? `auto_429_retry (intento ${status?.attempt ?? "?"})`
              : `auto_429_${event.type}`
          await triggerRotation({ reason, ignoreCooldown: false })
        }
      } catch (err) {
        log("error", `El stream de eventos terminó: ${err?.message ?? err}`)
      }
    })()

    return () => controller.abort()
  },
}
