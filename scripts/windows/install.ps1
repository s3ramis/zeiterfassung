# Windows PowerShell 5.1+, Windows 10 22H2 / Windows 11 x64.
[CmdletBinding()]
param(
    [string]$InstallDir = "$env:ProgramData\TimePilot",
    [ValidateRange(1024, 65535)][int]$Port = 3001,
    [ValidateRange(1024, 65535)][int]$DbPort = 54329
)

. "$PSScriptRoot\common.ps1"
Assert-Administrator
if (![Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    throw 'Dieser Installer unterstuetzt ausschliesslich Windows x64 (nicht ARM64).'
}
if ($Port -eq $DbPort) { throw 'App und Datenbank brauchen unterschiedliche Ports.' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if ($InstallDir.StartsWith('\\') -or $InstallDir -match '[%"\r\n]') { throw 'Lokalen Pfad ohne Prozentzeichen oder Anfuehrungszeichen verwenden.' }
$source = (Resolve-Path "$PSScriptRoot\..\..").Path
if ($InstallDir.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase) -or $InstallDir -eq $source) {
    throw 'Installation muss ausserhalb des Quellordners liegen.'
}
if (!(Test-Path "$source\package-lock.json")) { throw 'Projekt inklusive package-lock.json entpacken.' }
if (!(Test-Path "$env:SystemRoot\System32\curl.exe")) { throw 'Aktuelles Windows 10/11 mit curl.exe erforderlich.' }

$existing = Test-Path "$InstallDir\installation.json"
if ((Test-Path $InstallDir) -and !$existing -and @(Get-ChildItem -Force $InstallDir).Count -gt 0) {
    throw 'Zielordner ist nicht leer und gehoert nicht zu TimePilot. Anderen Ordner verwenden.'
}
foreach ($name in @('TimePilotApp', 'TimePilotDatabase')) {
    Assert-OwnedService $name "$InstallDir\services\$name.exe"
}
if ($existing) {
    $previous = Get-TimePilotInstallation $InstallDir
    if ($previous.port -ne $Port -or $previous.dbPort -ne $DbPort) {
        throw 'Bestehende Installation mit denselben Ports erneut ausfuehren.'
    }
}

function Assert-FreePort([int]$Number) {
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Number)
    try { $listener.Start() } catch { throw "Port $Number ist belegt. Anderen Port waehlen." }
    finally { $listener.Stop() }
}
if (!$existing) { Assert-FreePort $Port; Assert-FreePort $DbPort }

Set-PrivateDirectory $InstallDir
Grant-Traverse $InstallDir 'S-1-5-19'
Grant-Traverse $InstallDir 'S-1-5-20'
foreach ($folder in @('downloads', 'services', 'logs\app', 'logs\postgres', 'backups', 'management')) {
    New-Item -ItemType Directory -Force "$InstallDir\$folder" | Out-Null
}
Write-Utf8 "$InstallDir\installation.json" (@{ port = $Port; dbPort = $DbPort; postgresMajor = 17 } | ConvertTo-Json)
Copy-Item "$PSScriptRoot\common.ps1", "$PSScriptRoot\manage.ps1", "$PSScriptRoot\wait-postgres.mjs" "$InstallDir\management" -Force
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

function Download-Verified([string]$Url, [string]$Name, [string]$Hash) {
    $target = Join-Path "$InstallDir\downloads" $Name
    if (!(Test-Path $target) -or (Get-FileHash $target -Algorithm SHA256).Hash -ne $Hash) {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $target
    }
    if ((Get-FileHash $target -Algorithm SHA256).Hash -ne $Hash) {
        Remove-Item $target -Force
        throw "Pruefsumme stimmt nicht: $Name. Download verworfen."
    }
    return $target
}

Write-Host '1/7: Laufzeit und PostgreSQL herunterladen (Internet erforderlich) ...'
$nodeZip = Download-Verified 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' 'node.zip' '158F7685B44DE51F6C0DF1D153526CBCD3E1BC739A8DFC607721CEF75DE9E541'
$pgZip = Download-Verified 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260569' 'postgresql-17.11.zip' 'B9424EE7BC60B52450FF910A3630225DF32E633F3CB29C1D126D9299D59AEA28'
$wrapper = Download-Verified 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe' 'WinSW.NET461.exe' 'B5066B7BBDFBA1293E5D15CDA3CAAEA88FBEAB35BD5B38C41C913D492AADFC4F'

# PostgreSQL needs the Microsoft C++ runtime, even on a pristine Windows machine.
Install-VisualCppRuntime "$InstallDir\downloads"

Write-Host '2/7: Bestehende Daten sichern und Dienste stoppen ...'
$dbService = Get-Service TimePilotDatabase -ErrorAction SilentlyContinue
if ($existing -and $dbService -and $dbService.Status -eq 'Running' -and (Test-Path "$InstallDir\secrets.json")) {
    Backup-TimePilot $InstallDir "$InstallDir\backups\before-install-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
}
$appService = Get-Service TimePilotApp -ErrorAction SilentlyContinue
if ($appService) { Stop-Service TimePilotApp; $appService.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(90)) }
if ($dbService) { Stop-Service TimePilotDatabase; $dbService.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(90)) }
Assert-FreePort $Port
Assert-FreePort $DbPort
if (Test-Path "$InstallDir\data\PG_VERSION") {
    if ((Get-Content "$InstallDir\data\PG_VERSION").Trim() -ne '17') { throw 'Datenbank-Hauptversion passt nicht. Kein automatisches Major-Upgrade erlaubt.' }
}

Write-Host '3/7: Laufzeit entpacken und App bauen ...'
# Only replace binaries after both services have stopped. Never remove data/backups.
foreach ($folder in @('node', 'postgres', 'app', 'unpack')) {
    if (Test-Path "$InstallDir\$folder") { Remove-Item "$InstallDir\$folder" -Recurse -Force }
}
Expand-Archive $nodeZip "$InstallDir\unpack\node"
Move-Item "$InstallDir\unpack\node\node-v24.21.0-win-x64" "$InstallDir\node"
Expand-Archive $pgZip "$InstallDir\unpack\postgres"
Move-Item "$InstallDir\unpack\postgres\pgsql" "$InstallDir\postgres"
New-Item -ItemType Directory "$InstallDir\app" | Out-Null
foreach ($entry in @('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'src', 'public', 'server')) {
    Copy-Item "$source\$entry" "$InstallDir\app\$entry" -Recurse -Force
}
Invoke-Checked "$InstallDir\node\node.exe" @('--version')
Invoke-Checked "$InstallDir\postgres\bin\postgres.exe" @('--version')
foreach ($tool in @('initdb', 'pg_ctl', 'pg_isready', 'psql', 'pg_dump', 'pg_restore')) {
    Invoke-Checked "$InstallDir\postgres\bin\$tool.exe" @('--version')
}
$oldPath = $env:PATH
$oldNodeEnv = $env:NODE_ENV
$oldDefaultUrl = $env:VITE_DEFAULT_SERVER_URL
try {
    $env:PATH = "$InstallDir\node;$oldPath"
    $env:NODE_ENV = 'development'
    $env:VITE_DEFAULT_SERVER_URL = '/api'
    Push-Location "$InstallDir\app"
    try {
        Invoke-Checked "$InstallDir\node\npm.cmd" @('ci', '--no-fund', '--no-audit')
        Invoke-Checked "$InstallDir\node\npm.cmd" @('run', 'check')
        Invoke-Checked "$InstallDir\node\npm.cmd" @('run', 'build')
        Invoke-Checked "$InstallDir\node\npm.cmd" @('prune', '--omit=dev', '--no-fund', '--no-audit')
    } finally { Pop-Location }
} finally { $env:PATH = $oldPath; $env:NODE_ENV = $oldNodeEnv; $env:VITE_DEFAULT_SERVER_URL = $oldDefaultUrl }

Write-Host '4/7: Lokale Datenbank initialisieren ...'
if (!(Test-Path "$InstallDir\secrets.json")) {
    if (Test-Path "$InstallDir\data\PG_VERSION") { throw 'Zugangsdaten fehlen bei existierender Datenbank. secrets.json aus Sicherung wiederherstellen.' }
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = New-Object byte[] 32
        $random.GetBytes($bytes); $adminPassword = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        $random.GetBytes($bytes); $appPassword = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    } finally { $random.Dispose() }
    Write-Utf8 "$InstallDir\secrets.json" (@{ adminPassword = $adminPassword; appPassword = $appPassword } | ConvertTo-Json)
}
$secrets = Get-Content -Raw "$InstallDir\secrets.json" | ConvertFrom-Json
if (!(Test-Path "$InstallDir\data\PG_VERSION")) {
    if ((Test-Path "$InstallDir\data") -and @(Get-ChildItem -Force "$InstallDir\data").Count -gt 0) {
        throw 'Unvollstaendige Datenbankinitialisierung. Ordner data zur Diagnose behalten; nicht automatisch geloescht.'
    }
    $pwFile = "$InstallDir\downloads\initdb-password.txt"
    try {
        Write-Utf8 $pwFile $secrets.adminPassword
        Invoke-Checked "$InstallDir\postgres\bin\initdb.exe" @('-D', "$InstallDir\data", '-U', 'postgres', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', "--pwfile=$pwFile")
    } finally { Remove-Item $pwFile -Force -ErrorAction SilentlyContinue }
}
# These are the only network listeners; no firewall exception is created.
Write-Utf8 "$InstallDir\data\timepilot.conf" "listen_addresses = '127.0.0.1'`nport = $DbPort`npassword_encryption = 'scram-sha-256'`n"
$postgresConfig = "$InstallDir\data\postgresql.conf"
if (!(Select-String -Path $postgresConfig -SimpleMatch "include = 'timepilot.conf'" -Quiet)) {
    [IO.File]::AppendAllText($postgresConfig, "`ninclude = 'timepilot.conf'`n")
}
Write-Utf8 "$InstallDir\data\pg_hba.conf" "host all all 127.0.0.1/32 scram-sha-256`nhost all all 0.0.0.0/0 reject`nhost all all ::0/0 reject`n"
Write-Utf8 "$InstallDir\app\.env" @"
PGHOST=127.0.0.1
PGPORT=$DbPort
PGDATABASE=timepilot
PGUSER=timepilot
PGPASSWORD=$($secrets.appPassword)
HOST=127.0.0.1
PORT=$Port
CORS_ORIGINS=http://localhost:$Port,http://127.0.0.1:$Port
NODE_ENV=production
SESSION_DAYS=30
"@

Write-Host '5/7: Windows-Hintergrunddienste einrichten ...'
function Escape-Xml([string]$Value) { return [Security.SecurityElement]::Escape($Value) }
$root = Escape-Xml $InstallDir
foreach ($name in @('TimePilotDatabase', 'TimePilotApp')) {
    if (!(Test-Path "$InstallDir\services\$name.exe")) { Copy-Item $wrapper "$InstallDir\services\$name.exe" }
}
Write-Utf8 "$InstallDir\services\TimePilotDatabase.xml" @"
<service>
  <id>TimePilotDatabase</id><name>TimePilot Datenbank</name>
  <description>PostgreSQL, ausschliesslich 127.0.0.1:$DbPort</description>
  <executable>$root\postgres\bin\postgres.exe</executable>
  <startarguments>-D &quot;$root\data&quot;</startarguments>
  <stopexecutable>$root\postgres\bin\pg_ctl.exe</stopexecutable>
  <stoparguments>stop -D &quot;$root\data&quot; -m fast -w -t 60</stoparguments>
  <workingdirectory>$root\postgres</workingdirectory>
  <serviceaccount><domain>NT AUTHORITY</domain><user>NetworkService</user></serviceaccount>
  <startmode>Automatic</startmode><stoptimeout>90 sec</stoptimeout>
  <onfailure action="restart" delay="10 sec"/>
  <logpath>$root\logs\postgres</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
"@
Write-Utf8 "$InstallDir\services\TimePilotApp.xml" @"
<service>
  <id>TimePilotApp</id><name>TimePilot Server</name>
  <description>TimePilot, ausschliesslich 127.0.0.1:$Port</description>
  <executable>$root\node\node.exe</executable>
    <arguments>&quot;$root\app\server\src\service.mjs&quot;</arguments>
  <workingdirectory>$root\app</workingdirectory>
  <env name="NODE_ENV" value="production"/>
  <env name="HOST" value="127.0.0.1"/>
  <env name="PORT" value="$Port"/>
  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>
  <depend>TimePilotDatabase</depend><startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec"/><stoptimeout>30 sec</stoptimeout>
  <logpath>$root\logs\app</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
"@
foreach ($folder in @('node', 'app')) { Grant-Directory "$InstallDir\$folder" 'S-1-5-19' }
Grant-Directory "$InstallDir\postgres" 'S-1-5-20'
Grant-Directory "$InstallDir\services" 'S-1-5-19'
Grant-Directory "$InstallDir\services" 'S-1-5-20'
Grant-Directory "$InstallDir\data" 'S-1-5-20' 'Modify'
Grant-Traverse "$InstallDir\logs" 'S-1-5-19'
Grant-Traverse "$InstallDir\logs" 'S-1-5-20'
Grant-Directory "$InstallDir\logs\postgres" 'S-1-5-20' 'Modify'
Grant-Directory "$InstallDir\logs\app" 'S-1-5-19' 'Modify'
foreach ($name in @('TimePilotDatabase', 'TimePilotApp')) {
    if (!(Get-Service $name -ErrorAction SilentlyContinue)) {
        Invoke-Checked "$InstallDir\services\$name.exe" @('install')
    }
    # WinSW 2.x reloads executable/arguments/logs from XML on each start.
    # It has no "refresh" command (that belongs to WinSW 3.x).
}
Start-Service TimePilotDatabase
(Get-Service TimePilotDatabase).WaitForStatus('Running', [TimeSpan]::FromSeconds(90))
Invoke-Checked "$InstallDir\node\node.exe" @("$InstallDir\management\wait-postgres.mjs", "$InstallDir\postgres\bin\pg_isready.exe", [string]$DbPort)

Write-Host '6/7: Eingeschraenkten App-Benutzer anlegen ...'
$sqlFile = "$InstallDir\downloads\initialize.sql"
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $secrets.adminPassword
    # Random hex passwords contain no SQL metacharacters; never pass passwords on command lines.
    if ($secrets.appPassword -notmatch '^[a-f0-9]{64}$') { throw 'Unerwartetes Passwortformat in secrets.json.' }
    Write-Utf8 $sqlFile @"
SELECT 'CREATE ROLE timepilot LOGIN PASSWORD ''$($secrets.appPassword)'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'timepilot')\gexec
SELECT 'CREATE DATABASE timepilot OWNER timepilot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'timepilot')\gexec
"@
    Invoke-Checked "$InstallDir\postgres\bin\psql.exe" @('-h', '127.0.0.1', '-p', [string]$DbPort, '-U', 'postgres', '-d', 'postgres', '--no-password', '-v', 'ON_ERROR_STOP=1', '-f', $sqlFile)
} finally { $env:PGPASSWORD = $previousPassword; Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue }

Write-Host '7/7: App starten und Datenbankverbindung pruefen ...'
Start-Service TimePilotApp
Wait-TimePilot $Port
$taskName = 'TimePilotBackup'
$oldTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$managePath = "$InstallDir\management\manage.ps1"
if ($oldTask -and $oldTask.Actions.Arguments -notlike "*$managePath*") {
    throw 'Die Aufgabe TimePilotBackup gehoert nicht zu dieser Installation. Nicht ueberschrieben.'
}
$taskAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$managePath`" -Action Backup -InstallDir `"$InstallDir`""
$trigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
# A URL shortcut opens only the browser, never a terminal or the service wrapper.
$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
Write-Utf8 "$desktop\TimePilot.url" "[InternetShortcut]`r`nURL=http://localhost:$Port`r`n"
Remove-Item "$InstallDir\unpack" -Recurse -Force
Write-Host "Fertig: http://localhost:$Port"
Write-Host 'Datenbank-Server auswaehlen, Konto anlegen. Dienste starten automatisch mit Windows.'
Write-Host "Verwaltung und Sicherung: $InstallDir\management\manage.ps1"