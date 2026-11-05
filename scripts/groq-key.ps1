# Your free Groq key for Bruma, in under a minute, from PowerShell:
#
#   irm https://raw.githubusercontent.com/yairhdz24/bruma/main/scripts/groq-key.ps1 | iex
#
# 1. Opens Groq's key page in your browser (sign in with Google or your email).
# 2. You tap "Create API Key" and "Copy". This script notices the copied key by itself.
# 3. It checks the key with Groq and saves it in Windows Credential Manager, exactly where
#    Bruma reads it. The key is never printed, never sent anywhere but Groq, and the
#    clipboard is cleared afterwards.
# Written without accents on purpose: Windows PowerShell 5.1 can misread them.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$keyPattern = '^gsk_[A-Za-z0-9_-]{36,252}$'

function Get-ClipboardText {
    try { $text = Get-Clipboard -Raw -ErrorAction Stop } catch { return '' }
    if ($null -eq $text) { return '' }
    return ([string]$text).Trim()
}

function Test-GroqKey([string]$key) {
    try {
        Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/models' -Headers @{ Authorization = "Bearer $key" } -UseBasicParsing -TimeoutSec 15 | Out-Null
        return 'ok'
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -eq 401 -or $status -eq 403) { return 'rejected' }
        if ($status -eq 429) { return 'ok' }
        return 'offline'
    }
}

# Same place and format the app uses (Rust keyring crate): generic credential
# "groq.com.bruma.voice.personal", user "groq", password stored as UTF-16.
if (-not ('Bruma.Credentials' -as [type])) {
    Add-Type -Namespace Bruma -Name Credentials -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
}
[DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "CredWriteW")]
private static extern bool CredWrite(ref CREDENTIAL credential, int flags);
public static bool Save(string target, string user, string secret) {
    byte[] bytes = System.Text.Encoding.Unicode.GetBytes(secret);
    IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
    try {
        Marshal.Copy(bytes, 0, blob, bytes.Length);
        CREDENTIAL c = new CREDENTIAL();
        c.Type = 1;            // CRED_TYPE_GENERIC
        c.Persist = 3;         // CRED_PERSIST_ENTERPRISE, like the app
        c.TargetName = target; c.UserName = user; c.Comment = "Bruma";
        c.CredentialBlob = blob; c.CredentialBlobSize = bytes.Length;
        return CredWrite(ref c, 0);
    } finally { Marshal.FreeHGlobal(blob); }
}
'@
}

Write-Host ''
Write-Host '  Clave gratis de Groq para Bruma' -ForegroundColor Cyan
Write-Host ''
Write-Host '  1. Se abre console.groq.com/keys. Entra con Google o con tu correo.'
Write-Host '  2. Toca "Create API Key", escribe Bruma y toca "Copy".'
Write-Host '  3. Nada mas. Esta ventana detecta la clave sola.'
Write-Host ''

# A key copied before running this works too.
$key = Get-ClipboardText
if ($key -notmatch $keyPattern) {
    Start-Process 'https://console.groq.com/keys'
    Write-Host '  Esperando a que copies la clave (Ctrl+C para salir)' -NoNewline
    $deadline = (Get-Date).AddMinutes(10)
    do {
        Start-Sleep -Milliseconds 800
        Write-Host '.' -NoNewline
        $key = Get-ClipboardText
    } until ($key -match $keyPattern -or (Get-Date) -gt $deadline)
    Write-Host ''
    if ($key -notmatch $keyPattern) { Write-Host '  No llego ninguna clave. Vuelve a ejecutar el comando cuando quieras.' -ForegroundColor Yellow; return }
}

$masked = 'gsk_...' + $key.Substring($key.Length - 4)
Write-Host "  Clave detectada: $masked"
Write-Host '  Comprobando con Groq...'
switch (Test-GroqKey $key) {
    'rejected' { Write-Host '  Groq rechazo esa clave. Copia la clave completa (o crea otra) y vuelve a ejecutar el comando.' -ForegroundColor Red; return }
    'offline'  { Write-Host '  No se pudo hablar con Groq ahora; la guardo igual y Bruma la usara cuando haya internet.' -ForegroundColor Yellow }
    default    { Write-Host '  Groq acepto la clave.' -ForegroundColor Green }
}

if (-not [Bruma.Credentials]::Save('groq.com.bruma.voice.personal', 'groq', $key)) {
    throw "Windows no permitio guardar la clave (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
}
# Don't leave the key on the clipboard.
if ((Get-ClipboardText) -eq $key) { Set-Clipboard -Value ' ' }
$key = $null

Write-Host ''
Write-Host '  Listo. Tu clave quedo guardada solo en esta PC, en el Administrador de credenciales.' -ForegroundColor Green
Write-Host '  Abre Bruma (o vuelve a su ventana): ya puedes dictar gratis con Ctrl + Espacio.'
Write-Host ''
