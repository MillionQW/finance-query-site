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
  call npm.cmd ci
  if errorlevel 1 goto :failed
)

if not exist "apps\web\dist\index.html" goto :build
if not exist "apps\api\dist\main.js" goto :build
if not exist ".build-stamp" goto :build
powershell.exe -NoProfile -Command "$builtAt = (Get-Item '.build-stamp').LastWriteTimeUtc; $inputs = @(Get-ChildItem 'apps\web\src', 'apps\api\src' -Recurse -File) + @(Get-Item 'package.json', 'package-lock.json', 'apps\web\package.json', 'apps\api\package.json', 'apps\web\vite.config.ts', 'apps\web\tsconfig.json', 'apps\api\tsconfig.json', 'apps\api\tsconfig.build.json'); foreach ($input in $inputs) { if ($input.LastWriteTimeUtc -gt $builtAt) { exit 1 } }; exit 0" >nul 2>&1
if errorlevel 1 (
  echo Source changes detected. Rebuilding...
  goto :build
)
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
