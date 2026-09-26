#Requires AutoHotkey v2.0

; ============================================================
; OpenCode + Tor
;
; Ctrl+R -> solicita un nuevo circuito Tor mediante:
;
;   rate_limit_handler.bat
;       -> rotate_tor.ps1
;           -> SIGNAL NEWNYM
;
; SOLO se ejecuta mientras OpenCode esté activo.
; ============================================================

#HotIf (
    WinActive("ahk_exe WindowsTerminal.exe")
    || WinActive("ahk_exe powershell.exe")
    || WinActive("ahk_exe pwsh.exe")
) && ProcessExist("opencode.exe")

^r::
{
    userProfile := EnvGet("USERPROFILE")

    batPath := userProfile
        . "\.config\opencode\hooks\rate_limit\rate_limit_handler.bat"

    if !FileExist(batPath) {
        MsgBox(
            "No se encuentra rate_limit_handler.bat:`n`n" . batPath,
            "OpenCode · Error",
            "Iconx"
        )
        return
    }

    ; Construimos explícitamente la línea para cmd.exe.
    ; Evita problemas de sintaxis/continuación en AHK v2.
    cmdLine := '/c ""' . batPath . '" manual_ctrl_r"'

    Run(
        A_ComSpec . " " . cmdLine,
        ,
        "Hide"
    )
}

#HotIf