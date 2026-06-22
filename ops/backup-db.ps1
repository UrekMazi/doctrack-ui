param(
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scriptPath = Join-Path $repoRoot 'server\backup_db.py'

if (!(Test-Path $scriptPath)) {
    throw "Backup script not found: $scriptPath"
}

$pythonArgs = @($scriptPath)
if ($OutputPath) {
    $pythonArgs += @('--output', $OutputPath)
}

& python @pythonArgs
if ($LASTEXITCODE -ne 0) {
    throw 'Database backup failed.'
}
