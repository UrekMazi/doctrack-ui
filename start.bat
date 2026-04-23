@echo off
echo ========================================
echo Starting DocTrack EDMS System
echo ========================================

echo Starting Python Backend Server...
set "DOCTRACK_BACKEND_HOST=127.0.0.1"
set "DOCTRACK_BACKEND_PORT=3001"
set "DOCTRACK_OCR_TARGET_PAGE=1"
set "DOCTRACK_BACKEND_ENV=system-python"
:: Use .venv only (Python 3.11 + PaddleOCR).
if exist ".venv\Scripts\activate.bat" (
	set "DOCTRACK_BACKEND_ENV=.venv"
	start "DocTrack Backend" cmd /k "call .venv\Scripts\activate.bat && set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True && set DOCTRACK_BACKEND_HOST=%DOCTRACK_BACKEND_HOST% && set DOCTRACK_BACKEND_PORT=%DOCTRACK_BACKEND_PORT% && set DOCTRACK_OCR_TARGET_PAGE=%DOCTRACK_OCR_TARGET_PAGE% && cd /d server && python app.py"
) else (
	echo [ERROR] Required environment .venv was not found.
	echo Please create or restore .venv, then run start.bat again.
	pause
	exit /b 1
)
echo Backend Python environment selected: %DOCTRACK_BACKEND_ENV%
echo Backend bind address: %DOCTRACK_BACKEND_HOST%:%DOCTRACK_BACKEND_PORT% (local-only)
echo OCR target page: %DOCTRACK_OCR_TARGET_PAGE% (first page)
if /I "%DOCTRACK_BACKEND_ENV%"=="system-python" echo [WARNING] No project venv found. Using system Python.

echo Waiting for backend to become reachable on port 3001...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(25); $ready=$false; while((Get-Date)-lt $deadline){ try { $client = New-Object System.Net.Sockets.TcpClient; $iar = $client.BeginConnect('127.0.0.1',3001,$null,$null); if($iar.AsyncWaitHandle.WaitOne(300)){ $client.EndConnect($iar); $client.Close(); $ready=$true; break } $client.Close() } catch {}; Start-Sleep -Milliseconds 500 }; if($ready){ exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
	echo [WARNING] Backend is still starting or failed to open port 3001.
	echo [WARNING] Frontend will start, but API calls may fail until backend is ready.
) else (
	echo Backend is reachable.
)

set "DOCTRACK_FRONTEND_SCHEME=http"
set "DOCTRACK_FRONTEND_HTTPS=0"
if exist ".cert\doctrack-lan.pfx" (
	set "DOCTRACK_FRONTEND_SCHEME=https"
	set "DOCTRACK_FRONTEND_HTTPS=1"
	echo HTTPS certificate detected. Frontend will run in secure mode.
) else (
	echo [INFO] HTTPS certificate not found. Frontend will run over HTTP.
	echo [INFO] To enable secure LAN camera access, run:
	echo [INFO] powershell -ExecutionPolicy Bypass -File .\ops\setup-lan-https.ps1 -LanIp YOUR-PC-IP
)

echo Starting React Frontend Server...
if /I "%DOCTRACK_FRONTEND_HTTPS%"=="1" (
	start "DocTrack Frontend" cmd /k "set DOCTRACK_HTTPS=1 && npm run dev"
) else (
	start "DocTrack Frontend" cmd /k "npm run dev"
)

echo.
echo Both servers have been started in separate windows!
echo Please keep those windows open while using the system.
echo Local access: %DOCTRACK_FRONTEND_SCHEME%://localhost:3000
echo LAN access from other PCs: %DOCTRACK_FRONTEND_SCHEME%://YOUR-PC-IP:3000
echo IMPORTANT: Access only via port 3000. Do not open port 3001 from other devices.
if /I "%DOCTRACK_FRONTEND_HTTPS%"=="1" (
	echo NOTE: Install .cert\doctrack-lan.cer on each client PC Trusted Root store.
	echo IMPORTANT: In HTTPS mode, http://localhost:3000 may show ERR_EMPTY_RESPONSE.
	echo IMPORTANT: Use https://localhost:3000 in Chrome/Brave/Edge.
)
echo.
pause