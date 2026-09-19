import { hostname, homedir } from "node:os"
import { join, dirname } from "node:path"
import { mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import notifier from "node-notifier"

// Config: los valores reales viven en el proceso o en .env (aquí no hay
// fallbacks con datos). Prioridad: entorno > .env. Parser mínimo.
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

const NTFY_URL = cfg("OPENCODE_NTFY_URL", "").replace(/\/+$/, "")
const NTFY_TOPIC = cfg("OPENCODE_NTFY_TOPIC", "")
const NTFY_USER = cfg("OPENCODE_NTFY_USER", "")
const NTFY_PASS = cfg("OPENCODE_NTFY_PASSWORD", "")

// URL pública para los enlaces "click".
const OPENCODE_SERVER_URL = cfg("OPENCODE_SERVER_URL", "").replace(/\/+$/, "")
// Servidor `serve` del wrapper: aquí van las respuestas del relay.
const OPENCODE_SERVER_HOST = cfg("OPENCODE_SERVER_HOST", "")
const OPENCODE_SERVER_PORT = cfg("OPENCODE_SERVER_PORT", "")
const OPENCODE_SERVER_INTERNAL = `http://${OPENCODE_SERVER_HOST}:${OPENCODE_SERVER_PORT}`
// Auth del servidor: Basic con usuario configurable.
// OJO: opencode ignora OPENCODE_SERVER_USER; la variable real es
// OPENCODE_SERVER_USERNAME (por defecto "opencode" en `serve`/`web`).
const OPENCODE_SERVER_USER = cfg("OPENCODE_SERVER_USERNAME", "opencode")
const OPENCODE_SERVER_PASSWORD = cfg("OPENCODE_SERVER_PASSWORD", "")

const IDLE_SUPPRESS_MS = Number(cfg("OPENCODE_NTFY_IDLE_SUPPRESS_MS", "")) || 0
const HOST_TAG = hostname()

// En --auto los permisos se autoaprueban solos: no notificar.
// Los forms de pregunta nunca se auto-resuelven: notificar siempre.
const isAutoMode = (process.env.OPENCODE_AUTO_MODE ?? __ENV.OPENCODE_AUTO_MODE) === "true"

const RELAY_PORT = Number(cfg("OPENCODE_NTFY_RELAY_PORT", "")) || 0
const RELAY_PUBLIC_URL = cfg("OPENCODE_NTFY_RELAY_PUBLIC_URL", "").replace(/\/+$/, "")
const RELAY_BASIC_AUTH_USER = cfg("OPENCODE_NTFY_RELAY_BASIC_AUTH_USER", "")
const RELAY_BASIC_AUTH_PASS = cfg("OPENCODE_NTFY_RELAY_BASIC_AUTH_PASS", "")

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const LOG_FILE_PATH = join(CONFIG_DIR, "logs", "opencode_ntfy.log")
const ICON_PATH = join(CONFIG_DIR, "hooks", "opencode_icon.png")
const QUESTION_TTL_MS = Number(cfg("OPENCODE_NTFY_QUESTION_TTL_MS", "")) || 0

// Por sessionID, no global: un permiso en una sesión no debe silenciar el
// aviso de fin de otra.
const lastBlockingNotifyAt = new Map()
let warnedMissingTopic = false
let warnedMissingUrl = false

// Pendientes legacy por requestID.
const pendingQuestions = new Map()
// Pendientes por formID: { sessionID, formID, form, createdAt }.
const pendingForms = new Map()

// Persistencia en disco: los pendientes viven en memoria y se pierden al
// reiniciar el servidor (el enlace de ntfy deja de funcionar en el móvil
// con un 404). Se guardan en JSON y se recargan al arrancar.
const PENDING_FILE_PATH = join(CONFIG_DIR, "logs", "ntfy_pending.json")

function savePendingToDisk() {
  try {
    mkdirSync(dirname(PENDING_FILE_PATH), { recursive: true })
    const data = {
      savedAt: Date.now(),
      questions: [...pendingQuestions.entries()],
      forms: [...pendingForms.entries()],
    }
    writeFileSync(PENDING_FILE_PATH, JSON.stringify(data), "utf-8")
  } catch (err) {
    logToFile("warn", `No se pudo persistir pendientes: ${err?.message ?? err}`)
  }
}

function loadPendingFromDisk() {
  try {
    const raw = readFileSync(PENDING_FILE_PATH, "utf-8")
    const data = JSON.parse(raw)
    for (const [id, q] of data.questions ?? []) pendingQuestions.set(id, q)
    for (const [id, f] of data.forms ?? []) pendingForms.set(id, f)
    // Respeta TTL al recargar (los caducados no reviven).
    cleanupExpiredQuestions()
    savePendingToDisk()
    if (pendingQuestions.size || pendingForms.size) {
      logToFile("info", `Pendientes recuperados de disco: ${pendingForms.size} forms, ${pendingQuestions.size} questions`)
    }
  } catch {
    /* sin pendientes previos: arranque normal */
  }
}

function rememberQuestion(requestID, entry) {
  pendingQuestions.set(requestID, entry)
  savePendingToDisk()
}

function rememberForm(formID, entry) {
  pendingForms.set(formID, entry)
  savePendingToDisk()
}

function forgetQuestion(requestID) {
  if (pendingQuestions.delete(requestID)) savePendingToDisk()
}

function forgetForm(formID) {
  if (pendingForms.delete(formID)) savePendingToDisk()
}

function logToFile(level, message, extra = null) {
  try {
    mkdirSync(dirname(LOG_FILE_PATH), { recursive: true })
    const timestamp = new Date().toISOString()
    const extraStr = extra ? ` | Extra: ${JSON.stringify(extra)}` : ""
    appendFileSync(LOG_FILE_PATH, `[${timestamp}] [${level.toUpperCase()}] ${message}${extraStr}\n`, "utf-8")
  } catch (err) {
    console.error(`Fallo al escribir log en ${LOG_FILE_PATH}:`, err)
  }
}

function truncate(text, max = 220) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function toHeaderSafeString(str) {
  return String(str ?? "").replace(/[^\x00-\x7F]/g, "").trim()
}

function extractErrorSnippet(errorPayload) {
  if (!errorPayload) return "Sin detalle adicional en el evento."
  if (typeof errorPayload === "string") return truncate(errorPayload)
  const msg = errorPayload.message ?? errorPayload.data?.message ?? JSON.stringify(errorPayload)
  return truncate(msg)
}

function getSessionUrl(sessionID) {
  if (!sessionID) return OPENCODE_SERVER_URL
  const cleanServerUrl = OPENCODE_SERVER_URL.replace(/\/+$/, "")
  const base64Server = Buffer.from(cleanServerUrl).toString("base64").replace(/=+$/, "")
  return `${cleanServerUrl}/server/${base64Server}/session/${sessionID}`
}

function priorityToNumber(priority) {
  return { min: 1, low: 2, default: 3, high: 4, urgent: 5 }[priority] ?? 3
}

function relayUrl(path) {
  return `${RELAY_PUBLIC_URL}${path}`
}

function relayAuthHeaders() {
  if (!RELAY_BASIC_AUTH_USER || !RELAY_BASIC_AUTH_PASS) return {}
  const creds = Buffer.from(`${RELAY_BASIC_AUTH_USER}:${RELAY_BASIC_AUTH_PASS}`).toString("base64")
  return { Authorization: `Basic ${creds}` }
}

// Auth v2 contra el servidor explícito (Basic, usuario configurable).
function serverAuthHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  }
  if (OPENCODE_SERVER_PASSWORD) {
    const creds = Buffer.from(`${OPENCODE_SERVER_USER}:${OPENCODE_SERVER_PASSWORD}`).toString("base64")
    headers["Authorization"] = `Basic ${creds}`
  }
  return headers
}

function cleanupExpiredQuestions() {
  if (!QUESTION_TTL_MS) return
  const now = Date.now()
  let changed = false
  for (const [id, q] of pendingQuestions) {
    if (now - q.createdAt > QUESTION_TTL_MS) { pendingQuestions.delete(id); changed = true }
  }
  for (const [id, f] of pendingForms) {
    if (now - f.createdAt > QUESTION_TTL_MS) { pendingForms.delete(id); changed = true }
  }
  if (changed) savePendingToDisk()
}

// --- Responder a permisos ---------------------------------------------------
// SDK (ctx) primero, HTTP como fallback.
async function replyPermission(ctx, { sessionID, requestID, reply }) {
  try {
    await ctx.permission.reply({ sessionID, requestID, reply })
    logToFile("info", `permission.reply OK vía ctx (requestID=${requestID}, reply=${reply})`)
    return { ok: true }
  } catch (err) {
    logToFile("warn", `permission.reply vía ctx falló, probando HTTP v2: ${err?.message ?? err}`)
  }
  try {
    const res = await fetch(`${OPENCODE_SERVER_INTERNAL}/api/session/${sessionID}/permission/${requestID}/reply`, {
      method: "POST",
      headers: serverAuthHeaders(),
      body: JSON.stringify({ decision: reply }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`)
    logToFile("info", `permission.reply OK vía HTTP v2 (requestID=${requestID}, reply=${reply})`)
    return { ok: true }
  } catch (err) {
    logToFile("error", `permission.reply falló (requestID=${requestID}, reply=${reply}): ${err?.message ?? err}`)
    return { ok: false, error: String(err?.message ?? err) }
  }
}

// Preguntas legacy (pre-2.x).
async function replyQuestion({ sessionID, requestID, answers }) {
  try {
    const res = await fetch(`${OPENCODE_SERVER_INTERNAL}/api/session/${sessionID}/question/${requestID}/reply`, {
      method: "POST",
      headers: serverAuthHeaders(),
      body: JSON.stringify({ answers }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`)
    logToFile("info", `question.reply OK vía HTTP v2 (requestID=${requestID})`)
    return { ok: true }
  } catch (err) {
    logToFile("error", `question.reply falló (requestID=${requestID}): ${err?.message ?? err}. Revisa que el servidor único (${OPENCODE_SERVER_INTERNAL}) esté accesible.`)
    return { ok: false, error: String(err?.message ?? err) }
  }
}

// Responde un form: POST /api/session/{sessionID}/form/{formID}/reply { answer }.
async function replyForm({ sessionID, formID, answer }) {
  try {
    const res = await fetch(`${OPENCODE_SERVER_INTERNAL}/api/session/${sessionID}/form/${formID}/reply`, {
      method: "POST",
      headers: serverAuthHeaders(),
      body: JSON.stringify({ answer }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`)
    logToFile("info", `form.reply OK vía HTTP v2 (formID=${formID})`)
    return { ok: true }
  } catch (err) {
    logToFile("error", `form.reply falló (formID=${formID}): ${err?.message ?? err}. Revisa que el servidor único (${OPENCODE_SERVER_INTERNAL}) esté accesible.`)
    return { ok: false, error: String(err?.message ?? err) }
  }
}

// --- HTML Cuestionario -----------------------------------------------------
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
}

// CSS compartido mobile-first: objetivos táctiles >=44px, fuente 16px en
// inputs (evita el auto-zoom de iOS) y soporte de modo oscuro.
const MOBILE_CSS = `
  :root{color-scheme:light dark}
  body{font-family:system-ui,sans-serif;max-width:560px;margin:1.2rem auto;padding:0 1rem;color:#222;background:#fff}
  h1{font-size:1.35rem;line-height:1.3}
  :focus-visible{outline:3px solid #1a73e8;outline-offset:2px;border-radius:4px}
  fieldset{border:1px solid #ddd;border-radius:10px;margin-bottom:1.2rem;padding:1rem}
  legend{font-weight:600;padding:0 .4rem}
  .opt{display:flex;gap:.7rem;align-items:flex-start;min-height:44px;padding:.7rem 0;border-top:1px solid #f0f0f0;cursor:pointer}
  .opt:first-of-type{border-top:none}
  .opt input[type="radio"],.opt input[type="checkbox"]{width:22px;height:22px;margin-top:.15rem;flex-shrink:0}
  .desc{color:#666;font-size:.85rem}
  .custom-wrap{flex:1;min-width:0}
  .custom-text{width:100%;margin-top:.4rem;padding:.7rem;border:1px solid #ccc;border-radius:8px;font-size:16px;box-sizing:border-box;background:#fff;color:#111}
  button{background:#111;color:#fff;border:0;border-radius:10px;padding:1rem 1.4rem;font-size:1.05rem;min-height:48px;width:100%;cursor:pointer}
  button:disabled{opacity:.55;cursor:progress}
  input:disabled{opacity:.55}
  #status{margin-top:1rem;font-weight:600;min-height:1.5em}
  #status:focus{outline:3px solid #1a73e8;outline-offset:2px;border-radius:4px}
  #status.error{color:#b3261e}
  .card{border:1px solid #ddd;border-radius:10px;padding:1.2rem;margin-top:1rem}
  .btn{display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;background:#111;color:#fff;border-radius:10px;padding:1rem;margin-top:1rem;min-height:44px;line-height:1.4}
  @media (prefers-color-scheme:dark){
    body{background:#111;color:#eee}
    :focus-visible{outline-color:#8ab4f8}
    fieldset,.card{border-color:#444}
    .opt{border-color:#333}
    .desc{color:#aaa}
    .custom-text{background:#222;color:#eee;border-color:#555}
    button,.btn{background:#eee;color:#111}
    #status.error{color:#ff8a80}
    #status:focus{outline-color:#8ab4f8}
  }`

function pageShell(title, bodyInner) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>${MOBILE_CSS}
</style></head><body>
<main>
<h1>${escapeHtml(title)}</h1>
${bodyInner}
</main>
</body></html>`
}

// Página de error mobile-first: explica por qué el enlace ya no vale
// (reinicio del servidor o TTL) y ofrece volver a la sesión.
function renderErrorHtml({ heading, message, sessionID }) {
  const sessionLink = sessionID
    ? `<a class="btn" href="${escapeHtml(getSessionUrl(sessionID))}">Abrir sesión en OpenCode</a>`
    : ""
  return pageShell(heading, `<div class="card" role="alert"><p>${escapeHtml(message)}</p>
<p>Pide al agente que vuelva a preguntar para generar un enlace nuevo.</p>${sessionLink}</div>`)
}

function sendHtml(res, status, html, headOnly = false) {
  const buf = Buffer.from(html, "utf-8")
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": buf.length,
  })
  res.end(headOnly ? null : buf)
}

function renderQuestionnaireHtml(entry) {
  const blocks = (entry.questions ?? []).map((q, qi) => {
    const inputType = q.multiple ? "checkbox" : "radio"
    const qLabel = q.header ?? `Pregunta ${qi + 1}`
    const opts = (q.options ?? []).map((opt) => `
      <label class="opt">
        <input type="${inputType}" name="q${qi}" value="${escapeHtml(opt.label)}">
        <div><strong>${escapeHtml(opt.label ?? "Opción")}</strong>${opt.description ? `<div class="desc">${escapeHtml(opt.description)}</div>` : ""}</div>
      </label>`).join("")
    const customOpt = `
      <label class="opt">
        <input type="${inputType}" name="q${qi}" value="__custom__">
        <div class="custom-wrap">
          <strong>Escribe tu propia respuesta</strong>
          <input type="text" class="custom-text" data-for="q${qi}" placeholder="Tu respuesta…" aria-label="Tu respuesta personalizada para ${escapeHtml(qLabel)}" autocomplete="off">
        </div>
      </label>`
    return `<fieldset><legend>${escapeHtml(qLabel)}</legend>${q.question ? `<p>${escapeHtml(q.question)}</p>` : ""}${opts}${customOpt}</fieldset>`
  }).join("")
  // Sin contenido no hay nada que enviar: se omite el botón para no
  // sugerir una acción inútil (el POST sigue existiendo sin cambios).
  const submitHtml = blocks ? `<button type="submit">Enviar respuesta</button>` : ""
  const emptyHtml = `<div class="card" role="status"><p>Sin contenido pendiente: caducó o ya fue respondida.</p></div>`

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>OpenCode · Cuestionario</title>
<style>${MOBILE_CSS}
</style></head><body>
<main>
<h1>Responder pregunta de OpenCode</h1>
<noscript><div class="card" role="alert"><p>Esta página necesita JavaScript para enviar tu respuesta. Actívalo y recarga.</p></div></noscript>
<form id="f">${blocks || emptyHtml}${submitHtml}</form>
<div id="status" role="status" aria-live="polite" tabindex="-1"></div>
<script>
  const numQuestions = ${(entry.questions ?? []).length}
  const form = document.getElementById('f')
  const status = document.getElementById('status')
  const submitBtn = form.querySelector('button[type="submit"]')
  // Al escribir texto personalizado se marca su opción: evita enviar el
  // texto sin la opción marcada (el servidor solo lee lo marcado).
  form.querySelectorAll('.custom-text').forEach((input) => {
    input.addEventListener('input', () => {
      const choice = input.closest('.opt')?.querySelector('input[type="radio"],input[type="checkbox"]')
      if (choice && input.value.trim() !== '' && !choice.checked) choice.checked = true
    })
  })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (submitBtn && submitBtn.disabled) return
    const fd = new FormData(form)
    const answers = []
    for (let qi = 0; qi < numQuestions; qi++) {
      const raw = fd.getAll('q' + qi)
      const resolved = raw.map((v) => {
        if (v !== '__custom__') return v
        const input = document.querySelector('.custom-text[data-for="q' + qi + '"]')
        return (input?.value ?? '').trim()
      }).filter((v) => v !== '')
      answers.push(resolved)
    }
    if (answers.every((a) => a.length === 0)) {
      status.textContent = 'Selecciona o escribe al menos una respuesta antes de enviar.'
      status.classList.add('error')
      status.focus()
      return
    }
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.textContent = 'Enviando…'
    }
    status.classList.remove('error')
    status.textContent = 'Enviando…'
    try {
      const res = await fetch(location.pathname + location.search, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (res.ok) {
        status.textContent = '✅ Respuesta enviada. Ya puedes cerrar esta página.'
        form.querySelectorAll('input,button').forEach((el) => { el.disabled = true })
      } else {
        status.textContent = '❌ Error al enviar respuesta. Revisa tu conexión y vuelve a intentarlo.'
        status.classList.add('error')
        if (submitBtn) {
          submitBtn.disabled = false
          submitBtn.textContent = 'Enviar respuesta'
        }
      }
    } catch (err) {
      status.textContent = '❌ Error de red: ' + (err?.message ?? err) + '. Vuelve a intentarlo.'
      status.classList.add('error')
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.textContent = 'Enviar respuesta'
      }
    }
    status.focus()
  })
</script></main></body></html>`
}

// Formulario de un form: multiselect -> checkbox (array), resto -> radio.
function renderFormHtml(entry) {
  const fields = entry.form?.fields ?? []
  const blocks = fields.map((f) => {
    const isMulti = f.type === "multiselect"
    const inputType = isMulti ? "checkbox" : "radio"
    const fLabel = f.title ?? f.key
    const opts = (f.options ?? []).map((opt) => `
      <label class="opt">
        <input type="${inputType}" name="${escapeHtml(f.key)}" value="${escapeHtml(opt.value ?? opt.label)}">
        <div><strong>${escapeHtml(opt.label ?? opt.value ?? "Opción")}</strong>${opt.description ? `<div class="desc">${escapeHtml(opt.description)}</div>` : ""}</div>
      </label>`).join("")
    const customOpt = f.custom ? `
      <label class="opt">
        <input type="${inputType}" name="${escapeHtml(f.key)}" value="__custom__">
        <div class="custom-wrap">
          <strong>Escribe tu propia respuesta</strong>
          <input type="text" class="custom-text" data-for="${escapeHtml(f.key)}" placeholder="Tu respuesta…" aria-label="Tu respuesta personalizada para ${escapeHtml(fLabel)}" autocomplete="off">
        </div>
      </label>` : ""
    return `<fieldset><legend>${escapeHtml(fLabel)}</legend>${f.description ? `<p>${escapeHtml(f.description)}</p>` : ""}${opts}${customOpt}</fieldset>`
  }).join("")

  const fieldKeys = fields.map((f) => f.key)
  const multiKeys = fields.filter((f) => f.type === "multiselect").map((f) => f.key)
  // Sin campos no hay nada que enviar: se omite el botón (el POST no cambia).
  const submitHtml = blocks ? `<button type="submit">Enviar respuesta</button>` : ""
  const emptyHtml = `<div class="card" role="status"><p>Sin contenido pendiente: caducó o ya fue respondida.</p></div>`

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>OpenCode · Cuestionario</title>
<style>${MOBILE_CSS}
</style></head><body>
<main>
<h1>Responder pregunta de OpenCode</h1>
<noscript><div class="card" role="alert"><p>Esta página necesita JavaScript para enviar tu respuesta. Actívalo y recarga.</p></div></noscript>
<form id="f">${blocks || emptyHtml}${submitHtml}</form>
<div id="status" role="status" aria-live="polite" tabindex="-1"></div>
<script>
  const fieldKeys = ${JSON.stringify(fieldKeys).replace(/</g, "\\u003c")}
  const multiKeys = new Set(${JSON.stringify(multiKeys).replace(/</g, "\\u003c")})
  const form = document.getElementById('f')
  const status = document.getElementById('status')
  const submitBtn = form.querySelector('button[type="submit"]')
  // Al escribir texto personalizado se marca su opción: evita enviar el
  // texto sin la opción marcada (el servidor solo lee lo marcado).
  form.querySelectorAll('.custom-text').forEach((input) => {
    input.addEventListener('input', () => {
      const choice = input.closest('.opt')?.querySelector('input[type="radio"],input[type="checkbox"]')
      if (choice && input.value.trim() !== '' && !choice.checked) choice.checked = true
    })
  })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (submitBtn && submitBtn.disabled) return
    const fd = new FormData(form)
    const answer = {}
    for (const key of fieldKeys) {
      const raw = fd.getAll(key)
      const resolved = raw.map((v) => {
        if (v !== '__custom__') return v
        const input = Array.from(document.querySelectorAll('.custom-text')).find((el) => el.getAttribute('data-for') === key)
        return (input?.value ?? '').trim()
      }).filter((v) => v !== '')
      answer[key] = multiKeys.has(key) ? resolved : (resolved[0] ?? '')
    }
    const allEmpty = Object.values(answer).every((v) => Array.isArray(v) ? v.length === 0 : v === '')
    if (allEmpty) {
      status.textContent = 'Selecciona o escribe al menos una respuesta antes de enviar.'
      status.classList.add('error')
      status.focus()
      return
    }
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.textContent = 'Enviando…'
    }
    status.classList.remove('error')
    status.textContent = 'Enviando…'
    try {
      const res = await fetch(location.pathname + location.search, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      if (res.ok) {
        status.textContent = '✅ Respuesta enviada. Ya puedes cerrar esta página.'
        form.querySelectorAll('input,button').forEach((el) => { el.disabled = true })
      } else {
        status.textContent = '❌ Error al enviar respuesta. Revisa tu conexión y vuelve a intentarlo.'
        status.classList.add('error')
        if (submitBtn) {
          submitBtn.disabled = false
          submitBtn.textContent = 'Enviar respuesta'
        }
      }
    } catch (err) {
      status.textContent = '❌ Error de red: ' + (err?.message ?? err) + '. Vuelve a intentarlo.'
      status.classList.add('error')
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.textContent = 'Enviar respuesta'
      }
    }
    status.focus()
  })
</script></main></body></html>`
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => { data += chunk; if (data.length > 1_000_000) req.destroy(new Error("payload demasiado grande")) })
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}) } catch (err) { reject(err) } })
    req.on("error", reject)
  })
}

// --- Servidor Relay --------------------------------------------------------
// NOTA seguridad: las rutas entrantes NO exigen RELAY_BASIC_AUTH_* (auth
// opcional por contrato); protegen el ID impredecible + TTL/410. Esas
// credenciales solo viajan en salida (headers de las acciones ntfy),
// nunca en querystring. No endurecer aquí sin el head: cambia el contrato.
// Reintentos de bind configurables: cubren la ventana en que el puerto
// sigue ocupado durante reinicios (ese hueco dejaba al plugin sordo).
const RELAY_BIND_ATTEMPTS = Number(cfg("OPENCODE_NTFY_RELAY_BIND_ATTEMPTS", "")) || 6
const RELAY_BIND_RETRY_MS = Number(cfg("OPENCODE_NTFY_RELAY_BIND_RETRY_MS", "")) || 5000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function relayRequestListener(ctx) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost")

      // Cuestionario legacy (pre-2.x).
      // HEAD se responde igual que GET pero sin cuerpo (previews de enlaces
      // en apps móviles como ntfy envían HEAD antes de abrir).
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/question/")) {
        const requestID = decodeURIComponent(url.pathname.split("/")[2] ?? "")
        const entry = pendingQuestions.get(requestID)
        const ua = req.headers["user-agent"] ?? "?"
        if (!entry) {
          logToFile("warn", `GET /question sin pendiente (id=${requestID}, ua=${truncate(ua, 80)})`)
          sendHtml(res, 404, renderErrorHtml({
            heading: "Pregunta no disponible",
            message: "Esta pregunta ya no está pendiente: caducó o el servidor se reinició.",
            sessionID: null,
          }), req.method === "HEAD")
          return
        }
        logToFile("debug", `GET /question servido (id=${requestID}, ua=${truncate(ua, 80)})`)
        sendHtml(res, 200, renderQuestionnaireHtml(entry), req.method === "HEAD")
        return
      }

      // Respuesta legacy (pre-2.x).
      if (req.method === "POST" && url.pathname.startsWith("/question/")) {
        const requestID = decodeURIComponent(url.pathname.split("/")[2] ?? "")
        const entry = pendingQuestions.get(requestID)
        if (!entry) {
          res.writeHead(410, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: false, error: "expired_or_already_answered" }))
          return
        }
        const body = await readJsonBody(req)
        const result = await replyQuestion({ sessionID: entry.sessionID, requestID, answers: body.answers ?? [] })
        if (result.ok) forgetQuestion(requestID)
        res.writeHead(result.ok ? 200 : 502, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
        return
      }

      // Formulario de un form pendiente.
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/form/")) {
        const formID = decodeURIComponent(url.pathname.split("/")[2] ?? "")
        const entry = pendingForms.get(formID)
        const ua = req.headers["user-agent"] ?? "?"
        const hasAuth = Boolean(req.headers["authorization"])
        if (!entry) {
          logToFile("warn", `GET /form sin pendiente (id=${formID}, auth=${hasAuth}, ua=${truncate(ua, 80)})`)
          sendHtml(res, 404, renderErrorHtml({
            heading: "Cuestionario no disponible",
            message: "Este formulario ya no está pendiente: caducó o el servidor se reinició.",
            sessionID: null,
          }), req.method === "HEAD")
          return
        }
        logToFile("debug", `GET /form servido (id=${formID}, auth=${hasAuth}, ua=${truncate(ua, 80)})`)
        sendHtml(res, 200, renderFormHtml(entry), req.method === "HEAD")
        return
      }

      // Respuesta de un form pendiente.
      if (req.method === "POST" && url.pathname.startsWith("/form/")) {
        const formID = decodeURIComponent(url.pathname.split("/")[2] ?? "")
        const entry = pendingForms.get(formID)
        if (!entry) {
          res.writeHead(410, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: false, error: "expired_or_already_answered" }))
          return
        }
        const body = await readJsonBody(req)
        const result = await replyForm({ sessionID: entry.sessionID, formID, answer: body.answer ?? {} })
        if (result.ok) forgetForm(formID)
        res.writeHead(result.ok ? 200 : 502, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
        return
      }

      // POST /permission-reply -> Responde vía SDK v2 (ctx)
      if (req.method === "POST" && url.pathname === "/permission-reply") {
        const body = await readJsonBody(req)
        const { sessionID, requestID, reply } = body
        if (!sessionID || !requestID || !reply) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: false, error: "missing_sessionID_requestID_or_reply" }))
          return
        }
        const result = await replyPermission(ctx, { sessionID, requestID, reply })
        res.writeHead(result.ok ? 200 : 502, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
        return
      }

      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not found")
    } catch (err) {
      logToFile("error", `Error en relay server: ${err}`)
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: false, error: String(err) }))
    }
  }
}

function tryListenOnce(ctx) {
  return new Promise((resolve) => {
    const server = createServer(relayRequestListener(ctx))
    const done = (result) => {
      server.removeListener("error", onError)
      server.removeListener("listening", onListening)
      resolve({ ...result, server })
    }
    const onError = (err) => done({ ok: false, err })
    const onListening = () => done({ ok: true })
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(RELAY_PORT)
  })
}

// Intenta ser dueno del relay con reintentos. Solo el dueno procesa
// eventos (evita duplicados entre instancias).
async function startRelayServer(ctx) {
  for (let attempt = 1; attempt <= RELAY_BIND_ATTEMPTS; attempt++) {
    const { ok, err, server } = await tryListenOnce(ctx)
    if (ok) {
      logToFile("info", `Relay server escuchando en http://localhost:${RELAY_PORT} (publico en ${RELAY_PUBLIC_URL})`)
      return { owned: true, server }
    }
    try { server.close() } catch { /* noop */ }
    if (attempt < RELAY_BIND_ATTEMPTS) {
      logToFile("warn", `Relay: puerto ${RELAY_PORT} ocupado (intento ${attempt}/${RELAY_BIND_ATTEMPTS}): ${err?.message ?? err}. Reintento en ${RELAY_BIND_RETRY_MS / 1000}s.`)
      await sleep(RELAY_BIND_RETRY_MS)
    }
  }
  logToFile("error", `Relay: puerto ${RELAY_PORT} sigue ocupado tras ${RELAY_BIND_ATTEMPTS} intentos: otra instancia procesa los eventos.`)
  return { owned: false, server: null }
}

// Si el socket del dueno se cae con el proceso vivo, pelea por re-enlazar.
async function rebindRelay(ctx, relayState) {
  logToFile("warn", "Relay: conexion cerrada con el proceso vivo, reintentando bind...")
  const fresh = await startRelayServer(ctx)
  if (relayState.disposed) {
    try { fresh.server?.close() } catch { /* noop */ }
    return
  }
  if (fresh.owned) {
    relayState.server = fresh.server
    fresh.server.on("close", () => {
      if (!relayState.disposed) void rebindRelay(ctx, relayState)
    })
    return
  }
  logToFile("error", "Relay: re-bind fallido; reinicia el servidor para recuperar las notificaciones.")
}

// Construye título/mensaje/acciones para permission.asked.
// Forma v2 documentada: { permission, patterns, metadata, always[] }.
// Forma observada en este entorno: { action, resources[], save[] }.
function buildPermissionNotification(props, sessionID) {
  const requestID = props.id
  const command = props.metadata?.command
  const permName = props.permission ?? props.action ?? "acción"
  const patterns = Array.isArray(props.patterns) && props.patterns.length
    ? props.patterns
    : (Array.isArray(props.resources) ? props.resources : [])

  const target = command
    ? `⚙️ Comando: ${command}`
    : patterns.length
      ? `🔑 ${permName}: ${patterns.join(", ")}`
      : `🔑 Permiso (${permName})`

  const httpAction = (label, reply) => ({
    action: "http",
    label,
    url: relayUrl("/permission-reply"),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...relayAuthHeaders(),
    },
    body: JSON.stringify({ sessionID, requestID, reply }),
    clear: true,
  })

  // Como la TUI: siempre Una vez / Siempre / Rechazar. Si el permiso no
  // trae patrones guardables, el servidor trata "always" como "once".
  return {
    title: "🔐 OpenCode necesita permiso",
    message: truncate(target, 180),
    priority: "high",
    tags: ["lock", "permission"],
    actions: [
      httpAction("✅ Una vez", "once"),
      httpAction("♾️ Siempre", "always"),
      httpAction("❌ Rechazar", "reject"),
    ],
  }
}
// --- Publicación en ntfy -----------------------------------------------------
async function publish({ title, message, priority = "default", tags = [], clickUrl = null, actions = null }) {
  if (!NTFY_TOPIC) {
    if (!warnedMissingTopic) {
      warnedMissingTopic = true
      logToFile("warn", "OPENCODE_NTFY_TOPIC no está definido: el plugin no enviará notificaciones.")
    }
    return
  }
  if (!NTFY_URL) {
    if (!warnedMissingUrl) {
      warnedMissingUrl = true
      logToFile("warn", "OPENCODE_NTFY_URL no está definido: el plugin no enviará notificaciones.")
    }
    return
  }

  const payload = {
    topic: NTFY_TOPIC,
    title: toHeaderSafeString(`${title} - ${HOST_TAG}`),
    message,
    priority: priorityToNumber(priority),
    tags,
  }
  if (clickUrl) payload.click = clickUrl
  if (actions?.length) payload.actions = actions.slice(0, 3)

  const headers = { "Content-Type": "application/json" }
  if (NTFY_USER && NTFY_PASS) {
    headers.Authorization = `Basic ${Buffer.from(`${NTFY_USER}:${NTFY_PASS}`).toString("base64")}`
  }

  try {
    const res = await fetch(`${NTFY_URL}/`, { method: "POST", headers, body: JSON.stringify(payload) })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      logToFile("error", `ntfy respondió ${res.status} ${res.statusText} al publicar "${title}". Detalle: ${errText}`)
    }
  } catch (err) {
    logToFile("error", `Fallo al publicar en ntfy: ${err}`)
  }
}

// Plugin v2: default export con id/setup. Solo builtins `node:` y paquetes sin scope.
export default {
  id: "ntfy",
  async setup(ctx) {
    return startNtfyPlugin(ctx)
  },
}

// Exports con nombre solo para pruebas (el loader usa el default).
export const __test__ = {
  buildPermissionNotification,
  renderFormHtml,
  renderQuestionnaireHtml,
  renderErrorHtml,
  escapeHtml,
  truncate,
}

async function startNtfyPlugin(ctx) {
  logToFile("info", `Plugin NtfyNotify cargado. Logs en: ${LOG_FILE_PATH}`)
  logToFile("info", `Modo auto detectado: ${isAutoMode} (process.argv: ${process.argv.join(" ")})`)
  logToFile("debug", `Setup v2 en directorio: ${ctx.location?.directory}`)

  const missing = [
    ["OPENCODE_NTFY_URL", NTFY_URL],
    ["OPENCODE_NTFY_TOPIC", NTFY_TOPIC],
    ["OPENCODE_NTFY_USER", NTFY_USER],
    ["OPENCODE_NTFY_PASSWORD", NTFY_PASS],
    ["OPENCODE_SERVER_URL", OPENCODE_SERVER_URL],
    ["OPENCODE_SERVER_HOST", OPENCODE_SERVER_HOST],
    ["OPENCODE_SERVER_PORT", OPENCODE_SERVER_PORT],
    ["OPENCODE_SERVER_USERNAME", OPENCODE_SERVER_USER],
    ["OPENCODE_SERVER_PASSWORD", OPENCODE_SERVER_PASSWORD],
    ["OPENCODE_NTFY_RELAY_PORT", RELAY_PORT],
    ["OPENCODE_NTFY_RELAY_PUBLIC_URL", RELAY_PUBLIC_URL],
    ["OPENCODE_NTFY_RELAY_BASIC_AUTH_USER", RELAY_BASIC_AUTH_USER],
    ["OPENCODE_NTFY_RELAY_BASIC_AUTH_PASS", RELAY_BASIC_AUTH_PASS],
    ["OPENCODE_NTFY_IDLE_SUPPRESS_MS", IDLE_SUPPRESS_MS],
    ["OPENCODE_NTFY_QUESTION_TTL_MS", QUESTION_TTL_MS],
  ].filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) logToFile("warn", `Falta config en .env: ${missing.join(", ")}`)
  if (!RELAY_PORT) {
    logToFile("error", "Sin OPENCODE_NTFY_RELAY_PORT no arranca el relay: sin eventos.")
    return
  }

  // Solo la instancia que enlaza el relay procesa eventos (evita duplicados
  // cuando el plugin se instancia por directorio).
  const relay = await startRelayServer(ctx)
  if (!relay.owned) {
    logToFile("info", "Otra instancia ya sirve el relay en este puerto: esta instancia no procesara eventos.")
    return
  }
  const relayState = { server: relay.server, disposed: false }
  relayState.server.on("close", () => {
    if (!relayState.disposed) void rebindRelay(ctx, relayState)
  })
  // El dueno recupera pendientes de disco (los enlaces siguen valiendo tras reiniciar).
  loadPendingFromDisk()

  const handleEvent = async (event) => {
      const sessionID = event?.properties?.sessionID ?? event?.sessionID
      const clickUrl = getSessionUrl(sessionID)

      // 1. Error de ejecución.
      if (event.type === "session.execution.failed" || event.type === "session.error") {
        lastBlockingNotifyAt.set(sessionID, Date.now())
        await publish({
          title: "🚨 Error en OpenCode",
          message: extractErrorSnippet(event.properties?.error),
          priority: "urgent",
          tags: ["warning", "error"],
          clickUrl,
        })
        return
      }

      // 2. Permiso requerido
      if (event.type === "permission.asked") {
        lastBlockingNotifyAt.set(sessionID, Date.now())

        if (isAutoMode) {
          logToFile("debug", `permission.asked suprimida por modo --auto (requestID=${event.properties?.id})`)
          return
        }

        const notif = buildPermissionNotification(event.properties ?? {}, sessionID)
        await publish({ ...notif, clickUrl })
        return
      }

      // 3. Formulario de pregunta (solo kind=question).
      if (event.type === "form.created") {
        cleanupExpiredQuestions()
        const form = event.properties?.form ?? {}
        const formID = form.id
        const formSessionID = form.sessionID ?? sessionID
        if (!formID) {
          logToFile("warn", `form.created sin form.id, se ignora (sessionID=${sessionID ?? "?"})`)
          return
        }
        const kind = form.metadata?.kind
        if (kind && kind !== "question") return
        rememberForm(formID, { sessionID: formSessionID, formID, form, createdAt: Date.now() })
        lastBlockingNotifyAt.set(formSessionID, Date.now())

        const firstField = form.fields?.[0]
        const questionText = firstField?.description ?? firstField?.title ?? "Un agente necesita tu respuesta para continuar."

        await publish({
          title: "❓ OpenCode tiene una pregunta",
          message: truncate(questionText, 180),
          priority: "high",
          tags: ["question"],
          clickUrl: getSessionUrl(formSessionID),
          actions: [
            { action: "view", label: "📋 Ver cuestionario", url: relayUrl(`/form/${formID}`), clear: false },
          ],
        })
        return
      }

      // Pregunta legacy (pre-2.x).
      if (event.type === "question.asked") {
        lastBlockingNotifyAt.set(sessionID, Date.now())
        cleanupExpiredQuestions()
        const props = event.properties ?? {}
        const requestID = props.id
        rememberQuestion(requestID, { sessionID, questions: props.questions ?? [], createdAt: Date.now() })

        const firstQ = props.questions?.[0]
        const questionText = firstQ?.question ?? "Un agente necesita tu respuesta para continuar."

        await publish({
          title: "❓ OpenCode tiene una pregunta",
          message: truncate(questionText, 180),
          priority: "high",
          tags: ["question"],
          clickUrl,
          actions: [
            { action: "view", label: "📋 Ver cuestionario", url: relayUrl(`/question/${requestID}`), clear: false },
          ],
        })
        return
      }

      // Form contestado o cancelado: limpiar pendiente.
      if (event.type === "form.replied" || event.type === "form.cancelled") {
        forgetForm(event.properties?.id)
        return
      }

      // Pregunta legacy contestada: limpiar pendiente.
      if (event.type === "question.replied" || event.type === "question.rejected") {
        forgetQuestion(event.properties?.requestID)
        return
      }

      // 4. Ejecución terminada con éxito.
      if (event.type === "session.execution.succeeded" || event.type === "session.idle") {
        const lastAt = lastBlockingNotifyAt.get(sessionID) ?? 0
        if (Date.now() - lastAt < IDLE_SUPPRESS_MS) return

        let isSubagent = false
        let sessionTitle = ""
        try {
          const info = await ctx.session.get({ sessionID })
          isSubagent = Boolean(info?.parentID)
          sessionTitle = info?.title ?? ""
        } catch (err) {
          logToFile("warn", `No se pudo consultar la sesión ${sessionID} para saber si es subagente: ${err?.message ?? err}`)
        }

        if (isSubagent) {
          await publish({
            title: "🤖 Subagente completado",
            message: sessionTitle ? truncate(sessionTitle, 180) : "🛠️ Un subagente ha terminado su tarea.",
            priority: "low",
            tags: ["robot"],
            clickUrl,
          })
          return
        }

        await publish({
          title: "✅ Listo para validar",
          message: "🎉 OpenCode ha terminado y está esperando tu revisión.",
          priority: "default",
          tags: ["white_check_mark", "done"],
          clickUrl,
        })

        notifier.notify({
          title: "✅ Listo para validar",
          message: "🎉 OpenCode ha terminado y está esperando tu revisión.",
          appID: "OpenCode",
          icon: ICON_PATH,
          sound: false,
          wait: false,
        })

      }
    }

    // Suscripción detached: si se esperase aquí, setup() no resolvería nunca.
    // raw.data equivale a properties (en form.created la sesión va en data.form).
    const noisyEvent = (type) => type.endsWith(".updated") || type === "plugin.added" || type.includes("message.part")
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const raw of ctx.event.subscribe({ signal: controller.signal })) {
          if (!raw || typeof raw?.type !== "string") continue
          const data = raw.data ?? {}
          const event = { id: raw.id, type: raw.type, properties: data, sessionID: data?.sessionID ?? data?.form?.sessionID }
          try {
            if (!noisyEvent(event.type)) logToFile("debug", `Evento recibido [${event.type}] (sessionID=${event.sessionID ?? "?"})`)
            await handleEvent(event)
          } catch (err) {
            logToFile("error", `Error procesando evento [${raw?.type}]: ${err?.message ?? err}`)
          }
        }
      } catch (err) {
        logToFile("error", `El stream de eventos terminó: ${err?.message ?? err}`)
      }
    })()
    return () => {
      relayState.disposed = true
      controller.abort()
      try { relayState.server.close() } catch { /* noop */ }
    }
}
