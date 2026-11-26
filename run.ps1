# Stellarchy: .\run.ps1 test | soak | dev | room
param([string]$cmd = "test")
$node = "$env:USERPROFILE\Documents\tools\node\node-v26.13.1-win-x64"
if (Test-Path $node) { $env:PATH = "$node;$env:PATH" }
Set-Location $PSScriptRoot
switch ($cmd) {
  "test" { node --test tests/ }
  "soak" { node tests/soak.js }
  "dev"  { npx wrangler dev --port 8787 --ip 127.0.0.1 }
  "room" { node tests/room.int.js }   # needs "dev" running in another terminal
  default { "usage: .\run.ps1 test | soak | dev | room" }
}
