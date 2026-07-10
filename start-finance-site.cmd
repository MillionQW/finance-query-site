@echo off
setlocal
cd /d "%~dp0"

set "APP_URL=http://localhost:3000"
set "HEALTH_URL=http://localhost:3000/api/health"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node.js or npm was not found. Please install Node.js first.
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "node_modules" (
  echo Installing Node.js dependencies...
  call npm.cmd install
  if errorlevel 1 goto :failed
)

if not exist "apps\web\dist\index.html" goto :build
if not exist "apps\api\dist\main.js" goto :build
goto :start

:build
echo Building the application for the first run...
call npm.cmd run build
if errorlevel 1 goto :failed

:start
echo Starting Finance Query Site...
echo The browser will open automatically at %APP_URL%.
echo Keep this window open while using the site.
echo.

if not defined FINANCE_SKIP_BROWSER start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$deadline = (Get-Date).AddSeconds(30); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { Start-Process '%APP_URL%'; exit } } catch {}; Start-Sleep -Milliseconds 500 }"
call npm.cmd start

:failed
echo.
echo The site could not be started. Check the message above for details.
pause
exit /b 1
