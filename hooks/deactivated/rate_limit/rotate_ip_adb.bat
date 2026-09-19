@echo off
:: rotate_ip_adb.bat (DESACTIVADO con la guardia en plugins/deactivated/).
:: Rotacion de IP via ADB: modo avion on/off + re-activa el tethering.
:: Requiere dispositivo autorizado (`adb get-state` OK).
title Cambiar IP - Modo Avion (Poco X7 Pro)
cls

echo [1/3] Activando Modo Avion...
adb shell cmd connectivity airplane-mode enable
adb shell sleep 2

echo [2/3] Desactivando Modo Avion (Nueva IP)...
adb shell cmd connectivity airplane-mode disable

echo [3/3] Activando Punto de Acceso...
:: 1. Cerramos Ajustes por si estaba abierto en segundo plano (Estado limpio)
adb shell am force-stop com.android.settings >nul 2>&1
adb shell sleep 0.5

:: 2. Abre la pantalla de anclaje
adb shell am start -n com.android.settings/.TetherSettings -f 0x10800000 >nul 2>&1
adb shell sleep 1

:: 3. Simula un toque en la primera opción
adb shell input tap 1050 900 >nul 2>&1
adb shell sleep 0.25

:: 4. Matamos la app de Ajustes y volvemos al inicio
adb shell am force-stop com.android.settings >nul 2>&1
adb shell input keyevent 3 >nul 2>&1

echo.
echo ====================================
echo   IP Cambiada y Ajustes Cerrados
echo ====================================
adb shell sleep 3