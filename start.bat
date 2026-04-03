@echo off
echo ========================================
echo Starting DocTrack EDMS System
echo ========================================

echo Starting Python Backend Server...
:: This activates the virtual environment, speeds up PaddleOCR boot, and starts the server
start "DocTrack Backend" cmd /c "call .venv\Scripts\activate && set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True && cd server && python app.py"

echo Starting React Frontend Server...
start "DocTrack Frontend" cmd /c "npm run dev"

echo.
echo Both servers have been started in separate windows!
echo Please keep those windows open while using the system.
echo Access the site at: http://localhost:5173
echo.
pause