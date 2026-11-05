# Installs (or updates) Bruma on Windows in one line, from PowerShell:
#
#   irm https://raw.githubusercontent.com/yairhdz24/bruma/main/scripts/install-windows.ps1 | iex
#
# Downloads the latest installer from GitHub Releases, installs it for your user only
# (no administrator needed), opens Bruma and offers to get your free Groq key.
# Written without accents on purpose: Windows PowerShell 5.1 can misread them.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is much faster without the progress bar.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$repo = if ($env:BRUMA_REPO) { $env:BRUMA_REPO } else { 'yairhdz24/bruma' }
$url = "https://github.com/$repo/releases/latest/download/Bruma-Windows-x64-setup.exe"
$setup = Join-Path $env:TEMP "Bruma-setup-$([guid]::NewGuid().ToString('N')).exe"

if ([Environment]::Is64BitOperatingSystem -eq $false) { throw 'Bruma necesita Windows de 64 bits.' }

Write-Host ''
Write-Host '  Bruma - habla y Bruma escribe' -ForegroundColor Cyan
Write-Host ''

# Close a running copy so the update can replace it.
Get-Process -Name 'Bruma', 'bruma-voice' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host '  1/3  Descargando el instalador...'
Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing

Write-Host '  2/3  Instalando (solo para tu usuario)...'
try {
    Start-Process -FilePath $setup -ArgumentList '/S' -Wait
} finally {
    Remove-Item $setup -Force -ErrorAction SilentlyContinue
}

$exe = @("$env:LOCALAPPDATA\Bruma\Bruma.exe", "$env:LOCALAPPDATA\Bruma\bruma-voice.exe", "$env:LOCALAPPDATA\Programs\Bruma\Bruma.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
Write-Host '  3/3  Abriendo Bruma...'
if ($exe) { Start-Process -FilePath $exe } else { Write-Host '       Busca "Bruma" en el menu Inicio.' -ForegroundColor Yellow }

Write-Host ''
Write-Host '  Listo. Bruma vive junto al reloj (bandeja del sistema).' -ForegroundColor Green
Write-Host '  Dicta con Ctrl + Espacio. Esc cancela.'
Write-Host ''

# Free Groq key, the fastest way.
$answer = Read-Host '  Quieres conseguir tu clave GRATIS de Groq ahora? (S/n)'
if ($answer -eq '' -or $answer -match '^[sSyY]') {
    $helper = "https://raw.githubusercontent.com/$repo/main/scripts/groq-key.ps1"
    Invoke-Expression (Invoke-RestMethod -Uri $helper -UseBasicParsing)
}
