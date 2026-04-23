param(
    [string]$FrontendRuleName = 'DocTrack Frontend 3000 (Private)',
    [string]$BackendRuleName = 'DocTrack Backend 3001 (Private)'
)

$ErrorActionPreference = 'Stop'

function Reset-PrivateTcpInboundRule {
    param(
        [string]$Name,
        [int]$Port
    )

    $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
    if ($existing) {
        $existing | Remove-NetFirewallRule
    }

    New-NetFirewallRule `
        -DisplayName $Name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Profile Private | Out-Null

    Write-Host "Rule ready: $Name (TCP $Port, Private)" -ForegroundColor Green
}

Reset-PrivateTcpInboundRule -Name $FrontendRuleName -Port 3000
Reset-PrivateTcpInboundRule -Name $BackendRuleName -Port 3001

Write-Host "\nFirewall rules are configured." -ForegroundColor Cyan
Write-Host "Run as Administrator if rule creation fails." -ForegroundColor Yellow
