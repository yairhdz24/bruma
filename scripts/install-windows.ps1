# Installs (or updates) Bruma on Windows in one line, from PowerShell:
#
#   irm https://github.com/yairhdz24/bruma/releases/latest/download/install-windows.ps1 | iex
#
# Downloads the latest installer from GitHub Releases, checks its SHA-256 against the
# release's SHA256SUMS.txt (stops if they differ), installs it for your user only
# (no administrator needed), opens Bruma and offers to get your free Groq key.
# Written without accents on purpose: Windows PowerShell 5.1 can misread them.
# Everything runs in its own scope so settings never leak into your PowerShell session.
& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is much faster without the progress bar.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $repo = if ($env:BRUMA_REPO) { $env:BRUMA_REPO } else { 'yairhdz24/bruma' }
    $asset = 'Bruma-Windows-x64-setup.exe'
    $base = "https://github.com/$repo/releases/latest/download"
    $installDir = Join-Path $env:LOCALAPPDATA 'Bruma'
    $setup = Join-Path $env:TEMP "Bruma-setup-$([guid]::NewGuid().ToString('N')).exe"

    if ([Environment]::Is64BitOperatingSystem -eq $false) { throw 'Bruma necesita Windows de 64 bits.' }

    Write-Host ''
    Write-Host '  Bruma - habla y Bruma escribe' -ForegroundColor Cyan
    Write-Host ''

    try {
        Write-Host '  1/3  Descargando y verificando el instalador...'
        Invoke-WebRequest -Uri "$base/$asset" -OutFile $setup -UseBasicParsing
        try { $sums = (Invoke-WebRequest -Uri "$base/SHA256SUMS.txt" -UseBasicParsing).Content } catch { $sums = $null }
        if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
        $line = if ($sums) { ($sums -split "`n") | Where-Object { $_ -match "^\s*([0-9a-fA-F]{64})\s+\*?$([regex]::Escape($asset))\s*$" } | Select-Object -First 1 } else { $null }
        if (-not $line) { throw "Esta version no publica su huella SHA-256. Descarga el instalador desde https://github.com/$repo/releases/latest" }
        $expected = ([regex]::Match($line, '[0-9a-fA-F]{64}')).Value.ToLowerInvariant()
        $actual = (Get-FileHash -Algorithm SHA256 -Path $setup).Hash.ToLowerInvariant()
        if ($expected -ne $actual) { throw 'El instalador descargado no coincide con su huella SHA-256. No se instalo nada; intenta de nuevo.' }

        # Close only the installed copy of Bruma, so the update can replace it.
        Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith("$installDir\", [StringComparison]::OrdinalIgnoreCase) } |
            Stop-Process -Force -ErrorAction SilentlyContinue

        Write-Host '  2/3  Instalando (solo para tu usuario)...'
        $process = Start-Process -FilePath $setup -ArgumentList '/S' -PassThru
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "El instalador termino con el codigo $($process.ExitCode)." }
    } finally {
        Remove-Item $setup -Force -ErrorAction SilentlyContinue
    }

    $exe = @((Join-Path $installDir 'Bruma.exe'), (Join-Path $installDir 'bruma-voice.exe')) |
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
        # From the same release as this installer.
        Invoke-Expression (Invoke-RestMethod -Uri "$base/groq-key.ps1" -UseBasicParsing)
    }
}
