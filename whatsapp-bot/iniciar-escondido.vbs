' Liga o robô do WhatsApp sem abrir nenhuma janela preta na tela — ele
' continua rodando escondido em segundo plano. Pra desligar de verdade,
' precisa fechar pelo Gerenciador de Tarefas (procura por "node.exe").
Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.Run "cmd /c npm start > log.txt 2>&1", 0, False
