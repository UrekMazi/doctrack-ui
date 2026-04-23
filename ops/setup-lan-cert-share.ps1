param(
    [Parameter(Mandatory = $true)]
    [string]$LanIp,

    [string]$ShareName = 'DocTrackCert',
    [string]$CertDir = '.cert'
)

$ErrorActionPreference = 'Stop'

$parsedIp = $null
if (-not [System.Net.IPAddress]::TryParse($LanIp, [ref]$parsedIp)) {
    throw "Invalid -LanIp value: $LanIp"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$certPath = Join-Path $repoRoot $CertDir
$certFile = Join-Path $certPath 'doctrack-lan.cer'

if (-not (Test-Path $certFile)) {
    throw "Missing certificate file: $certFile`nRun ops\\setup-lan-https.ps1 first."
}

# Reset share if it already exists.
$existingShare = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
if ($existingShare) {
    Revoke-SmbShareAccess -Name $ShareName -AccountName 'Everyone' -Force -ErrorAction SilentlyContinue | Out-Null
    Remove-SmbShare -Name $ShareName -Force
}

New-SmbShare -Name $ShareName -Path $certPath -ReadAccess 'Everyone' | Out-Null

Write-Host ''
Write-Host 'LAN certificate share created.' -ForegroundColor Green
Write-Host "Share path: \\$LanIp\$ShareName"
Write-Host "Certificate : \\$LanIp\$ShareName\doctrack-lan.cer"
Write-Host ''
Write-Host 'Run this on each client PC:' -ForegroundColor Cyan
Write-Host "Import-Certificate -FilePath \"\\$LanIp\$ShareName\doctrack-lan.cer\" -CertStoreLocation \"Cert:\CurrentUser\Root\""
Write-Host ''
Write-Host 'If access is denied, run this script as Administrator on host PC.' -ForegroundColor Yellow
