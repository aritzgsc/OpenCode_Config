#Requires AutoHotkey v2.0

; DESACTIVADO con la guardia rate-limit (hooks\deactivated\rate_limit\).
; Hotkey ^r: rotacion de IP manual via rate_limit_handler.bat.

; Condición: Ventana de PowerShell activa Y proceso opencode.exe en ejecución
#HotIf (WinActive("ahk_exe WindowsTerminal.exe") or WinActive("ahk_exe powershell.exe") or WinActive("ahk_exe pwsh.exe")) and ProcessExist("opencode.exe")
^r::
{
    ; 1. Obtenemos el valor real de %USERPROFILE% (ej: C:\Users\TuUsuario)
    userProfile := EnvGet("USERPROFILE")
    
    ; 2. Construimos la ruta completa del archivo .bat
    ; OJO: ruta legacy (hooks\rate_limit\); hoy vive en hooks\deactivated\rate_limit\
    ; (no se corrige el valor: hotkey DESACTIVADO con la guardia).
    batPath := userProfile "\.config\opencode\hooks\rate_limit\rate_limit_handler.bat"
    
    ; 3. Ejecutamos usando la variable nativa A_ComSpec (que equivale a %ComSpec%)
    Run(A_ComSpec ' /c "' batPath '"', , "Hide")
}
#HotIf