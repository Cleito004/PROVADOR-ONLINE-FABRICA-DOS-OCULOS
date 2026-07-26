# Abre o Provador em modo vitrine, em tela cheia de verdade (quiosque).
#
# Por padrao roda LOCAL: sobe o servidor desta pasta e abre em localhost.
# Rodar local e mais seguro para a loja - a camera funciona em localhost sem
# certificado, e uma queda de internet nao derruba a vitrine.
#
#   .\iniciar-vitrine.ps1              # local (recomendado)
#   .\iniciar-vitrine.ps1 -Online      # usa o site publicado no Vercel
#   .\iniciar-vitrine.ps1 -Porta 8083  # outra porta, se a 8000 estiver ocupada
#
# Para fechar: Alt+F4 na janela do navegador.

param(
  [switch]$Online,
  [int]$Porta = 8000
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Online) {
  $url = "https://provador-online-ebon-eta.vercel.app/?vitrine=1"
  Write-Host "Modo online: $url" -ForegroundColor Yellow
  Write-Host "Atencao: se a internet cair, a vitrine para. Prefira o modo local." -ForegroundColor Yellow
} else {
  $emUso = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
  if (-not $emUso) {
    Write-Host "Subindo o servidor local na porta $Porta..."
    Start-Process -WindowStyle Hidden -FilePath "node" `
      -ArgumentList "$raiz\serve-root.js" -WorkingDirectory $raiz
    Start-Sleep -Seconds 2
  } else {
    Write-Host "Servidor ja estava rodando na porta $Porta."
  }
  $url = "http://localhost:$Porta/?vitrine=1"
  Write-Host "Modo local: $url" -ForegroundColor Green
}

# Procura Chrome e, se nao achar, Edge - os dois aceitam --kiosk.
$candidatos = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$navegador = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $navegador) {
  Write-Warning "Chrome/Edge nao encontrado. Abrindo no navegador padrao (sem tela cheia)."
  Start-Process $url
  return
}

# --kiosk         = tela cheia sem barra de endereco nem abas
# --autoplay-policy= deixa o video da camera comecar sozinho
# --disable-features=TranslateUI  tira a barrinha de traducao
# perfil separado = nao herda abas nem avisos de outra sessao
$perfil = Join-Path $env:TEMP "provador-vitrine-perfil"
$argumentos = @(
  "--kiosk=$url",
  "--user-data-dir=`"$perfil`"",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-features=TranslateUI",
  "--disable-session-crashed-bubble",
  "--noerrdialogs",
  "--no-first-run"
)

Write-Host "Abrindo $([System.IO.Path]::GetFileName($navegador)) em modo quiosque..." -ForegroundColor Cyan
Start-Process -FilePath $navegador -ArgumentList $argumentos

Write-Host ""
Write-Host "Pronto. Na primeira vez o navegador pede permissao da camera:" -ForegroundColor Cyan
Write-Host "  aceite e deixe marcado para lembrar - depois disso ele nao pergunta mais."
Write-Host "Para fechar a vitrine: Alt+F4."
