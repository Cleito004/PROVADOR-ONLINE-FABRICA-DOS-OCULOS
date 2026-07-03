$port = 5501
$oldPfx = "$env:TEMP\kiosk-cert.pfx"

if (Test-Path $oldPfx) {
  Remove-Item $oldPfx -Force
}

Write-Host "Gerando certificado SSL auto-assinado..."

$ips = @()
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|Virtual|Hyper-V|Bluetooth" } | ForEach-Object { $ips += $_.IPAddress }

$san = "DNS=localhost"
foreach ($ip in $ips) {
  if ($ip -match '^\d+\.\d+\.\d+\.\d+$') {
    $san += "&IPAddress=$ip"
  }
}

$cert = New-SelfSignedCertificate `
  -Subject "CN=localhost" `
  -CertStoreLocation "Cert:\CurrentUser\My\" `
  -NotAfter (Get-Date).AddYears(5) `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -TextExtension @("2.5.29.17={text}$san", "2.5.29.37={text}1.3.6.1.5.5.7.3.1") `
  -ErrorAction Stop

Add-Type -AssemblyName System.Security
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("My","CurrentUser")
$store.Open("ReadOnly")
$c = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
$bytes = $c.Export("Pfx", "")
[IO.File]::WriteAllBytes($oldPfx, $bytes)
$store.Close()

Write-Host "Certificado gerado: $($cert.Thumbprint)"
Write-Host ""
Write-Host "Reinicie o servidor: .\iniciar-kiosk.ps1"
