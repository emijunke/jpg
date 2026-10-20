# Detiene el servicio, borra los datos y elimina la carpeta de la aplicacion.
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot ".")).Path
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  throw "Ejecuta este script dentro de la carpeta de la aplicacion."
}

Write-Host "Desinstalando $Root"

foreach ($taskName in @("JPG_OC", "OrdenCompra")) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) { continue }
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "  Tarea eliminada: $taskName"
}

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -and
    $_.CommandLine -like "*server.mjs*" -and
    $_.CommandLine -like "*$Root*"
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  Proceso detenido: $($_.ProcessId)"
  }

$dataDir = Join-Path $env:USERPROFILE ".local\share\orden-compra"
if (Test-Path $dataDir) {
  Remove-Item -LiteralPath $dataDir -Recurse -Force
  Write-Host "  Datos y PDFs eliminados."
}

$localNode = Join-Path $env:LOCALAPPDATA "jpg-oc"
if (Test-Path $localNode) {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath) {
    $kept = $userPath.Split(";") | Where-Object {
      $_ -and ($_.TrimEnd("\") -notlike "$($localNode.TrimEnd('\'))*")
    }
    [Environment]::SetEnvironmentVariable("Path", ($kept -join ";"), "User")
  }
  Remove-Item -LiteralPath $localNode -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "  Node.js local de la app eliminado."
}

$bat = Join-Path $env:TEMP ("jpg-oc-borrar-{0}.cmd" -f [guid]::NewGuid().ToString("n"))
$cmd = @"
@echo off
ping 127.0.0.1 -n 3 >nul
rmdir /s /q "$Root"
del "%~f0"
"@
Set-Content -Path $bat -Value $cmd -Encoding ascii
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$bat`"" -WindowStyle Hidden

Write-Host ""
Write-Host "Servicio dado de baja. La carpeta se borra en unos segundos."
Write-Host "Node.js del sistema, si ya estaba instalado, no se toca."
