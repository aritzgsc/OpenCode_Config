# Orden de arranque: primero ServidorNtfy, luego los 3 tuneles ngrok.
# Requiere elevacion (UAC): lo invoca el wrapper con -Verb RunAs.
# Stop previo idempotente: deja estado conocido si algo quedo a medias.
Stop-Service ServidorNtfy, TunnelNgrokNtfy, TunnelNgrokOpencode, TunnelNgrokCuestionario -ErrorAction SilentlyContinue

Start-Service ServidorNtfy
Start-Service TunnelNgrokNtfy
Start-Service TunnelNgrokOpencode
Start-Service TunnelNgrokCuestionario
