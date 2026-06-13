@echo off
chcp 65001 >nul
title NATIVA - Instalacao
echo ============================================
echo   Instalacao do NATIVA (servidor local)
echo ============================================
echo.

:: precisa ser administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Execute este arquivo como Administrador.
  echo Clique com o botao direito em "instalar.bat" e escolha
  echo "Executar como administrador".
  echo.
  pause
  exit /b 1
)

:: verifica node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Node.js nao foi encontrado neste computador.
  echo Instale o Node.js (versao 22 ou superior) em https://nodejs.org
  echo e execute este instalador novamente.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do echo Node.js encontrado: %%v

:: regra de firewall do Windows para a porta 3000
echo.
echo Verificando firewall do Windows...
netsh advfirewall firewall show rule name="NATIVA Node 3000" >nul 2>&1
if %errorLevel% neq 0 (
  netsh advfirewall firewall add rule name="NATIVA Node 3000" dir=in action=allow protocol=TCP localport=3000 >nul
  echo Regra de firewall criada para a porta 3000.
) else (
  echo Regra de firewall ja existia.
)

:: pasta de dados
if not exist "%~dp0data" mkdir "%~dp0data"

echo.
set /p autoiniciar="Iniciar o NATIVA automaticamente quando o Windows ligar? (S/N) "
if /i "%autoiniciar%"=="S" (
  schtasks /create /tn "NATIVA Servidor" /tr "\"%~dp0iniciar-servidor.bat\"" /sc onlogon /rl highest /f >nul
  echo Tarefa "NATIVA Servidor" criada - o servidor inicia ao fazer login no Windows.
)

echo.
echo ============================================
echo   Instalacao concluida!
echo ============================================
echo.
echo ATENCAO: se este computador tiver antivirus com firewall
echo proprio (AVG, McAfee, Norton, etc.), libere o "node.exe"
echo (normalmente em C:\Program Files\nodejs\node.exe) para
echo conexoes de entrada na porta 3000 nas configuracoes do
echo firewall do antivirus.
echo.
echo Para iniciar o servidor agora, execute "iniciar-servidor.bat".
echo.
pause
