# Liga o robo do WhatsApp escondido (sem janela preta) e mostra um
# iconezinho na bandeja do sistema (perto do relogio) pra confirmar que
# esta rodando. Clique direito no icone pra ver o log ou sair.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$pastaAqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $pastaAqui

# Sobe o robo de verdade (node index.js) escondido, guardando o log num
# arquivo pra poder conferir depois se algo der errado.
$processo = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c npm start > log.txt 2>&1" `
  -WindowStyle Hidden `
  -PassThru

$icone = New-Object System.Windows.Forms.NotifyIcon
$icone.Icon = [System.Drawing.SystemIcons]::Application
$icone.Text = "FinancePro WhatsApp - Ativo"
$icone.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemLog = $menu.Items.Add("Abrir log")
$itemLog.Add_Click({
  Start-Process notepad.exe (Join-Path $pastaAqui "log.txt")
})

$itemSair = $menu.Items.Add("Sair (desligar o robo)")
$itemSair.Add_Click({
  if (!$processo.HasExited) {
    Stop-Process -Id $processo.Id -Force -ErrorAction SilentlyContinue
  }
  # node index.js roda DENTRO do cmd.exe pai — mata qualquer node.exe
  # filho tambem, senao ele continua rodando escondido mesmo depois de
  # "Sair".
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.ParentProcessId -eq $processo.Id } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  $icone.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$icone.ContextMenuStrip = $menu
$icone.ShowBalloonTip(4000, "FinancePro WhatsApp", "Robo ligado e escutando o grupo.", [System.Windows.Forms.ToolTipIcon]::Info)

[System.Windows.Forms.Application]::Run()
