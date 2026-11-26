# Stellarchy: .\run.ps1 test | soak | dev | room | e2e | phone | measure
param([string]$cmd = "test")
$node = "$env:USERPROFILE\Documents\tools\node\node-v26.13.1-win-x64"
if (Test-Path $node) { $env:PATH = "$node;$env:PATH" }
Set-Location $PSScriptRoot
switch ($cmd) {
  "test" { node tools/sync.mjs; node --test tests/ }
  "soak" { node tests/soak.js }
  "dev"  { node tools/sync.mjs; npx wrangler dev --port 8787 --ip 127.0.0.1 }
  "room" { node tests/room.int.js }   # needs "dev" running in another terminal
  "e2e"  { node tools/sync.mjs; node tests/e2e.mjs }   # headless Edge; starts its own server on port 8788
  "phone" { node tools/sync.mjs; node tools/phone.mjs }   # play on your phone over home Wi-Fi (port 8790, QR code)
  "measure" { node tools/sync.mjs; node tests/measure.mjs }
  default { "usage: .\run.ps1 test | soak | dev | room | e2e | phone" }
}
