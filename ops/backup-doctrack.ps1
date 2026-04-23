param(
    [string]$BackupRoot = 'C:\DocTrackBackups',
    [int]$RetentionDays = 30,
    [string]$StorageFolder = 'DocTrack Files',
    [string]$StorageDrive = 'D:'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dbPath = Join-Path $repoRoot 'server\doctrack.db'
$dbWalPath = "$dbPath-wal"
$dbShmPath = "$dbPath-shm"

$storageDriveRoot = if ($StorageDrive.EndsWith(':')) { "$StorageDrive\" } else { $StorageDrive }
$storagePath = if (Test-Path $storageDriveRoot) {
    Join-Path $storageDriveRoot $StorageFolder
} else {
    $null
}

if (!(Test-Path $dbPath)) {
    throw "Database not found: $dbPath"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stageDir = Join-Path $BackupRoot "staging-$timestamp"
$finalZip = Join-Path $BackupRoot "doctrack-backup-$timestamp.zip"

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Copy-Item $dbPath (Join-Path $stageDir 'doctrack.db') -Force
if (Test-Path $dbWalPath) {
    Copy-Item $dbWalPath (Join-Path $stageDir 'doctrack.db-wal') -Force
}
if (Test-Path $dbShmPath) {
    Copy-Item $dbShmPath (Join-Path $stageDir 'doctrack.db-shm') -Force
}

if ($storagePath -and (Test-Path $storagePath)) {
    Copy-Item $storagePath (Join-Path $stageDir 'files') -Recurse -Force
} else {
    if ($storagePath) {
        Write-Host "[WARN] Storage path not found, skipping files backup: $storagePath" -ForegroundColor Yellow
    } else {
        Write-Host "[WARN] Storage drive not found ($StorageDrive), skipping files backup." -ForegroundColor Yellow
    }
}

Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $finalZip -Force
Remove-Item $stageDir -Recurse -Force

$cutoff = (Get-Date).AddDays(-1 * $RetentionDays)
Get-ChildItem -Path $BackupRoot -Filter 'doctrack-backup-*.zip' -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force

Write-Host "Backup created: $finalZip" -ForegroundColor Green
Write-Host "Retention policy: $RetentionDays day(s)" -ForegroundColor Cyan
