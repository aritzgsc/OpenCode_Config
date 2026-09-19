# Plantilla de alta de servicios Windows con nssm — rama `services`.
# Ejecutar en PowerShell ELEVADO (UAC: clic derecho > Ejecutar como administrador).
# Requiere `nssm.exe` accesible en PATH. Los `*.yml` referenciados son los
# ficheros REALES en `C:/ProgramData/opencode` (copiados desde `examples/`
# y con valores reales), que NUNCA se versionan.
nssm install ServidorNtfy "C:\ProgramData\opencode\ntfy.exe" "serve --config C:\ProgramData\opencode\server.yml"
nssm install TunnelNgrokOpencode "C:\ProgramData\opencode\ngrok.exe" "start --config C:\ProgramData\opencode\ngrok-opencode.yml opencode-tunnel"
nssm install TunnelNgrokNtfy "C:\ProgramData\opencode\ngrok.exe" "start --config C:\ProgramData\opencode\ngrok-ntfy.yml ntfy-tunnel"
nssm install TunnelNgrokCuestionario "C:\ProgramData\opencode\ngrok.exe" "start --config C:\ProgramData\opencode\ngrok-cuestionario.yml cuestionario-tunnel"
# Dominios/emails reales NUNCA aquí: ver examples/ngrok-*.yml con tu-dominio.ngrok-free.dev y tu@email.com
