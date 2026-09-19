# Forzar UTF-8 en los streams de salida
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

# -- SERVIDOR UNICO ----------------------------------------------------------
# UN solo servidor explicito (`serve --port ...`); la TUI se conecta con
# `--server`. Sin background service (`serve --service`, se detiene al
# arrancar): dos servidores duplican los plugins y las respuestas del movil
# llegan al servidor equivocado y se pierden. Config compartida en `.env`.

$scriptRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$tunnelStart  = Join-Path $scriptRoot "hooks\tunnel\tunnel-start.ps1"
$tunnelStop   = Join-Path $scriptRoot "hooks\tunnel\tunnel-stop.ps1"
$envFile      = Join-Path $scriptRoot ".env"
# DESACTIVADO con el bloque AHK de abajo. Ruta legacy: el script vive hoy en
# hooks\deactivated\rate_limit\ (no se corrige el valor porque no se usa).
$ahkScript    = "C:\Users\aritz.g.s\.config\opencode\hooks\rate_limit\rotar_ip.ahk"
$opencodePath = "C:\Users\aritz.g.s\AppData\Roaming\npm\opencode.cmd"

if (-not (Test-Path -LiteralPath $tunnelStart -PathType Leaf)) { throw "No se encontro tunnel-start.ps1: $tunnelStart" }
if (-not (Test-Path -LiteralPath $tunnelStop -PathType Leaf))  { throw "No se encontro tunnel-stop.ps1: $tunnelStop" }
if (-not (Test-Path -LiteralPath $opencodePath))              { throw "No se encontro el ejecutable de OpenCode en: $opencodePath" }
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf))    { throw "No se encontro .env: $envFile" }

# -- Cargar .env (parser minimo: KEY=valor, comillas, # comentarios) ----------
$envMap = @{}
foreach ($line in (Get-Content -LiteralPath $envFile)) {
    $t = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($t) -or $t.StartsWith("#")) { continue }
    $eq = $t.IndexOf("=")
    if ($eq -lt 0) { continue }
    $k = $t.Substring(0, $eq).Trim()
    $v = $t.Substring($eq + 1).Trim()
    if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
        $v = $v.Substring(1, $v.Length - 2)
    }
    $envMap[$k] = $v
}

$serverHost = $envMap["OPENCODE_SERVER_HOST"]
if ([string]::IsNullOrWhiteSpace($serverHost)) { $serverHost = "127.0.0.1" }
$serverPort = $envMap["OPENCODE_SERVER_PORT"]
if ([string]::IsNullOrWhiteSpace($serverPort)) { $serverPort = "58941" }
$serverPassword = $envMap["OPENCODE_SERVER_PASSWORD"]
if ([string]::IsNullOrWhiteSpace($serverPassword)) { throw "OPENCODE_SERVER_PASSWORD vacio en .env" }
$serverUser = $envMap["OPENCODE_SERVER_USERNAME"]
if ([string]::IsNullOrWhiteSpace($serverUser)) { $serverUser = "opencode" }
$serverUrl = "http://${serverHost}:${serverPort}"

$process = $null
$exitCode = 1
$tunnelStarted = $false
$ahkProcess = $null

# Funcion auxiliar para matar cualquier proceso que escuche en el puerto dado
function Stop-PortListener {
    param([string]$Port)
    Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

# Espera a que el servidor explicito responda con la auth v2 (Basic user:pw)
function Wait-OpenCodeServer {
    param([string]$Url, [string]$Username, [string]$Password, [int]$TimeoutSec = 30)
    $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${Username}:${Password}"))
    $headers = @{ "Authorization" = "Basic $basic" }
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "$Url/api/info" -Headers $headers -TimeoutSec 5 -UseBasicParsing
            if ($r.StatusCode -eq 200) { return $true }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

try {
    # 1. Limpieza previa de instancias antiguas
    Stop-Process -Name "AutoHotkey64", "AutoHotkey" -Force -ErrorAction SilentlyContinue
    Stop-PortListener -Port $serverPort

    # 1b. El servidor explicito debe ser el UNICO dueno del relay/sesiones.
    # Best-effort: si el stop falla, se continua igualmente.
    Write-Host "[wrapper] Deteniendo background service si esta en marcha (servidor unico)..."
    try {
        & $opencodePath service stop 2>$null | Out-Null
    } catch {
        Write-Host "[wrapper] (sin background service previo, se continua)"
    }

    Write-Host "[wrapper] Iniciando tunel (solicitando elevacion de administrador)..."
    # UAC obligatoria: Start/Stop-Service exige elevacion; sin ella aborta.
    $startProc = Start-Process powershell.exe `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $tunnelStart) `
        -WindowStyle Hidden `
        -Verb RunAs `
        -Wait `
        -PassThru

    if ($startProc.ExitCode -ne 0) {
        throw "tunnel-start.ps1 termino con codigo $($startProc.ExitCode)."
    }

    $tunnelStarted = $true

    # 2. AutoHotkey DESACTIVADO (hotkey ^r de rotacion IP manual; ver hooks\deactivated\rate_limit\).

    # 3. Iniciar el servidor OpenCode EXPLICITO en segundo plano.
    # Auth v2: usuario+password desde .env (OPENCODE_SERVER_USERNAME/PASSWORD).
    Write-Host "[wrapper] Iniciando servidor OpenCode explicito en $serverUrl ..."
    $env:OPENCODE_SERVER_USERNAME = $serverUser
    $env:OPENCODE_SERVER_PASSWORD = $serverPassword

    if ($args -contains "--auto") {
        $env:OPENCODE_AUTO_MODE = "true"
        Write-Host "[wrapper] Detectado --auto. Variable OPENCODE_AUTO_MODE establecida en true."
    }

    Start-Process -FilePath $opencodePath `
        -ArgumentList @("serve", "--port", "$serverPort") `
        -WindowStyle Hidden

    # Wait-OpenCodeServer OBLIGATORIA: sin ella la TUI arranca antes de que
    # el servidor este listo y muere con codigo 1 (no quitar).
    if (-not (Wait-OpenCodeServer -Url $serverUrl -Username $serverUser -Password $serverPassword -TimeoutSec 30)) {
        throw "El servidor explicito no respondio en $serverUrl tras 30s."
    }

    Write-Host "[wrapper] Servidor OpenCode explicito activo en segundo plano (puerto $serverPort)."

    # 4. Iniciar la TUI conectada al servidor explicito (no levanta background service).
    Write-Host "[wrapper] Iniciando TUI OpenCode contra $serverUrl ..."
    $env:OPENCODE_PASSWORD = $serverPassword
    $env:OPENCODE_SERVER_USERNAME = $serverUser

    $cleanArgs = @($args) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    $tuiArgs = @("--server", $serverUrl) + $cleanArgs
    # NOTA: no pasar --username: la TUI v2.0.8 lo rechaza ("Unrecognized flag").
    # La auth usa el usuario por defecto "opencode" (igual que el servidor).

    $startArgs = @{
        FilePath = $opencodePath
        WorkingDirectory = (Get-Location).Path
        ArgumentList = $tuiArgs
        PassThru = $true
        Wait = $true
        RedirectStandardError = (Join-Path $scriptRoot "logs\wrapper_tui_stderr.log")
    }

    $logDir = Join-Path $scriptRoot "logs"
    if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

    $process = Start-Process @startArgs
    $exitCode = $process.ExitCode

    Write-Host "[wrapper] OpenCode termino con codigo $exitCode."
    if ($exitCode -ne 0 -and $exitCode -ne -1073741510) {
        $tuiErrLog = $startArgs.RedirectStandardError
        if (Test-Path -LiteralPath $tuiErrLog) {
            Write-Warning "[wrapper] Ultimas lineas de $tuiErrLog :"
            Get-Content -LiteralPath $tuiErrLog -Tail 10 | ForEach-Object { Write-Warning "  $_" }
        }
    }
}
catch {
    Write-Error "[wrapper] $($_.Exception.Message)"
    $exitCode = 1
}
finally {
    # 5. Siempre en finally: libera el puerto aunque la TUI falle.
    Write-Host "[wrapper] Deteniendo servidor OpenCode explicito..."
    Stop-PortListener -Port $serverPort

    # 6. AutoHotkey DESACTIVADO (nada que cerrar).

    # 7. Detener los servicios del tunel (orden inverso al arranque; UAC).
    if ($tunnelStarted) {
        Write-Host "[wrapper] Deteniendo tunel (solicitando elevacion de administrador)..."
        try {
            $stopProc = Start-Process powershell.exe `
                -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $tunnelStop) `
                -WindowStyle Hidden `
                -Verb RunAs `
                -Wait `
                -PassThru

            if ($stopProc.ExitCode -ne 0) {
                Write-Warning "[wrapper] tunnel-stop.ps1 termino con codigo $($stopProc.ExitCode)."
            }
        }
        catch {
            Write-Warning "[wrapper] Error ejecutando tunnel-stop.ps1: $($_.Exception.Message)"
        }
    }
}

exit $exitCode
