[CmdletBinding()]
param(
    [ValidateSet('Status', 'Start', 'Stop', 'Backup', 'Restore', 'RemoveServices')][string]$Action = 'Status',
    [string]$InstallDir = "$env:ProgramData\TimePilot",
    [string]$BackupPath,
    [switch]$ConfirmRestore
)
. "$PSScriptRoot\common.ps1"
Assert-Administrator
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$config = Get-TimePilotInstallation $InstallDir
foreach ($name in @('TimePilotApp', 'TimePilotDatabase')) { Assert-OwnedService $name "$InstallDir\services\$name.exe" }

switch ($Action) {
    'Status' {
        Get-Service TimePilotDatabase, TimePilotApp | Format-Table Name, Status, StartType
        Get-ScheduledTaskInfo -TaskName TimePilotBackup -ErrorAction SilentlyContinue | Format-List LastRunTime, LastTaskResult, NextRunTime
        Wait-TimePilot $config.port
        Get-NetTCPConnection -State Listen -LocalPort $config.port, $config.dbPort | Format-Table LocalAddress, LocalPort, OwningProcess
    }
    'Start' {
        Start-Service TimePilotDatabase
        Start-Service TimePilotApp
        Wait-TimePilot $config.port
    }
    'Stop' {
        Stop-Service TimePilotApp
        Stop-Service TimePilotDatabase
    }
    'Backup' {
        $managedDestination = !$BackupPath
        if (!$BackupPath) { $BackupPath = "$InstallDir\backups\timepilot-$(Get-Date -Format yyyyMMdd-HHmmss).dump" }
        Backup-TimePilot $InstallDir ([IO.Path]::GetFullPath($BackupPath))
        if ($managedDestination) {
            Get-ChildItem "$InstallDir\backups\timepilot-*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
        }
        Write-Host "Sicherung erstellt: $BackupPath (enthaelt alle Konten und Sitzungen; vertraulich behandeln)."
    }
    'Restore' {
        if (!$ConfirmRestore -or !$BackupPath -or !(Test-Path $BackupPath)) {
            throw 'Restore ersetzt alle Daten. Existierende -BackupPath und ausdruecklich -ConfirmRestore angeben.'
        }
        Start-Service TimePilotDatabase
        Backup-TimePilot $InstallDir "$InstallDir\backups\before-restore-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
        Stop-Service TimePilotApp
        $secrets = Get-Content -Raw "$InstallDir\secrets.json" | ConvertFrom-Json
        $oldPassword = $env:PGPASSWORD
        try {
            $env:PGPASSWORD = $secrets.appPassword
            Invoke-Checked "$InstallDir\postgres\bin\pg_restore.exe" @(
                '-h', '127.0.0.1', '-p', [string]$config.dbPort, '-U', 'timepilot', '-d', 'timepilot', '--no-password',
                '--clean', '--if-exists', '--no-owner', '--single-transaction', [IO.Path]::GetFullPath($BackupPath))
            # A restored database must not resurrect old login tokens.
            Invoke-Checked "$InstallDir\postgres\bin\psql.exe" @(
                '-h', '127.0.0.1', '-p', [string]$config.dbPort, '-U', 'timepilot', '-d', 'timepilot', '--no-password',
                '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM sessions')
        } finally { $env:PGPASSWORD = $oldPassword }
        Start-Service TimePilotApp
        Wait-TimePilot $config.port
    }
    'RemoveServices' {
        $task = Get-ScheduledTask -TaskName TimePilotBackup -ErrorAction SilentlyContinue
        if ($task -and $task.Actions.Arguments -like "*$InstallDir\management\manage.ps1*") {
            Unregister-ScheduledTask -TaskName TimePilotBackup -Confirm:$false
        }
        foreach ($name in @('TimePilotApp', 'TimePilotDatabase')) {
            if (Get-Service $name -ErrorAction SilentlyContinue) {
                Stop-Service $name
                Invoke-Checked "$InstallDir\services\$name.exe" @('uninstall')
            }
        }
        Write-Host 'Dienste entfernt. Daten, Zugangsdaten und Backups bleiben absichtlich erhalten.'
    }
}