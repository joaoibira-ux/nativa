@echo off
chcp 65001 >nul
title NATIVA - Servidor
cd /d "%~dp0"

where node >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Node.js nao foi encontrado neste computador.
  echo Instale o Node.js (versao 22 ou superior) em https://nodejs.org
  pause
  exit /b 1
)

echo Iniciando servidor NATIVA...
echo (deixe esta janela aberta enquanto o sistema estiver em uso)
echo.
node server.js

echo.
echo O servidor foi encerrado.
pause
