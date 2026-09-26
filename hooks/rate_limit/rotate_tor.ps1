$ErrorActionPreference = "Stop"

$hostName = if ([string]::IsNullOrWhiteSpace($env:OPENCODE_TOR_CONTROL_HOST)) {
    "127.0.0.1"
} else {
    $env:OPENCODE_TOR_CONTROL_HOST
}

$port = if ([string]::IsNullOrWhiteSpace($env:OPENCODE_TOR_CONTROL_PORT)) {
    9051
} else {
    [int]$env:OPENCODE_TOR_CONTROL_PORT
}

$password = $env:OPENCODE_TOR_CONTROL_PASSWORD

if ([string]::IsNullOrWhiteSpace($password)) {
    throw "OPENCODE_TOR_CONTROL_PASSWORD no esta definido."
}

$client = [System.Net.Sockets.TcpClient]::new()

try {
    $client.Connect($hostName, $port)

    $stream = $client.GetStream()

    $reader = [System.IO.StreamReader]::new(
        $stream,
        [System.Text.Encoding]::ASCII,
        $false,
        1024,
        $true
    )

    $writer = [System.IO.StreamWriter]::new(
        $stream,
        [System.Text.Encoding]::ASCII,
        1024,
        $true
    )

    $writer.NewLine = "`r`n"
    $writer.AutoFlush = $true

    # AUTHENTICATE admite el secreto en hexadecimal.
    # Así evitamos problemas con comillas/caracteres especiales.
    $authHex = (
        [BitConverter]::ToString(
            [System.Text.Encoding]::UTF8.GetBytes($password)
        )
    ).Replace("-", "")

    $writer.WriteLine("AUTHENTICATE $authHex")

    $authReply = $reader.ReadLine()

    if ($authReply -notlike "250*") {
        throw "Tor rechazo AUTHENTICATE: $authReply"
    }

    $writer.WriteLine("SIGNAL NEWNYM")

    $newnymReply = $reader.ReadLine()

    if ($newnymReply -notlike "250*") {
        throw "Tor rechazo SIGNAL NEWNYM: $newnymReply"
    }

    $writer.WriteLine("QUIT")

    try {
        [void]$reader.ReadLine()
    } catch {
        # Tor puede cerrar inmediatamente después de QUIT.
    }

    Write-Output "SIGNAL NEWNYM aceptado por Tor ($hostName`:$port)."

    exit 0
}
finally {
    try {
        if ($writer) {
            $writer.Dispose()
        }
    } catch {}

    try {
        if ($reader) {
            $reader.Dispose()
        }
    } catch {}

    try {
        if ($stream) {
            $stream.Dispose()
        }
    } catch {}

    try {
        $client.Dispose()
    } catch {}
}