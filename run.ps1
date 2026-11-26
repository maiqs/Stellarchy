# Stellarchy: .\run.ps1 test | soak | dev
param([string]$cmd = "test")
$node = "$env:USERPROFILE\Documents\tools\node\node-v26.13.1-win-x64"
if (Test-Path $node) { $env:PATH = "$node;$env:PATH" }
Set-Location $PSScriptRoot
switch ($cmd) {
  "test" { node --test tests/ }
  "soak" { node tests/soak.js }
  "dev"  { npx wrangler dev }
  default { "usage: .\run.ps1 test | soak | dev" }
}
