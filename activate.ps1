$venvActivate = Join-Path $PSScriptRoot ".venv\Scripts\Activate.ps1"

if (-not (Test-Path $venvActivate)) {
    Write-Error "Missing .venv activation script at: $venvActivate"
    exit 1
}

& $venvActivate
Write-Host "Activated .venv"
python --version
