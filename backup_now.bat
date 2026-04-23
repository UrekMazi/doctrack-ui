@echo off
setlocal

cd /d "%~dp0"

echo ========================================
echo DocTrack Manual Backup (Run Now)
echo ========================================

echo Running backup script...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ops\backup-doctrack.ps1" -BackupRoot "C:\DocTrackBackups" -RetentionDays 30 -StorageDrive "D:" -StorageFolder "DocTrack Files"

if errorlevel 1 (
  echo.
  echo [ERROR] Backup failed. Please contact system support.
  pause
  exit /b 1
)

echo.
echo Backup completed successfully.
pause
