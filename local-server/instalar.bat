@echo off
title NATIVA - Instalacao
echo ============================================
echo   Instalacao do NATIVA (servidor local)
echo ============================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 goto :precisaadmin

where node >nul 2>&1
if %errorLevel% neq 0 goto :sememnode

for /f "tokens=*" %%v in ('node --version') do echo Node.js encontrado: %%v

echo.
echo Verificando firewall do Windows...
netsh advfirewall firewall show rule name="NATIVA Node 3000" >nul 2>&1
if %errorLevel% neq 0 goto :criarregra
echo Regra de firewall ja existia.
goto :pastadata

:criarregra
netsh advfirewall firewall add rule name="NATIVA Node 3000" dir=in action=allow protocol=TCP localport=3000 >nul
echo Regra de firewall criada para a porta 3000.

:pastadata
if not exist "%~dp0data" mkdir "%~dp0data"

echo.
set /p autoiniciar=Iniciar o NATIVA automaticamente quando o Windows ligar? (S/N)
if /i "%autoiniciar%" neq "S" goto :fim

set TAREFA_CMD="%~dp0iniciar-servidor.bat"
schtasks /create /tn "NATIVA Servidor" /tr %TAREFA_CMD% /sc onlogon /rl highest /f >nul
echo Tarefa NATIVA Servidor criada - o servidor inicia ao fazer login no Windows.

:fim
echo.
echo ============================================
echo   Instalacao concluida!
echo ============================================
echo.
echo ATENCAO: se este computador tiver antivirus com firewall
echo proprio (AVG, McAfee, Norton, etc.), libere o node.exe
echo (normalmente em C:\Program Files\nodejs\node.exe) para
echo conexoes de entrada na porta 3000 nas configuracoes do
echo firewall do antivirus.
echo.
echo Para iniciar o servidor agora, execute iniciar-servidor.bat
echo.
pause
exit /b 0

:precisaadmin
echo [ERRO] Execute este arquivo como Administrador.
echo Clique com o botao direito em instalar.bat e escolha
echo Executar como administrador.
echo.
pause
exit /b 1

:sememnode
echo [ERRO] Node.js nao foi encontrado neste computador.
echo Instale o Node.js (versao 22 ou superior) em https://nodejs.org
echo e execute este instalador novamente.
echo.
pause
exit /b 1
