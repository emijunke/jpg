# Instala la app en Windows: Node.js 20+, dependencias, build y tarea al iniciar sesión.
$ErrorActionPreference = "Stop"
# npm escribe avisos en stderr. Sin esto, PowerShell corta el script en el primer warning.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

Write-Host "== Orden de compra: instalacion Windows =="
Write-Host "Directorio: $Root"

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Install-NodeZip {
  Write-Host "Descargando Node.js LTS desde nodejs.org..."
  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
  $release = $index | Where-Object {
    $_.lts -and ([int]($_.version.TrimStart("v").Split(".")[0]) -ge 20)
  } | Select-Object -First 1
  if (-not $release) {
    throw "No se encontro un Node.js LTS 20 o superior en nodejs.org."
  }

  $arch = "win-x64"
  if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $arch = "win-arm64" }
  $version = $release.version
  $zipName = "node-$version-$arch.zip"
  $url = "https://nodejs.org/dist/$version/$zipName"
  $zipPath = Join-Path $env:TEMP $zipName
  $extractRoot = Join-Path $env:TEMP "jpg-oc-node-extract"
  $installDir = Join-Path $env:LOCALAPPDATA "jpg-oc\nodejs"

  Write-Host "  $url"
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

  if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
  Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force
  $inner = Get-ChildItem $extractRoot -Directory | Select-Object -First 1
  if (-not $inner) { throw "El zip de Node.js no tiene la carpeta esperada." }

  if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Copy-Item -Path (Join-Path $inner.FullName "*") -Destination $installDir -Recurse -Force

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $userPath) { $userPath = "" }
  if ($userPath -notlike "*$installDir*") {
    $joined = @($userPath.TrimEnd(";"), $installDir) | Where-Object { $_ }
    [Environment]::SetEnvironmentVariable("Path", ($joined -join ";"), "User")
  }
  $env:Path = "$installDir;$env:Path"

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js se descargo en $installDir pero no se puede ejecutar."
  }
  Write-Host "Node.js $(node -v) instalado en $installDir"
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
    Write-Host "Node.js es anterior a la version 20. Se instala uno nuevo."
  } else {
    Write-Host "No hay Node.js. Se descarga e instala."
  }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host "Instalando Node.js LTS con winget..."
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    Refresh-Path
    if (Get-Command node -ErrorAction SilentlyContinue) { return }
    Write-Host "winget no dejo node en el PATH. Se instala la version zip."
  }

  Install-NodeZip
}

Ensure-Node

function Invoke-Npm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NpmArgs)
  & npm @NpmArgs
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($NpmArgs -join ' ') fallo con codigo $LASTEXITCODE"
  }
}

Write-Host "Instalando dependencias..."
Invoke-Npm ci --ignore-scripts

Write-Host "Compilando la aplicacion..."
Invoke-Npm run build

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
