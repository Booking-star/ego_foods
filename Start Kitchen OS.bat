@echo off
cd /d "C:\Users\Kandr\Documents\Codex\2026-07-04\kitchen-os-master-build-prompt-for"
taskkill /f /im electron.exe >nul 2>&1
start "" node_modules\electron\dist\electron.exe .
