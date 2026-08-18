' Liga o robô do WhatsApp escondido, com um ícone na bandeja do sistema
' (perto do relógio) mostrando que está ativo. Clique direito nesse
' ícone pra ver o log ou desligar.
Set objShell = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = pasta
objShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & pasta & "\iniciar-com-icone.ps1""", 0, False
