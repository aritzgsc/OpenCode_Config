@echo off
setlocal

:: ============================================================
:: rate_limit_handler.bat
::
:: Sin argumentos:
::   -> llamado automáticamente por rate-limit-guard
::      cuando OpenCode detecta un 429.
::
:: manual_ctrl_r:
::   -> llamado mediante Ctrl+R desde AutoHotkey.
::
:: manual_test:
::   -> prueba manual desde consola.
:: ============================================================

set "SCRIPT_DIR=%~dp0"
set "ROTATE_SCRIPT=%SCRIPT_DIR%rotate_tor.ps1"
set "LOG_FILE=%SCRIPT_DIR%rate_limit_handler.log"

set "REASON=%~1"

if "%REASON%"=="" (
    set "REASON=auto_429"
)

>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo ============================================================
>>"%LOG_FILE%" echo [%date% %time%] Solicitud de rotacion: %REASON%

:: Solo el wrapper habilita la rotacion.
if /I not "%OPENCODE_TOR_RATE_LIMIT_ROTATION_ENABLED%"=="true" (
    >>"%LOG_FILE%" echo [%date% %time%] Rotacion rechazada: el wrapper Tor no esta activo.
    exit /b 2
)

if not exist "%ROTATE_SCRIPT%" (
    >>"%LOG_FILE%" echo [%date% %time%] ERROR: no se encuentra:
    >>"%LOG_FILE%" echo %ROTATE_SCRIPT%
    exit /b 1
)

powershell.exe ^
    -NoProfile ^
    -ExecutionPolicy Bypass ^
    -File "%ROTATE_SCRIPT%" ^
    >>"%LOG_FILE%" 2>&1

set "ROTATE_EXIT=%ERRORLEVEL%"

if not "%ROTATE_EXIT%"=="0" (
    >>"%LOG_FILE%" echo [%date% %time%] ERROR: rotate_tor.ps1 termino con codigo %ROTATE_EXIT%.
    exit /b %ROTATE_EXIT%
)

>>"%LOG_FILE%" echo [%date% %time%] SIGNAL NEWNYM aceptado correctamente.
exit /b 0