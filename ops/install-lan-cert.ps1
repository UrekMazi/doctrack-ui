param(
    [Parameter(Mandatory = $true)]
    [string]$CertificatePath,

    [switch]$LocalMachine
)

$ErrorActionPreference = 'Stop'

$resolvedCertPath = (Resolve-Path $CertificatePath).Path
$targetStore = if ($LocalMachine) { 'Cert:\LocalMachine\Root' } else { 'Cert:\CurrentUser\Root' }

Import-Certificate -FilePath $resolvedCertPath -CertStoreLocation $targetStore | Out-Null

Write-Host "Certificate installed: $resolvedCertPath" -ForegroundColor Green
Write-Host "Store: $targetStore" -ForegroundColor Cyan
Write-Host 'Restart Chrome if it was open during install.' -ForegroundColor Yellow
