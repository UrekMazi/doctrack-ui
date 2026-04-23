param(
    [Parameter(Mandatory = $true)]
    [string]$LanIp,

    [string]$OutputDir = '.cert',
    [string]$Passphrase = 'DocTrackLan2026',
    [int]$YearsValid = 3
)

$ErrorActionPreference = 'Stop'

$parsedIp = $null
if (-not [System.Net.IPAddress]::TryParse($LanIp, [ref]$parsedIp)) {
    throw "Invalid -LanIp value: $LanIp"
}

if ($YearsValid -lt 1 -or $YearsValid -gt 10) {
    throw 'YearsValid must be between 1 and 10.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $repoRoot $OutputDir
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$subject = "CN=$LanIp"
$friendlyName = "DocTrack LAN HTTPS ($LanIp)"
$sanExtension = "2.5.29.17={text}IPAddress=$LanIp&DNS=localhost&DNS=$env:COMPUTERNAME"

$certParams = @{
    Type = 'Custom'
    Subject = $subject
    FriendlyName = $friendlyName
    CertStoreLocation = 'Cert:\CurrentUser\My'
    KeyAlgorithm = 'RSA'
    KeyLength = 2048
    KeyExportPolicy = 'Exportable'
    HashAlgorithm = 'SHA256'
    NotAfter = (Get-Date).AddYears($YearsValid)
    TextExtension = @(
        '2.5.29.37={text}1.3.6.1.5.5.7.3.1',
        $sanExtension
    )
}

$cert = New-SelfSignedCertificate @certParams

$securePassphrase = ConvertTo-SecureString -String $Passphrase -AsPlainText -Force
$pfxPath = Join-Path $outputPath 'doctrack-lan.pfx'
$cerPath = Join-Path $outputPath 'doctrack-lan.cer'
$passphrasePath = Join-Path $outputPath 'https-passphrase.txt'

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassphrase | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Set-Content -Path $passphrasePath -Value $Passphrase -Encoding ASCII -NoNewline

# Trust the cert on the host machine so local Chrome treats it as secure.
Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

Write-Host ''
Write-Host 'DocTrack LAN HTTPS certificate created.' -ForegroundColor Green
Write-Host "PFX: $pfxPath"
Write-Host "CER: $cerPath"
Write-Host "Passphrase file: $passphrasePath"
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host "1) Start app with start.bat (HTTPS auto-enables when .cert\doctrack-lan.pfx exists)."
Write-Host "2) On every client PC, import .cert\doctrack-lan.cer to Trusted Root Certification Authorities."
Write-Host "3) Open https://${LanIp}:3000 and allow camera access for QR scanning."
