@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo Instalando dependencias de Node.js...
  call npm install
  if errorlevel 1 goto error
)
echo.
echo Iniciando Lily's Plays en http://localhost:3000
echo Panel: http://localhost:3001/admin  (solo esta PC)
echo.
call npm start
if errorlevel 1 goto error
goto end
:error
echo.
echo No se pudo iniciar. Revisa que Node.js 22.5 o superior este instalado.
pause
:end
endlocal
