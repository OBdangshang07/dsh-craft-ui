[CmdletBinding()]
param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$profileName = 'craft-ui-canary'
$listenAddress = '127.0.0.1'
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'DSH Craft UI'
$mutex = [Threading.Mutex]::new($false, 'Local\DSHCraftUILauncher')
$hasMutex = $false
$dshCommand = Get-Command dsh -ErrorAction SilentlyContinue
$installedAfter = [DateTime]::MinValue
if ($dshCommand) {
  $manifest = Join-Path (Split-Path -Parent $dshCommand.Source) 'node_modules\@deepseek-ai\dsh\package.json'
  $profileRoot = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
  $pluginManifest = Join-Path $profileRoot "profiles\$profileName\node_modules\dsh-craft-ui\package.json"
  foreach ($path in @($manifest, $pluginManifest)) {
    if (Test-Path -LiteralPath $path) {
      $file = Get-Item -LiteralPath $path
      $updated = if ($file.CreationTimeUtc -gt $file.LastWriteTimeUtc) { $file.CreationTimeUtc } else { $file.LastWriteTimeUtc }
      if ($updated -gt $installedAfter) { $installedAfter = $updated }
    }
  }
}

function Show-LauncherError([string]$message) {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup($message, 0, 'DeepSeek Harness launch failed', 16)
  } catch {
    Write-Error $message
  }
}

function Get-StartupUrl([string]$logPath, [int]$port = 0) {
  if (-not (Test-Path -LiteralPath $logPath)) { return $null }
  $content = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
  if (-not $content) { return $null }
  $matches = [regex]::Matches($content, 'http://127\.0\.0\.1:\d+/\?[^\s\x1b]+')
  foreach ($match in $matches) {
    $url = [Uri]$match.Value
    if ($port -eq 0 -or $url.Port -eq $port) { return $url.AbsoluteUri }
  }
  return $null
}

function Get-RunningHarnessUrl {
  $instances = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -match '(?i)[\\/]@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js' -and
      $_.CommandLine -match '(?i)--profile\s+(?:"craft-ui-canary"|craft-ui-canary)(?:\s|$)'
    } |
    Sort-Object CreationDate -Descending

  foreach ($instance in $instances) {
    # Keep old tasks alive, but never reopen a process predating an upgrade.
    if ($instance.CreationDate.ToUniversalTime() -lt $installedAfter) { continue }
    $listener = Get-NetTCPConnection -OwningProcess $instance.ProcessId -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalAddress -in @($listenAddress, '0.0.0.0', '::', '::1') } |
      Select-Object -First 1
    if ($listener -and (Test-Path -LiteralPath $runtimeDirectory)) {
      $logs = Get-ChildItem -LiteralPath $runtimeDirectory -Filter '*stdout.log' -File |
        Where-Object { $_.LastWriteTime -ge $instance.CreationDate.AddSeconds(-5) } |
        Sort-Object LastWriteTime -Descending
      foreach ($log in $logs) {
        $url = Get-StartupUrl $log.FullName $listener.LocalPort
        if ($url) { return $url }
      }
    }
  }
  return $null
}

try {
  $hasMutex = $mutex.WaitOne([TimeSpan]::FromSeconds(15))
  if (-not $hasMutex) { throw 'Another DeepSeek Harness launch is still in progress.' }

  $runningUrl = Get-RunningHarnessUrl
  if ($runningUrl) {
    if (-not $NoOpen) { Start-Process -FilePath $runningUrl }
    exit 0
  }

  if (-not $dshCommand) {
    throw 'The dsh command was not found. Install DeepSeek Harness and make sure dsh is available on PATH.'
  }

  $null = New-Item -ItemType Directory -Path $runtimeDirectory -Force
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdoutPath = Join-Path $runtimeDirectory "harness-$stamp-stdout.log"
  $stderrPath = Join-Path $runtimeDirectory "harness-$stamp-stderr.log"
  # Launch Node directly: a PowerShell npm shim can buffer the authenticated URL.
  $commandDirectory = Split-Path -Parent $dshCommand.Source
  $entryPath = Join-Path $commandDirectory 'node_modules\@deepseek-ai\dsh\lib\bin.js'
  $nodePath = Join-Path $commandDirectory 'node.exe'
  if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
  }
  if (-not (Test-Path -LiteralPath $entryPath)) {
    throw 'The installed DeepSeek Harness entry point was not found. Reinstall @deepseek-ai/dsh.'
  }
  $arguments = @(
    ('"' + $entryPath + '"'),
    '--profile', $profileName,
    '--host', $listenAddress,
    '--port', '0',
    '--no-open'
  )

  $process = Start-Process -FilePath $nodePath -ArgumentList $arguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { throw "DeepSeek Harness exited during startup. Check the logs in: $runtimeDirectory" }
    $url = Get-StartupUrl $stdoutPath
    if ($url) {
      if (-not $NoOpen) { Start-Process -FilePath $url }
      exit 0
    }
    Start-Sleep -Milliseconds 250
  }
  throw "DeepSeek Harness has not reported its startup URL yet. Check the logs in: $runtimeDirectory"
} catch {
  Show-LauncherError $_.Exception.Message
  exit 1
} finally {
  if ($hasMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
