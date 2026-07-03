$port = 5500
$portSsl = 5501

# Check if server is already running
$existing = netstat -ano | Select-String ":$port"
if (-not $existing) {
  Write-Host "Gerando certificado SSL (para câmera no celular/tablet)..."
  try {
    $output = & "$PSScriptRoot\gerar-ssl.ps1" 2>&1 | Out-String
    Write-Host $output
  } catch {
    Write-Warning "Não foi possível gerar o certificado SSL. Câmera só funcionará em localhost."
  }

  Write-Host "Iniciando servidor do kiosk..."
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "$scriptDir\serve-kiosk.js"
  Start-Sleep 2
}

# Show URLs
$ips = @()
try {
  $ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|Virtual|Hyper-V|Bluetooth" -and $_.AddressFamily -eq "IPv4" } | ForEach-Object { $_.IPAddress }
} catch {}

Write-Host ""
Write-Host "  Provador Virtual pronto!" -ForegroundColor Green
Write-Host ""
Write-Host "  Câmera funciona em:" -ForegroundColor Cyan
Write-Host "    Local:  https://localhost:$portSsl" -ForegroundColor Cyan
foreach ($ip in $ips) {
  if ($ip -match '^\d+\.\d+\.\d+\.\d+$') {
    Write-Host "    Rede:   https://${ip}:$portSsl" -ForegroundColor Cyan
  }
}
Write-Host ""
Write-Host "  Sem câmera (navegação apenas):" -ForegroundColor Gray
Write-Host "    Local:  http://localhost:$port" -ForegroundColor Gray
foreach ($ip in $ips) {
  if ($ip -match '^\d+\.\d+\.\d+\.\d+$') {
    Write-Host "    Rede:   http://${ip}:$port" -ForegroundColor Gray
  }
}
Write-Host ""

Start-Process "http://localhost:$portSsl"
