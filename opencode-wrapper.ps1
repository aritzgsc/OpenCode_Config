# Forzar UTF-8 en los streams de salida
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

# -- SERVIDOR UNICO ----------------------------------------------------------
# UN solo servidor explicito (`serve --port ...`).
# La TUI se conecta con `--server`.
# No se usa `opencode service start`.
#
# Arquitectura de red:
#   OpenCode -> Privoxy :8118 -> Tor SOCKS :9050 -> Internet
#
# Tor + Privoxy + AutoHotkey SOLO se activan mediante este wrapper.

$scriptRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$tunnelStart  = Join-Path $scriptRoot "hooks\tunnel\tunnel-start.ps1"
$tunnelStop   = Join-Path $scriptRoot "hooks\tunnel\tunnel-stop.ps1"
$envFile      = Join-Path $scriptRoot ".env"

$userProfileDir = $env:USERPROFILE

if ([string]::IsNullOrWhiteSpace($userProfileDir)) {
    $userProfileDir = [Environment]::GetFolderPath("UserProfile")
}

if ([string]::IsNullOrWhiteSpace($userProfileDir) -and
    (-not [string]::IsNullOrWhiteSpace($HOME))) {
    $userProfileDir = $HOME
}

if ([string]::IsNullOrWhiteSpace($userProfileDir)) {
    $userProfileDir = (Resolve-Path ~ -ErrorAction SilentlyContinue).Path
}

if ([string]::IsNullOrWhiteSpace($userProfileDir)) {
    throw "No se pudo resolver el perfil del usuario (USERPROFILE vacio)"
}

$ahkScript = Join-Path `
    $userProfileDir `
    ".config\opencode\hooks\rate_limit\rotar_ip.ahk"

$opencodePath = Join-Path `
    $userProfileDir `
    "AppData\Roaming\npm\opencode.cmd"

# -- Validaciones -------------------------------------------------------------

if (-not (Test-Path -LiteralPath $tunnelStart -PathType Leaf)) {
    throw "No se encontro tunnel-start.ps1: $tunnelStart"
}

if (-not (Test-Path -LiteralPath $tunnelStop -PathType Leaf)) {
    throw "No se encontro tunnel-stop.ps1: $tunnelStop"
}

if (-not (Test-Path -LiteralPath $opencodePath)) {
    throw "No se encontro el ejecutable de OpenCode en: $opencodePath"
}

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "No se encontro .env: $envFile"
}

if (-not (Test-Path -LiteralPath $ahkScript -PathType Leaf)) {
    throw "No se encontro el script AutoHotkey: $ahkScript"
}

# -- Cargar .env --------------------------------------------------------------
# Parser minimo: KEY=valor, comillas y comentarios.

$envMap = @{}

foreach ($line in (Get-Content -LiteralPath $envFile)) {
    $t = $line.Trim()

    if ([string]::IsNullOrWhiteSpace($t) -or $t.StartsWith("#")) {
        continue
    }

    $eq = $t.IndexOf("=")

    if ($eq -lt 0) {
        continue
    }

    $k = $t.Substring(0, $eq).Trim()
    $v = $t.Substring($eq + 1).Trim()

    if (
        $v.Length -ge 2 -and
        (
            ($v.StartsWith('"') -and $v.EndsWith('"')) -or
            ($v.StartsWith("'") -and $v.EndsWith("'"))
        )
    ) {
        $v = $v.Substring(1, $v.Length - 2)
    }

    $envMap[$k] = $v
}

# -- Servidor OpenCode --------------------------------------------------------

$serverHost = $envMap["OPENCODE_SERVER_HOST"]

if ([string]::IsNullOrWhiteSpace($serverHost)) {
    $serverHost = "127.0.0.1"
}

$serverPort = $envMap["OPENCODE_SERVER_PORT"]

if ([string]::IsNullOrWhiteSpace($serverPort)) {
    $serverPort = "58941"
}

$serverPassword = $envMap["OPENCODE_SERVER_PASSWORD"]

if ([string]::IsNullOrWhiteSpace($serverPassword)) {
    throw "OPENCODE_SERVER_PASSWORD vacio en .env"
}

$serverUser = $envMap["OPENCODE_SERVER_USERNAME"]

if ([string]::IsNullOrWhiteSpace($serverUser)) {
    $serverUser = "opencode"
}

$serverUrl = "http://${serverHost}:${serverPort}"

# -- Tor ----------------------------------------------------------------------

$torEnabledValue = $envMap["OPENCODE_TOR_ENABLED"]

$torEnabled =
    (-not [string]::IsNullOrWhiteSpace($torEnabledValue)) -and
    ($torEnabledValue -ieq "true")

$torExe = $envMap["OPENCODE_TOR_EXE"]
$torrcPath = $envMap["OPENCODE_TORRC"]

$torSocksHost = $envMap["OPENCODE_TOR_SOCKS_HOST"]

if ([string]::IsNullOrWhiteSpace($torSocksHost)) {
    $torSocksHost = "127.0.0.1"
}

$torSocksPort = $envMap["OPENCODE_TOR_SOCKS_PORT"]

if ([string]::IsNullOrWhiteSpace($torSocksPort)) {
    $torSocksPort = "9050"
}

$torControlHost = $envMap["OPENCODE_TOR_CONTROL_HOST"]

if ([string]::IsNullOrWhiteSpace($torControlHost)) {
    $torControlHost = "127.0.0.1"
}

$torControlPort = $envMap["OPENCODE_TOR_CONTROL_PORT"]

if ([string]::IsNullOrWhiteSpace($torControlPort)) {
    $torControlPort = "9051"
}

$torControlPassword = $envMap["OPENCODE_TOR_CONTROL_PASSWORD"]

$httpProxy = $envMap["OPENCODE_HTTP_PROXY"]

if ([string]::IsNullOrWhiteSpace($httpProxy)) {
    $httpProxy = "http://127.0.0.1:8118"
}

$httpsProxy = $envMap["OPENCODE_HTTPS_PROXY"]

if ([string]::IsNullOrWhiteSpace($httpsProxy)) {
    $httpsProxy = $httpProxy
}

$noProxy = $envMap["OPENCODE_NO_PROXY"]

if ([string]::IsNullOrWhiteSpace($noProxy)) {
    $noProxy = "localhost,127.0.0.1,::1"
}

if ($torEnabled) {
    if ([string]::IsNullOrWhiteSpace($torExe)) {
        throw "OPENCODE_TOR_EXE vacio en .env"
    }

    if ([string]::IsNullOrWhiteSpace($torrcPath)) {
        throw "OPENCODE_TORRC vacio en .env"
    }

    if ([string]::IsNullOrWhiteSpace($torControlPassword)) {
        throw "OPENCODE_TOR_CONTROL_PASSWORD vacio en .env"
    }

    if (-not (Test-Path -LiteralPath $torExe -PathType Leaf)) {
        throw "No se encontro tor.exe: $torExe"
    }

    if (-not (Test-Path -LiteralPath $torrcPath -PathType Leaf)) {
        throw "No se encontro torrc: $torrcPath"
    }
}

# -- Estado -------------------------------------------------------------------

$process = $null
$exitCode = 1

$tunnelStarted = $false
$ahkProcess = $null
$torProcess = $null

# -- Funciones ----------------------------------------------------------------

function Stop-PortListener {
    param(
        [string]$Port
    )

    Get-NetTCPConnection `
        -LocalPort $Port `
        -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            Stop-Process `
                -Id $_ `
                -Force `
                -ErrorAction SilentlyContinue
        }
}

function Wait-TcpPort {
    param(
        [string]$Address,
        [int]$Port,
        [int]$TimeoutSec = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)

    while ((Get-Date) -lt $deadline) {
        $client = $null
        $async = $null

        try {
            $client = [System.Net.Sockets.TcpClient]::new()

            $async = $client.BeginConnect(
                $Address,
                $Port,
                $null,
                $null
            )

            if (
                $async.AsyncWaitHandle.WaitOne(1000) -and
                $client.Connected
            ) {
                $client.EndConnect($async)
                $client.Close()
                return $true
            }
        }
        catch {
            # Seguir esperando.
        }
        finally {
            try {
                if ($client) {
                    $client.Close()
                }
            }
            catch {}
        }

        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Wait-OpenCodeServer {
    param(
        [string]$Url,
        [string]$Username,
        [string]$Password,
        [int]$TimeoutSec = 30
    )

    $basic = [Convert]::ToBase64String(
        [Text.Encoding]::UTF8.GetBytes(
            "${Username}:${Password}"
        )
    )

    $headers = @{
        "Authorization" = "Basic $basic"
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSec)

    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest `
                -Uri "$Url/api/info" `
                -Headers $headers `
                -TimeoutSec 5 `
                -UseBasicParsing

            if ($r.StatusCode -eq 200) {
                return $true
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    return $false
}

function Resolve-AutoHotkey {
    $candidates = @()

    try {
        $cmd = Get-Command AutoHotkey64.exe `
            -ErrorAction SilentlyContinue

        if ($cmd) {
            $candidates += $cmd.Source
        }
    }
    catch {}

    try {
        $cmd = Get-Command AutoHotkey.exe `
            -ErrorAction SilentlyContinue

        if ($cmd) {
            $candidates += $cmd.Source
        }
    }
    catch {}

    $programFiles = $env:ProgramFiles

    if (-not [string]::IsNullOrWhiteSpace($programFiles)) {
        $candidates += Join-Path `
            $programFiles `
            "AutoHotkey\v2\AutoHotkey64.exe"

        $candidates += Join-Path `
            $programFiles `
            "AutoHotkey\v2\AutoHotkey.exe"

        $candidates += Join-Path `
            $programFiles `
            "AutoHotkey\UX\AutoHotkeyUX.exe"
    }

    $localAppData = $env:LOCALAPPDATA

    if (-not [string]::IsNullOrWhiteSpace($localAppData)) {
        $candidates += Join-Path `
            $localAppData `
            "Programs\AutoHotkey\v2\AutoHotkey64.exe"

        $candidates += Join-Path `
            $localAppData `
            "Programs\AutoHotkey\v2\AutoHotkey.exe"
    }

    foreach ($candidate in $candidates) {
        if (
            -not [string]::IsNullOrWhiteSpace($candidate) -and
            (Test-Path -LiteralPath $candidate -PathType Leaf)
        ) {
            return $candidate
        }
    }

    return $null
}

# -- ARRANQUE -----------------------------------------------------------------

try {
    # 1. Limpieza previa de una posible ejecución incompleta.

    Stop-Process `
        -Name "AutoHotkey64", "AutoHotkey", "AutoHotkeyUX" `
        -Force `
        -ErrorAction SilentlyContinue

    Stop-PortListener -Port $serverPort

    Write-Host "[wrapper] Deteniendo background service si esta en marcha..."

    try {
        & $opencodePath service stop 2>$null | Out-Null
    }
    catch {
        Write-Host "[wrapper] (sin background service previo, se continua)"
    }

    # 2. Preparar Tor.

    if ($torEnabled) {
        Write-Host "[wrapper] Iniciando Tor..."

        New-Item `
            -ItemType Directory `
            -Path (Join-Path $userProfileDir ".config\opencode\tor-data") `
            -Force |
            Out-Null

        New-Item `
            -ItemType Directory `
            -Path (Join-Path $userProfileDir ".config\opencode\logs") `
            -Force |
            Out-Null

        # Si los puertos ya están ocupados no matamos otro Tor:
        # abortamos para no interferir con una instancia externa.
        if (
            Wait-TcpPort `
                -Address $torSocksHost `
                -Port ([int]$torSocksPort) `
                -TimeoutSec 1
        ) {
            throw "El puerto Tor SOCKS ${torSocksHost}:$torSocksPort ya esta ocupado."
        }

        if (
            Wait-TcpPort `
                -Address $torControlHost `
                -Port ([int]$torControlPort) `
                -TimeoutSec 1
        ) {
            throw "El puerto Tor Control ${torControlHost}:$torControlPort ya esta ocupado."
        }

        $torProcess = Start-Process `
            -FilePath $torExe `
            -ArgumentList @(
                "-f",
                $torrcPath
            ) `
            -WindowStyle Hidden `
            -WorkingDirectory (Split-Path -Parent $torExe) `
            -PassThru

        if (
            -not (
                Wait-TcpPort `
                    -Address $torSocksHost `
                    -Port ([int]$torSocksPort) `
                    -TimeoutSec 60
            )
        ) {
            throw "Tor no abrio SOCKS en ${torSocksHost}:$torSocksPort tras 60s."
        }

        if (
            -not (
                Wait-TcpPort `
                    -Address $torControlHost `
                    -Port ([int]$torControlPort) `
                    -TimeoutSec 30
            )
        ) {
            throw "Tor no abrio ControlPort en ${torControlHost}:$torControlPort tras 30s."
        }

        # Estas variables solo existen en el proceso del wrapper
        # y sus hijos.
        $env:HTTP_PROXY = $httpProxy
        $env:HTTPS_PROXY = $httpsProxy
        $env:NO_PROXY = $noProxy

        # Esta variable habilita la rotacion SOLO durante esta ejecucion.
        $env:OPENCODE_TOR_RATE_LIMIT_ROTATION_ENABLED = "true"

        $env:OPENCODE_TOR_CONTROL_HOST = $torControlHost
        $env:OPENCODE_TOR_CONTROL_PORT = "$torControlPort"
        $env:OPENCODE_TOR_CONTROL_PASSWORD = $torControlPassword

        Write-Host "[wrapper] Tor SOCKS activo en ${torSocksHost}:$torSocksPort."
        Write-Host "[wrapper] Tor Control activo en ${torControlHost}:$torControlPort."
        Write-Host "[wrapper] HTTP_PROXY  -> $httpProxy"
        Write-Host "[wrapper] HTTPS_PROXY -> $httpsProxy"
        Write-Host "[wrapper] NO_PROXY     -> $noProxy"
        Write-Host "[wrapper] Rotacion Tor habilitada."
    }
    else {
        $env:OPENCODE_TOR_RATE_LIMIT_ROTATION_ENABLED = "false"

        Remove-Item `
            Env:HTTP_PROXY `
            -ErrorAction SilentlyContinue

        Remove-Item `
            Env:HTTPS_PROXY `
            -ErrorAction SilentlyContinue

        Remove-Item `
            Env:NO_PROXY `
            -ErrorAction SilentlyContinue
    }

    # 3. Arrancar servicios del tunel.
    # El hook arranca:
    #   Privoxy
    #   ServidorNtfy
    #   TunnelNgrokNtfy
    #   TunnelNgrokOpencode
    #   TunnelNgrokCuestionario

    Write-Host "[wrapper] Iniciando tunel/servicios (UAC)..."

    $startProc = Start-Process powershell.exe `
        -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            $tunnelStart
        ) `
        -WindowStyle Hidden `
        -Verb RunAs `
        -Wait `
        -PassThru

    if ($startProc.ExitCode -ne 0) {
        throw "tunnel-start.ps1 termino con codigo $($startProc.ExitCode)."
    }

    $tunnelStarted = $true

    if ($torEnabled) {
        if (
            -not (
                Wait-TcpPort `
                    -Address "127.0.0.1" `
                    -Port 8118 `
                    -TimeoutSec 30
            )
        ) {
            throw "Privoxy no abrio 127.0.0.1:8118 tras 30s."
        }

        Write-Host "[wrapper] Privoxy activo en 127.0.0.1:8118."
    }

    # 4. Arrancar AutoHotkey.
    #
    # Ctrl+R -> rate_limit_handler.bat manual_ctrl_r
    #
    # Se inicia SOLO mediante este wrapper.
    $ahkExe = Resolve-AutoHotkey

    if (-not $ahkExe) {
        throw "No se encontro AutoHotkey v2 (AutoHotkey64.exe/AutoHotkey.exe)."
    }

    Write-Host "[wrapper] Iniciando AutoHotkey..."
    Write-Host "[wrapper] Ctrl+R = solicitar nuevo circuito Tor."

    $ahkProcess = Start-Process `
        -FilePath $ahkExe `
        -ArgumentList @(
            "`"$ahkScript`""
        ) `
        -WindowStyle Hidden `
        -PassThru

    if (-not $ahkProcess) {
        throw "No se pudo iniciar AutoHotkey."
    }

    # 5. Iniciar servidor OpenCode EXPLICITO.
    Write-Host "[wrapper] Iniciando servidor OpenCode explicito en $serverUrl ..."

    $env:OPENCODE_SERVER_USERNAME = $serverUser
    $env:OPENCODE_SERVER_PASSWORD = $serverPassword

    if ($args -contains "--auto") {
        $env:OPENCODE_AUTO_MODE = "true"

        Write-Host `
            "[wrapper] Detectado --auto. OPENCODE_AUTO_MODE=true."
    }

    Start-Process `
        -FilePath $opencodePath `
        -ArgumentList @(
            "serve",
            "--port",
            "$serverPort"
        ) `
        -WindowStyle Hidden

    # OBLIGATORIO: esperar al servidor.
    if (
        -not (
            Wait-OpenCodeServer `
                -Url $serverUrl `
                -Username $serverUser `
                -Password $serverPassword `
                -TimeoutSec 30
        )
    ) {
        throw "El servidor explicito no respondio en $serverUrl tras 30s."
    }

    Write-Host `
        "[wrapper] Servidor OpenCode activo en segundo plano (puerto $serverPort)."

    # 6. Arrancar TUI conectada al servidor unico.
    Write-Host "[wrapper] Iniciando TUI OpenCode contra $serverUrl ..."

    $env:OPENCODE_PASSWORD = $serverPassword
    $env:OPENCODE_SERVER_USERNAME = $serverUser

    $cleanArgs = @($args) |
        Where-Object {
            -not [string]::IsNullOrWhiteSpace($_)
        }

    $tuiArgs = @(
        "--server",
        $serverUrl
    ) + $cleanArgs

    $wtAvailable =
        (Get-Command wt.exe -ErrorAction SilentlyContinue) -ne $null

    $wtLaunched = $false

    if ($wtAvailable) {
        $quotedArgs = @($tuiArgs) |
            ForEach-Object {
                "'" + ($_ -replace "'", "''") + "'"
            }

        $tuiCommand =
            "& '" +
            ($opencodePath -replace "'", "''") +
            "' " +
            ($quotedArgs -join " ")

        try {
            Start-Process `
                -FilePath "wt.exe" `
                -ArgumentList @(
                    "-w",
                    "0",
                    "nt",
                    "-d",
                    (Get-Location).Path,
                    "--",
                    "powershell",
                    "-NoExit",
                    "-Command",
                    $tuiCommand
                ) `
                -ErrorAction Stop

            $wtLaunched = $true

            Write-Host `
                "[wrapper] TUI abierta en Windows Terminal."
        }
        catch {
            Write-Warning `
                "[wrapper] wt fallo ($($_.Exception.Message)). Se usa lanzamiento clasico."
        }
    }

    if ($wtLaunched) {
        do {
            Start-Sleep -Seconds 2

            $tuiAlive =
                Get-CimInstance `
                    Win32_Process `
                    -Filter "Name='opencode.exe'" `
                    -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.CommandLine -like "*--server*$serverPort*"
                }

        } while ($tuiAlive)

        $exitCode = 0

        Write-Host `
            "[wrapper] TUI cerrada."
    }
    else {
        $logDir = Join-Path `
            $scriptRoot `
            "logs"

        if (-not (Test-Path -LiteralPath $logDir)) {
            New-Item `
                -ItemType Directory `
                -Path $logDir `
                -Force |
                Out-Null
        }

        $startArgs = @{
            FilePath = $opencodePath
            WorkingDirectory = (Get-Location).Path
            ArgumentList = $tuiArgs
            PassThru = $true
            Wait = $true
            RedirectStandardError =
                (Join-Path `
                    $scriptRoot `
                    "logs\wrapper_tui_stderr.log")
        }

        $process = Start-Process @startArgs

        $exitCode = $process.ExitCode

        Write-Host `
            "[wrapper] OpenCode termino con codigo $exitCode."

        if (
            $exitCode -ne 0 -and
            $exitCode -ne -1073741510
        ) {
            $tuiErrLog =
                $startArgs.RedirectStandardError

            if (
                Test-Path -LiteralPath $tuiErrLog
            ) {
                Write-Warning `
                    "[wrapper] Ultimas lineas de $tuiErrLog :"

                Get-Content `
                    -LiteralPath $tuiErrLog `
                    -Tail 10 |
                    ForEach-Object {
                        Write-Warning "  $_"
                    }
            }
        }
    }
}
catch {
    Write-Error `
        "[wrapper] $($_.Exception.Message)"

    $exitCode = 1
}
finally {
    # 7. Detener servidor OpenCode.
    Write-Host `
        "[wrapper] Deteniendo servidor OpenCode..."

    Stop-PortListener `
        -Port $serverPort

    # 8. Detener AutoHotkey.
    if ($ahkProcess) {
        try {
            if (-not $ahkProcess.HasExited) {
                Write-Host `
                    "[wrapper] Deteniendo AutoHotkey..."

                Stop-Process `
                    -Id $ahkProcess.Id `
                    -Force `
                    -ErrorAction SilentlyContinue
            }
        }
        catch {}
    }

    # Limpieza por si AHK murio y dejo otra instancia asociada.
    Stop-Process `
        -Name "AutoHotkey64", "AutoHotkey", "AutoHotkeyUX" `
        -Force `
        -ErrorAction SilentlyContinue

    # 9. Detener servicios del tunel.
    if ($tunnelStarted) {
        Write-Host `
            "[wrapper] Deteniendo tunel/servicios (UAC)..."

        try {
            $stopProc = Start-Process powershell.exe `
                -ArgumentList @(
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-WindowStyle",
                    "Hidden",
                    "-File",
                    $tunnelStop
                ) `
                -WindowStyle Hidden `
                -Verb RunAs `
                -Wait `
                -PassThru

            if ($stopProc.ExitCode -ne 0) {
                Write-Warning `
                    "[wrapper] tunnel-stop.ps1 termino con codigo $($stopProc.ExitCode)."
            }
        }
        catch {
            Write-Warning `
                "[wrapper] Error ejecutando tunnel-stop.ps1: $($_.Exception.Message)"
        }
    }

    # 10. Detener Tor que ARRANCO ESTE wrapper.
    if ($torProcess) {
        try {
            if (-not $torProcess.HasExited) {
                Write-Host "[wrapper] Deteniendo Tor..."

                Stop-Process `
                    -Id $torProcess.Id `
                    -Force `
                    -ErrorAction SilentlyContinue
            }
        }
        catch {}
    }

    # Tor puede tardar un instante en liberar los puertos.
    Start-Sleep -Milliseconds 500

    # 11. Variables solo del entorno del wrapper.
    Remove-Item `
        Env:OPENCODE_TOR_RATE_LIMIT_ROTATION_ENABLED `
        -ErrorAction SilentlyContinue

    Remove-Item `
        Env:OPENCODE_TOR_CONTROL_HOST `
        -ErrorAction SilentlyContinue

    Remove-Item `
        Env:OPENCODE_TOR_CONTROL_PORT `
        -ErrorAction SilentlyContinue

    Remove-Item `
        Env:OPENCODE_TOR_CONTROL_PASSWORD `
        -ErrorAction SilentlyContinue

    Remove-Item `
        Env:HTTP_PROXY `
        -ErrorAction SilentlyContinue

    Remove-Item `
        Env:HTTPS_PROXY `
        -ErrorAction SilentlyContinue

    Remove-Item `
        Env:NO_PROXY `
        -ErrorAction SilentlyContinue

    Write-Host "[wrapper] Limpieza completada."
}

exit $exitCode
