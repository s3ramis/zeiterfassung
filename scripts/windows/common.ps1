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
    if ($LASTEXITCODE -ne 0) {
        $exitCode = $LASTEXITCODE
        $message = "Befehl fehlgeschlagen: $File (Exit $exitCode)"
        if ($exitCode -eq -1073741515) {
            $message += ' (Windows 0xC0000135: Eine benoetigte DLL konnte nicht geladen werden. Wahrscheinliche Ursachen sind die Microsoft Visual C++ x64-Laufzeit oder eine DLL der PostgreSQL-Installation. Dies ist kein Port- oder Passwortfehler. Microsoft Visual C++ Redistributable x64 reparieren oder installieren, Windows neu starten und den Installer erneut ausfuehren. Bleibt der Fehler bestehen, PostgreSQL-Binaries mit dem geprueften Installerpaket erneut installieren. Bestehende Daten nicht loeschen.)'
        }
        throw $message
    }
}

function Write-Utf8 {
    param([string]$Path, [string]$Content)
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Install-VisualCppRuntime {
    param([string]$DownloadDir)
    $minimumVersion = [version]'14.44.35211.0'
    $installer = Join-Path $DownloadDir 'vc_redist.x64.exe'
    Invoke-WebRequest -UseBasicParsing 'https://aka.ms/vc14/vc_redist.x64.exe' -OutFile $installer
    $signature = Get-AuthenticodeSignature $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw 'Microsoft C++ Download hat keine gueltige Microsoft-Signatur.'
    }
    $info = (Get-Item -LiteralPath $installer).VersionInfo
    $packageVersion = New-Object Version($info.FileMajorPart, $info.FileMinorPart, $info.FileBuildPart, $info.FilePrivatePart)
    if ($packageVersion -lt $minimumVersion) {
        throw "Microsoft C++ x64 Download ist zu alt: $packageVersion. PostgreSQL 17.11 benoetigt mindestens $minimumVersion."
    }
    $systemDirectory = if ([Environment]::Is64BitProcess) { "$env:SystemRoot\System32" } else { "$env:SystemRoot\Sysnative" }
    $runtimeFiles = @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')
    $installedVersions = @(foreach ($name in $runtimeFiles) {
        $file = Get-Item -LiteralPath (Join-Path $systemDirectory $name) -ErrorAction SilentlyContinue
        if ($file) {
            $info = $file.VersionInfo
            New-Object Version($info.FileMajorPart, $info.FileMinorPart, $info.FileBuildPart, $info.FilePrivatePart)
        }
    })
    $newestInstalled = $installedVersions | Sort-Object -Descending | Select-Object -First 1
    if ($newestInstalled -and $newestInstalled -gt $packageVersion) {
        if ($installedVersions.Count -ne $runtimeFiles.Count -or @($installedVersions | Where-Object { $_ -lt $minimumVersion }).Count -gt 0) {
            throw "Neuere Microsoft C++ x64-Laufzeit $newestInstalled ist unvollstaendig. Diese Version ueber Windows 'Installierte Apps' reparieren; kein Downgrade auf $packageVersion."
        }
        Write-Host "Microsoft C++ x64 $newestInstalled bleibt erhalten (Download: $packageVersion)."
        return
    }
    $action = if ($newestInstalled -and $newestInstalled -eq $packageVersion) { '/repair' } else { '/install' }
    Write-Host "Microsoft C++ x64 $packageVersion einrichten ($action, PostgreSQL-Minimum $minimumVersion) ..."
    $process = Start-Process $installer -ArgumentList $action, '/quiet', '/norestart' -Wait -PassThru
    if ($process.ExitCode -eq 3010) { throw 'C++ Laufzeit eingerichtet. Windows neu starten, danach Einrichtung erneut ausfuehren.' }
    if ($process.ExitCode -ne 0) { throw "C++ Einrichtung fehlgeschlagen: $($process.ExitCode)" }
    foreach ($name in $runtimeFiles) {
        $file = Get-Item -LiteralPath (Join-Path $systemDirectory $name) -ErrorAction SilentlyContinue
        if (!$file) { throw "Microsoft C++ x64-Laufzeit nach Einrichtung unvollstaendig: $name fehlt. Windows neu starten und Einrichtung erneut ausfuehren." }
        $info = $file.VersionInfo
        $version = New-Object Version($info.FileMajorPart, $info.FileMinorPart, $info.FileBuildPart, $info.FilePrivatePart)
        if ($version -lt $minimumVersion) { throw "Microsoft C++ x64-Laufzeit nach Einrichtung zu alt: $name $version (Minimum $minimumVersion)." }
    }
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