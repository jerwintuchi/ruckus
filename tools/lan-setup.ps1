# Ruckus — one-time LAN setup, so phones on the WiFi can reach the playtest.
#
#   Right-click -> Run with PowerShell (as Administrator), or from an elevated prompt,
#   using this file's own path:
#     & '\\wsl.localhost\<distro>\<path-to-repo>\tools\lan-setup.ps1'
#
#   Undo everything:
#     & '...\tools\lan-setup.ps1' -Remove
#
#   -Distro defaults to Ubuntu-24.04; pass your own if it differs.
#
# WHY THIS IS NEEDED
#   WSL2 runs behind NAT with its own 172.x address. Windows can reach it; nothing else
#   on the network can. A phone typing the Windows LAN IP gets nothing, because Windows
#   is not listening on those ports — WSL is, on a different address.
#
#   Windows 11 can avoid all of this with `networkingMode=mirrored` in .wslconfig. This
#   machine is Windows 10 (build 19045), where that option does not exist, so the answer
#   is a port proxy plus a firewall rule.
#
#   BOTH ports matter. The page loads from 5173, but the game client then dials
#   ws://<the same host>:3001 for the websocket. Forwarding only the page's port gives
#   you a lobby screen that can never connect, which looks like a broken game.
#
#   The WSL IP is reassigned on every WSL restart, so re-run this after one.

[CmdletBinding()]
param(
  [switch]$Remove,
  [int[]]$Ports = @(5173, 3001),
  [string]$Distro = 'Ubuntu-24.04'
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ''
    Write-Host '  This needs Administrator.' -ForegroundColor Red
    Write-Host '  Right-click PowerShell -> Run as administrator, then run it again.' -ForegroundColor DarkGray
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 1
  }
}

Assert-Admin

$ruleName = 'Ruckus playtest'

if ($Remove) {
  foreach ($port in $Ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
    Write-Host "  removed forward for port $port" -ForegroundColor DarkGray
  }
  Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Host '  removed the firewall rule' -ForegroundColor DarkGray
  Write-Host ''
  Write-Host '  Done. Phones can no longer reach the playtest.' -ForegroundColor Green
  Write-Host ''
  Read-Host '  Press Enter to close'
  exit 0
}

# The current WSL address. Reassigned on every WSL restart, which is the usual reason a
# setup that worked yesterday silently stops working today.
$wslIp = (wsl.exe -d $Distro -- hostname -I).Trim().Split(' ')[0]
if (-not $wslIp) {
  Write-Host '  Could not read the WSL IP. Is the distro running?' -ForegroundColor Red
  Read-Host '  Press Enter to close'
  exit 1
}

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ''
Write-Host '  Ruckus — LAN setup' -ForegroundColor White
Write-Host '  ------------------------------------------------------------' -ForegroundColor DarkGray
Write-Host "  WSL is at      $wslIp"
Write-Host "  Windows LAN IP $lanIp"
Write-Host ''

foreach ($port in $Ports) {
  # Delete first: a stale rule pointing at a previous WSL IP is worse than none, because
  # it fails silently rather than obviously.
  netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
  netsh interface portproxy add v4tov4 `
    listenport=$port listenaddress=0.0.0.0 `
    connectport=$port connectaddress=$wslIp | Out-Null
  Write-Host "  forwarding 0.0.0.0:$port -> ${wslIp}:$port" -ForegroundColor Green
}

Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ruleName `
  -Direction Inbound -Action Allow -Protocol TCP `
  -LocalPort $Ports -Profile Private | Out-Null
Write-Host "  firewall rule '$ruleName' allows $($Ports -join ', ') on private networks" -ForegroundColor Green

Write-Host ''
Write-Host '  Phones on this WiFi can now open:' -ForegroundColor White
Write-Host "      http://${lanIp}:$($Ports[0])" -ForegroundColor Cyan
Write-Host ''
Write-Host '  Re-run this after a WSL restart — the WSL IP changes.' -ForegroundColor DarkGray
Write-Host '  Undo with:  lan-setup.ps1 -Remove' -ForegroundColor DarkGray
Write-Host ''
Read-Host '  Press Enter to close'
