Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administratorrechte erforderlich. PowerShell als Administrator starten; es wird nicht automatisch nach Rechten gefragt.'
    }
}

function Invoke-Checked {
    param([string]$File, [string[]]$Arguments = @())
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Befehl fehlgeschlagen: $File (Exit $LASTEXITCODE)" }
}

function Write-Utf8 {
    param([string]$Path, [string]$Content)
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Set-PrivateDirectory {
    param([string]$Path)
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            (New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -Path $Path -AclObject $acl
}

function Grant-Directory {
    param([string]$Path, [string]$Sid, [string]$Rights = 'ReadAndExecute')
    $acl = Get-Acl $Path
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        (New-Object Security.Principal.SecurityIdentifier($Sid)), $Rights, 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -Path $Path -AclObject $acl
}

function Grant-Traverse {
    param([string]$Path, [string]$Sid)
    # Parent access only; never inherit access to secrets, backups or other services.
    $acl = Get-Acl $Path
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        (New-Object Security.Principal.SecurityIdentifier($Sid)), 'Traverse', 'None', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -Path $Path -AclObject $acl
}

function Wait-TimePilot {
    param([int]$Port)
    # curl.exe is part of supported Windows 10/11; retries cover DB startup/migrations.
    $body = & "$env:SystemRoot\System32\curl.exe" --silent --show-error --fail --noproxy '*' --retry 60 --retry-connrefused --retry-delay 1 --retry-max-time 120 --max-time 3 "http://127.0.0.1:$Port/api/health"
    if ($LASTEXITCODE -ne 0) { throw 'TimePilot nicht bereit. Dienstprotokolle im Installationsordner unter logs pruefen.' }
    if (!(($body | ConvertFrom-Json).ok)) { throw 'Unerwartete Health-Antwort.' }
}

function Get-TimePilotInstallation {
    param([string]$InstallDir)
    $manifest = Join-Path $InstallDir 'installation.json'
    if (!(Test-Path $manifest)) { throw 'Keine verwaltete TimePilot-Installation gefunden.' }
    return Get-Content -Raw $manifest | ConvertFrom-Json
}

function Assert-OwnedService {
    param([string]$Name, [string]$Executable)
    $service = Get-CimInstance Win32_Service -Filter "Name='$Name'"
    if ($service -and $service.PathName.Trim('"') -ne $Executable) {
        throw "Der Dienst $Name gehoert nicht zu dieser Installation. Keine Aenderung vorgenommen."
    }
}

function Backup-TimePilot {
    param([string]$InstallDir, [string]$Destination)
    $config = Get-TimePilotInstallation $InstallDir
    $secret = Get-Content -Raw (Join-Path $InstallDir 'secrets.json') | ConvertFrom-Json
    $previousPassword = $env:PGPASSWORD
    if (Test-Path $Destination) { throw 'Sicherungsdatei existiert bereits. Anderen Namen verwenden.' }
    try {
        $env:PGPASSWORD = $secret.appPassword
        Invoke-Checked (Join-Path $InstallDir 'postgres\bin\pg_dump.exe') @(
            '-h', '127.0.0.1', '-p', [string]$config.dbPort, '-U', 'timepilot', '-d', 'timepilot',
            '--no-password', '--format=custom', '--file', $Destination)
    } catch {
        Remove-Item $Destination -Force -ErrorAction SilentlyContinue
        throw
    } finally { $env:PGPASSWORD = $previousPassword }
}