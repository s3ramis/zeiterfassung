Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

function Assert-Equal($Actual, $Expected) {
    if ($Actual -ne $Expected) { throw "Expected '$Expected', got '$Actual'." }
}

function Assert-Throws([scriptblock]$Action, [string]$Pattern) {
    try { & $Action } catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
        return
    }
    throw "Expected an error matching '$Pattern'."
}

function Set-RuntimeFiles([version]$Version) {
    foreach ($name in @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')) {
        $script:runtimeFiles[$name] = $Version
    }
}

function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
    Assert-Equal $Uri 'https://aka.ms/vc14/vc_redist.x64.exe'
    Assert-Equal $OutFile 'C:\TimePilot Test Downloads\vc_redist.x64.exe'
    $script:downloadCount++
}

function Get-AuthenticodeSignature {
    param([string]$FilePath)
    [pscustomobject]@{
        Status = $script:signatureStatus
        SignerCertificate = [pscustomobject]@{ Subject = $script:signer }
    }
}

function Get-Item {
    [CmdletBinding()]
    param([string]$LiteralPath)
    $name = Split-Path $LiteralPath -Leaf
    if ($name -eq 'vc_redist.x64.exe') {
        $version = $script:packageVersion
    } elseif ($script:runtimeFiles.ContainsKey($name)) {
        $systemDirectory = if ([Environment]::Is64BitProcess) { 'System32' } else { 'Sysnative' }
        Assert-Equal $LiteralPath (Join-Path "$env:SystemRoot\$systemDirectory" $name)
        $version = $script:runtimeFiles[$name]
    } else { return }
    [pscustomobject]@{ VersionInfo = [pscustomobject]@{
        FileMajorPart = $version.Major
        FileMinorPart = $version.Minor
        FileBuildPart = $version.Build
        FilePrivatePart = $version.Revision
    } }
}

function Start-Process {
    param([string]$FilePath, [string[]]$ArgumentList, [switch]$Wait, [switch]$PassThru)
    Assert-Equal $FilePath 'C:\TimePilot Test Downloads\vc_redist.x64.exe'
    Assert-Equal $ArgumentList.Count 3
    Assert-Equal $ArgumentList[1] '/quiet'
    Assert-Equal $ArgumentList[2] '/norestart'
    Assert-Equal $Wait.IsPresent $true
    Assert-Equal $PassThru.IsPresent $true
    $script:actions += $ArgumentList[0]
    if (!$script:leaveRuntimeUnchanged) { Set-RuntimeFiles $script:packageVersion }
    [pscustomobject]@{ ExitCode = $script:exitCode }
}

$script:passed = 0
function Invoke-RuntimeTest([string]$Name, [scriptblock]$Body) {
    $script:packageVersion = [version]'14.51.36247.0'
    $script:runtimeFiles = @{}
    $script:actions = @()
    $script:signatureStatus = 'Valid'
    $script:signer = 'CN=Microsoft Corporation, O=Microsoft Corporation, C=US'
    $script:exitCode = 0
    $script:leaveRuntimeUnchanged = $false
    $script:downloadCount = 0
    & $Body
    Assert-Equal $script:downloadCount 1
    $script:passed++
    Write-Host "PASS: $Name"
}

Invoke-RuntimeTest 'Install absent runtime' {
    Install-VisualCppRuntime 'C:\TimePilot Test Downloads'
    Assert-Equal $script:actions.Count 1
    Assert-Equal $script:actions[0] '/install'
}
Invoke-RuntimeTest 'Upgrade older runtime' {
    Set-RuntimeFiles ([version]'14.44.35211.0')
    Install-VisualCppRuntime 'C:\TimePilot Test Downloads'
    Assert-Equal $script:actions[0] '/install'
}
Invoke-RuntimeTest 'Repair same runtime rather than skip it' {
    Set-RuntimeFiles $script:packageVersion
    Install-VisualCppRuntime 'C:\TimePilot Test Downloads'
    Assert-Equal $script:actions[0] '/repair'
}
Invoke-RuntimeTest 'Repair a runtime with a missing DLL' {
    Set-RuntimeFiles $script:packageVersion
    $script:runtimeFiles.Remove('msvcp140.dll')
    Install-VisualCppRuntime 'C:\TimePilot Test Downloads'
    Assert-Equal $script:actions[0] '/repair'
}
Invoke-RuntimeTest 'Keep newer complete runtime without downgrade' {
    Set-RuntimeFiles ([version]'14.99.99999.0')
    Install-VisualCppRuntime 'C:\TimePilot Test Downloads'
    Assert-Equal $script:actions.Count 0
}
Invoke-RuntimeTest 'Reject incomplete newer runtime without downgrade' {
    Set-RuntimeFiles ([version]'14.99.99999.0')
    $script:runtimeFiles.Remove('msvcp140.dll')
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'unvollstaendig.*kein Downgrade'
    Assert-Equal $script:actions.Count 0
}
Invoke-RuntimeTest 'Reject outdated download' {
    $script:packageVersion = [version]'14.43.34810.0'
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'Download ist zu alt'
    Assert-Equal $script:actions.Count 0
}
Invoke-RuntimeTest 'Reject invalid signature' {
    $script:signatureStatus = 'HashMismatch'
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'Microsoft-Signatur'
    Assert-Equal $script:actions.Count 0
}
Invoke-RuntimeTest 'Reject non-Microsoft signer' {
    $script:signer = 'CN=Example, O=Example Corporation'
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'Microsoft-Signatur'
    Assert-Equal $script:actions.Count 0
}
Invoke-RuntimeTest 'Stop for required Windows restart' {
    $script:exitCode = 3010
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'Windows neu starten'
}
Invoke-RuntimeTest 'Propagate installation failure' {
    $script:exitCode = 1603
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'fehlgeschlagen: 1603'
}
Invoke-RuntimeTest 'Reject missing DLL after apparent installation success' {
    $script:leaveRuntimeUnchanged = $true
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'vcruntime140.dll fehlt'
}
Invoke-RuntimeTest 'Reject outdated DLL after apparent installation success' {
    Set-RuntimeFiles ([version]'14.16.27012.0')
    $script:leaveRuntimeUnchanged = $true
    Assert-Throws { Install-VisualCppRuntime 'C:\TimePilot Test Downloads' } 'nach Einrichtung zu alt'
}

Write-Output "$script:passed runtime tests passed (mocked; no system changes)."