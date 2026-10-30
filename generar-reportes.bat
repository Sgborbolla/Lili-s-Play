@echo off
setlocal
cd /d "%~dp0"
python -c "import xlsxwriter" >nul 2>nul
if errorlevel 1 (
  echo Falta Python o el paquete xlsxwriter.
  echo Instala Python 3 y ejecuta: pip install xlsxwriter
  pause
  exit /b 1
)
call npm run reports
if errorlevel 1 (
  echo.
  echo No se pudo generar el Excel. Revisa el mensaje anterior.
)
pause
endlocal
