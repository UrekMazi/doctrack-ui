param(
    [string]$TaskName = 'DocTrack Daily Backup',
    [string]$Time = '18:00',
    [string]$BackupRoot = 'C:\DocTrackBackups',
    [int]$RetentionDays = 30,
    [string]$StorageDrive = 'D:',
    [string]$StorageFolder = 'DocTrack Files',
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupScriptPath = Join-Path $PSScriptRoot 'backup-doctrack.ps1'

if (!(Test-Path $backupScriptPath)) {
    throw "Backup script not found: $backupScriptPath"
}

try {
    $runAt = [datetime]::ParseExact($Time, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
} catch {
    throw "Invalid -Time '$Time'. Use 24-hour HH:mm format (example: 18:00)."
}

$escapedBackupScript = $backupScriptPath.Replace('"', '""')
$escapedBackupRoot = $BackupRoot.Replace('"', '""')
$escapedStorageDrive = $StorageDrive.Replace('"', '""')
$escapedStorageFolder = $StorageFolder.Replace('"', '""')

$arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$escapedBackupScript`"",
    '-BackupRoot', "`"$escapedBackupRoot`"",
    '-RetentionDays', "$RetentionDays",
    '-StorageDrive', "`"$escapedStorageDrive`"",
    '-StorageFolder', "`"$escapedStorageFolder`""
) -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $runAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

if ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
}

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host "Scheduled task configured: $TaskName" -ForegroundColor Green
Write-Host "Run as: $($task.Principal.UserId)" -ForegroundColor Cyan
Write-Host "Schedule: Daily at $Time" -ForegroundColor Cyan
Write-Host "Next run: $($info.NextRunTime)" -ForegroundColor Cyan
if ($RunNow) {
    Write-Host "RunNow requested: task started." -ForegroundColor Yellow
}
