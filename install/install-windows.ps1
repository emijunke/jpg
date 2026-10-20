# Instala la app en Windows: Node.js 20+, dependencias, build y tarea al iniciar sesión.
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

Write-Host "== Orden de compra: instalacion Windows =="
Write-Host "Directorio: $Root"

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Ensure-Node {
  Refresh-Path
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    $major = [int](& node -p "process.versions.node.split('.')[0]")
    if ($major -ge 20) {
      Write-Host "Node.js $(node -v) ya esta instalado."
      return
    }
    Write-Host "Node.js es anterior a la version 20."
  } else {
    Write-Host "No hay Node.js."
  }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Instala Node.js 20 o superior desde https://nodejs.org y vuelve a ejecutar este script."
  }

  Write-Host "Instalando Node.js LTS con winget..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js se instalo, pero esta consola no lo ve. Cerra PowerShell, abrila de nuevo y volve a ejecutar el script."
  }
}

Ensure-Node

Write-Host "Instalando dependencias..."
npm ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw "npm ci fallo" }

Write-Host "Compilando la aplicacion..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build fallo" }

$usersFile = Join-Path $Root "users.json"
if (-not (Test-Path $usersFile)) {
  Copy-Item (Join-Path $Root "users.example.json") $usersFile
  Write-Host "Se creo users.json a partir de users.example.json."
  Write-Host "Cambia las contrasenas antes de exponer el puerto."
}

$nodeExe = (Get-Command node).Source
$taskName = "JPG_OC"

foreach ($oldName in @($taskName, "OrdenCompra")) {
  $existing = Get-ScheduledTask -TaskName $oldName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $oldName -Confirm:$false
  }
}

$action = New-ScheduledTaskAction -Execute $nodeExe -Argument "server.mjs" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "JPG_OC orden de compra PDF en el puerto 8081" | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Instalacion lista."
Write-Host "  Local:  http://127.0.0.1:8081/"
Write-Host "  Usuarios: $usersFile"
Write-Host "  Historial: $env:USERPROFILE\.local\share\orden-compra\historial\"
Write-Host ""
Write-Host "Comandos:"
Write-Host "  Start-ScheduledTask -TaskName JPG_OC"
Write-Host "  Stop-ScheduledTask -TaskName JPG_OC"
Write-Host "  Get-ScheduledTask -TaskName JPG_OC"
Write-Host ""
Write-Host "Si el puerto 8081 debe verse desde otra maquina, permitilo en el Firewall de Windows."
