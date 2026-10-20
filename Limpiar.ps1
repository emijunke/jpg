# Deja esta copia como una aplicacion local: borra Git y cualquier rastro del repositorio.
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot ".")).Path
$marker = Join-Path $Root "package.json"
if (-not (Test-Path $marker)) {
  throw "Ejecuta este script dentro de la carpeta de la aplicacion."
}

Write-Host "Limpiando $Root"

$gitDir = Join-Path $Root ".git"
if (Test-Path $gitDir) {
  Remove-Item -LiteralPath $gitDir -Recurse -Force
  Write-Host "  Se borro el historial de Git."
}

foreach ($name in @("SubirAgit", "SubirAgit.bat", "SubirAgit.ps1")) {
  $path = Join-Path $Root $name
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "  Se borro $name."
  }
}

$readme = @"
# Orden de compra

Aplicacion local para completar la plantilla y generar el PDF.

La aplicacion escucha en http://127.0.0.1:8081/

Usuarios: users.json, en esta misma carpeta.
Historial: %USERPROFILE%\.local\share\orden-compra\historial\

Para volver a generar la aplicacion despues de un cambio de codigo:

    npm run build

La tarea de Windows se llama JPG_OC.
"@
Set-Content -Path (Join-Path $Root "README.md") -Value $readme -Encoding utf8
Write-Host "  Se reescribio README.md."

$skip = @("node_modules", "dist", ".git")
$needles = @("emijunke", "emiliano.junquera", "github.com/emijunke")
$files = Get-ChildItem -Path $Root -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $rel = $_.FullName.Substring($Root.Length).TrimStart("\", "/")
  $top = ($rel -split "[\\/]")[0]
  ($skip -notcontains $top) -and ($_.Name -ne "Limpiar.ps1") -and ($_.Length -lt 2MB)
}

foreach ($file in $files) {
  $text = $null
  try { $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop } catch { continue }
  if (-not $text) { continue }
  $hit = $false
  foreach ($needle in $needles) {
    if ($text.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $hit = $true; break }
  }
  if (-not $hit) { continue }
  $lines = $text -split "`r?`n"
  $kept = foreach ($line in $lines) {
    $drop = $false
    foreach ($needle in $needles) {
      if ($line.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $drop = $true; break }
    }
    if (-not $drop) { $line }
  }
  Set-Content -LiteralPath $file.FullName -Value ($kept -join "`r`n") -Encoding utf8
  Write-Host ("  Se limpiaron referencias en " + $file.FullName.Substring($Root.Length).TrimStart("\", "/"))
}

$me = $MyInvocation.MyCommand.Path
Write-Host ""
Write-Host "Listo. Esta carpeta ya no tiene repositorio Git ni enlace al origen."
if ($me -and (Test-Path -LiteralPath $me)) {
  Remove-Item -LiteralPath $me -Force
}
