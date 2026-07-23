$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$launcherPath = Join-Path $projectDir 'Start Kitchen OS.vbs'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Kitchen OS - Ego Foods.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.Arguments = "`"$launcherPath`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.WindowStyle = 7
$shortcut.IconLocation = Join-Path $projectDir 'public\logo.ico'
$shortcut.Save()

Write-Host "Created shortcut: $shortcutPath"
