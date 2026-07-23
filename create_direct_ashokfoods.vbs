Set WshShell = CreateObject("WScript.Shell")
Set sc = WshShell.CreateShortcut("C:\Users\Kandr\Desktop\ashokfoods.lnk")
sc.TargetPath = "C:\Users\Kandr\Documents\Codex\2026-07-04\kitchen-os-master-build-prompt-for\Start Kitchen OS.vbs"
sc.WorkingDirectory = "C:\Users\Kandr\Documents\Codex\2026-07-04\kitchen-os-master-build-prompt-for"
sc.WindowStyle = 1
sc.IconLocation = "C:\Users\Kandr\Documents\Codex\2026-07-04\kitchen-os-master-build-prompt-for\public\logo.ico"
sc.Save()
WScript.Echo "ASHOKFOODS SHORTCUT UPDATED SUCCESSFULLY"
