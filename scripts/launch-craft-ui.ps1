[CmdletBinding()]
param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$profileName = 'craft-ui-canary'
$listenAddress = '127.0.0.1'
$port = 31873
$url = "http://${listenAddress}:${port}/"
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'DSH Craft UI'
$stdoutPath = Join-Path $runtimeDirectory 'harness-stdout.log'
$stderrPath = Join-Path $runtimeDirectory 'harness-stderr.log'

function Show-LauncherError([string]$message) {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup($message, 0, 'DeepSeek Harness launch failed', 16)
  } catch {
    Write-Error $message
  }
}

function Test-HarnessReady {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match '(?i)(deepseek|harness|dsh)'
  } catch {
    return $false
  }
}

try {
  if (-not (Test-HarnessReady)) {
    $occupied = Get-NetTCPConnection -LocalAddress $listenAddress -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($occupied) {
      throw "Port $port is already used by another process (PID $($occupied.OwningProcess)). The launcher will not stop an unrelated process."
    }

    $dshCommand = Get-Command dsh -ErrorAction SilentlyContinue
    if (-not $dshCommand) {
      throw 'The dsh command was not found. Install DeepSeek Harness and make sure dsh is available on PATH.'
    }

    $null = New-Item -ItemType Directory -Path $runtimeDirectory -Force
    $powershellPath = Join-Path $PSHOME 'powershell.exe'
    $arguments = @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', $dshCommand.Source,
      '--profile', $profileName,
      '--host', $listenAddress,
      '--port', [string]$port,
      '--no-open'
    )
    $null = Start-Process -FilePath $powershellPath -ArgumentList $arguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru

    $deadline = (Get-Date).AddSeconds(35)
    do {
      Start-Sleep -Milliseconds 300
      $ready = Test-HarnessReady
    } until ($ready -or (Get-Date) -ge $deadline)

    if (-not $ready) {
      $detail = if (Test-Path $stderrPath) { (Get-Content -Raw $stderrPath).Trim() } else { '' }
      if (-not $detail) { $detail = "Check the log: $stderrPath" }
      throw "DeepSeek Harness did not become ready within 35 seconds.`n`n$detail"
    }
  }

  if (-not $NoOpen) {
    Start-Process -FilePath $url
  }
} catch {
  Show-LauncherError $_.Exception.Message
  exit 1
}
