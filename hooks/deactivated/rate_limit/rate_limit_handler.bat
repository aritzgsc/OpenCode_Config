@echo off
setlocal enabledelayedexpansion

:: rate_limit_handler.bat (DESACTIVADO con la guardia en plugins/deactivated/).
::
:: Invocado por rate-limit-guard.js cuando OpenCode detecta un 429.
:: Rota la IP via rotate_ip_adb.bat y lo registra en rate_limit_handler.log
:: con marca de tiempo (correlacion con los reintentos internos de OpenCode).

set "SCRIPT_DIR=%~dp0"
set "ROTATE_SCRIPT=%SCRIPT_DIR%rotate_ip_adb.bat"
set "LOG_FILE=%SCRIPT_DIR%rate_limit_handler.log"

echo [%date% %time%] 429 detectado, iniciando rotacion de IP >> "%LOG_FILE%"

if not exist "%ROTATE_SCRIPT%" (
    echo [%date% %time%] ERROR: no se encuentra rotate_ip_adb.bat en %SCRIPT_DIR% >> "%LOG_FILE%"
    exit /b 1
)

:: Comprobar estado de la conexión USB/ADB
adb get-state >nul 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] ERROR: No hay ningun dispositivo movil detectado/autorizado por ADB >> "%LOG_FILE%"
    exit /b 1
)

call "%ROTATE_SCRIPT%"
set "ROTATE_EXIT=%ERRORLEVEL%"

if %ROTATE_EXIT% neq 0 (
    echo [%date% %time%] rotate_ip_adb.bat termino con codigo %ROTATE_EXIT% >> "%LOG_FILE%"
    exit /b %ROTATE_EXIT%
)

echo [%date% %time%] rotacion de IP completada correctamente >> "%LOG_FILE%"
exit /b 0