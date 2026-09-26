# Orden inverso al arranque: primero los 3 tuneles, luego ServidorNtfy.
# Requiere elevacion (UAC): lo invoca el wrapper con -Verb RunAs (siempre en finally).
Stop-Service TunnelNgrokCuestionario
Stop-Service TunnelNgrokOpencode
Stop-Service TunnelNgrokNtfy
Stop-Service ServidorNtfy
Stop-Service privoxy