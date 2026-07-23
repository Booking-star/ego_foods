Set WshShell = CreateObject("WScript.Shell")
Set sc = WshShell.CreateShortcut("C:\Users\Kandr\Desktop\ashokfoods.lnk")
sc.TargetPath = "C:\Windows\System32\wscript.exe"
sc.Arguments = """C:\Users\Kandr\Documents\Codex\2026-07-04\kitchen-os-master-build-prompt-for\Start Kitchen OS.vbs"""
sc.WorkingDirectory = "C:\Users\Kandr\Documents\Codex\2026-07-04\kitchen-os-master-build-prompt-for"
sc.IconLocation = "C:\Users\Kandr\Documents\Codex\2026-07-04\kitchen-os-master-build-prompt-for\public\logo.ico"
sc.Save()
WScript.Echo "ASHOKFOODS SHORTCUT CREATED ON DESKTOP"
