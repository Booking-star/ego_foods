$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$shell = New-Object -ComObject WScript.Shell

# Stop any zombie electron processes
$electronProcesses = Get-Process electron -ErrorAction SilentlyContinue
if ($electronProcesses) {
  Stop-Process -Name electron -Force -ErrorAction SilentlyContinue
}

# Check if port 5173 is already in use (Vite is active)
$portActive = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
Set-Location $projectDir

# Clean launch or port active, run local electron binary directly
if (-not (Test-Path "node_modules")) {
  npm install
}
& "node_modules\electron\dist\electron.exe" .
