# Bruma for Windows: one-line installer.
#   irm https://raw.githubusercontent.com/yairhdz24/bruma/main/scripts/install-windows.ps1 | iex
# Downloads the latest release from GitHub, installs it for the current user (no admin needed) and opens it.
# Set $env:BRUMA_VERSION = "v0.8.0" before running to install a specific version.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is much faster without the progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'yairhdz24/bruma'
$asset = 'Bruma-Windows-x64-setup.exe'
$url = if ($env:BRUMA_VERSION) { "https://github.com/$repo/releases/download/$($env:BRUMA_VERSION)/$asset" }
       else { "https://github.com/$repo/releases/latest/download/$asset" }

if (-not [Environment]::Is64BitOperatingSystem) { throw 'Bruma needs 64-bit Windows 10 or 11.' }

Write-Host ''
Write-Host '  Bruma - habla, Bruma escribe' -ForegroundColor Cyan
Write-Host '  Descargando la ultima version...'
$installer = Join-Path $env:TEMP "Bruma-setup-$PID.exe"
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

# Close a running copy so the update can replace it.
Get-Process -Name 'Bruma', 'bruma-voice' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host '  Instalando...'
$process = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
Remove-Item $installer -Force -ErrorAction SilentlyContinue
if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)." }

$dir = Join-Path $env:LOCALAPPDATA 'Bruma'
$exe = Get-ChildItem -Path $dir -Filter '*.exe' -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -notmatch '^uninstall' } | Select-Object -First 1
if ($exe) { Start-Process -FilePath $exe.FullName }

Write-Host '  Listo. Bruma esta abierta: sigue la bienvenida para elegir tu atajo (Ctrl + Espacio) y pegar tu clave gratis de Groq.' -ForegroundColor Green
Write-Host '  Ready. Bruma is open: follow the welcome tour to pick your shortcut and paste a free Groq key.'
Write-Host ''
